import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { TaskService, closeDatabase, getDatabase } from "../dist/index.js";
import { useFreshDatabase } from "./helpers.mjs";

const WORKER = fileURLToPath(new URL("./fixtures/claim-worker.mjs", import.meta.url));
const AGENTS = 8;

function startWorker(dbPath, agentName, pattern) {
  const child = spawn(process.execPath, ["--no-warnings", WORKER, dbPath, agentName, pattern], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise((resolve) => lines.once("line", resolve));
  const output = ready.then(
    () => new Promise((resolve) => lines.once("line", (line) => resolve(JSON.parse(line))))
  );
  // Wait for the process to exit too: on Windows it holds the database file until then
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const result = Promise.all([output, exited]).then(([parsed]) => parsed);
  return { child, ready, result };
}

test("exactly one of many concurrent processes wins overlapping locks", { timeout: 60_000 }, async () => {
  const env = useFreshDatabase();
  // Workers open their own connections; release ours so only they compete
  closeDatabase();
  try {
    // Half the agents ask for the directory glob, half for a file inside it
    const workers = Array.from({ length: AGENTS }, (_, i) =>
      startWorker(env.dbPath, `agent-${i}`, i % 2 === 0 ? "src/shared/**" : "src/shared/util.ts")
    );
    await Promise.all(workers.map((w) => w.ready));
    for (const w of workers) w.child.stdin.write("go\n");

    const results = await Promise.all(workers.map((w) => w.result));
    const winners = results.filter((r) => r.ok);
    assert.equal(winners.length, 1, `expected one winner, got ${JSON.stringify(results)}`);

    getDatabase(env.dbPath);
    const { activeLocks } = TaskService.getActiveTasks();
    assert.ok(activeLocks.length >= 1);
    assert.ok(activeLocks.every((l) => l.agent_name === winners[0].agent));
  } finally {
    env.cleanup();
  }
});
