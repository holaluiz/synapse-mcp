import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSynapseServer, VERSION } from "../dist/index.js";
import { useFreshDatabase } from "./helpers.mjs";

const EXPECTED_TOOLS = [
  "synapse_claim_task",
  "synapse_release_task",
  "synapse_get_tasks",
  "synapse_record_decision",
  "synapse_record_knowledge",
  "synapse_query_memory",
  "synapse_record_unknown",
  "synapse_investigate_unknown",
  "synapse_resolve_unknown",
  "synapse_list_unknowns",
  "synapse_handoff_task",
  "synapse_recommend_agent",
  "synapse_get_active_agents",
  "synapse_get_activity",
];

let env;
let client;

before(async () => {
  env = useFreshDatabase();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createSynapseServer().connect(serverTransport);
  client = new Client({ name: "synapse-test", version: "0.0.0" });
  await client.connect(clientTransport);
});

after(async () => {
  await client.close();
  env.cleanup();
});

const call = (name, args = {}) => client.callTool({ name, arguments: args });
const parse = (result) => JSON.parse(result.content[0].text);

test("advertises every tool with read-only hints on queries", async () => {
  assert.equal(client.getServerVersion().version, VERSION);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...EXPECTED_TOOLS].sort());

  const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort();
  assert.deepEqual(readOnly, [
    "synapse_get_active_agents",
    "synapse_get_activity",
    "synapse_get_tasks",
    "synapse_list_unknowns",
    "synapse_query_memory",
    "synapse_recommend_agent",
  ]);
});

test("claim, collide, hand off and release over MCP", async () => {
  const claimed = await call("synapse_claim_task", {
    agent_name: "antigravity",
    title: "Refactor auth",
    lock_patterns: ["src/auth/**"],
  });
  assert.ok(!claimed.isError);
  const taskId = parse(claimed).task.id;

  const collision = await call("synapse_claim_task", {
    agent_name: "codex",
    title: "Tweak login",
    lock_patterns: ["src/auth/login.ts"],
  });
  assert.equal(collision.isError, true);
  assert.match(collision.content[0].text, /File lock collision detected/);

  const hijack = await call("synapse_release_task", { agent_name: "codex", task_id: taskId, summary: "mine now" });
  assert.equal(hijack.isError, true);

  const handoff = await call("synapse_handoff_task", {
    from_agent: "antigravity",
    to_agent: "claude-code",
    task_id: taskId,
    handoff_notes: "Run the tests",
  });
  assert.ok(!handoff.isError);

  const board = parse(await call("synapse_get_tasks"));
  assert.equal(board.tasks[0].handoff_notes, "Run the tests");
  assert.equal(board.activeLocks[0].agent_name, "claude-code");

  const released = await call("synapse_release_task", { agent_name: "claude-code", task_id: taskId, summary: "green" });
  assert.ok(!released.isError);

  const activity = parse(await call("synapse_get_activity", { limit: 2 }));
  assert.deepEqual(activity.map((a) => a.action), ["RELEASE_TASK", "HANDOFF_TASK"]);

  const agents = parse(await call("synapse_get_active_agents"));
  assert.deepEqual(agents.active_agents.map((a) => a.name).sort(), ["antigravity", "claude-code", "codex"]);
});

test("unknown lifecycle over MCP", async () => {
  const unk = parse(await call("synapse_record_unknown", { agent_name: "a", question: "Why?", severity: "high" })).unknown;
  assert.ok(!(await call("synapse_investigate_unknown", { agent_name: "b", unknown_id: unk.id })).isError);
  assert.equal((await call("synapse_investigate_unknown", { agent_name: "c", unknown_id: unk.id })).isError, true);
  assert.ok(!(await call("synapse_resolve_unknown", { agent_name: "b", unknown_id: unk.id, resolution: "Because." })).isError);
  assert.equal((await call("synapse_resolve_unknown", { agent_name: "b", unknown_id: "unk-missing", resolution: "x" })).isError, true);
  assert.equal(parse(await call("synapse_list_unknowns", { status: "resolved" }))[0].resolved_by, "b");
});
