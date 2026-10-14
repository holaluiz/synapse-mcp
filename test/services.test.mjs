import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivityService,
  MemoryService,
  RouterService,
  SCHEMA_VERSION,
  TaskService,
  UnknownService,
  closeDatabase,
  getDatabase,
} from "../dist/index.js";
import { useFreshDatabase } from "./helpers.mjs";

let env;
beforeEach(() => {
  env = useFreshDatabase();
});
afterEach(() => {
  env.cleanup();
});

describe("TaskService.claimTask", () => {
  test("rejects a claim whose patterns overlap another agent's locks", () => {
    const first = TaskService.claimTask({ agent_name: "antigravity", title: "auth", lock_patterns: ["src/auth/**"] });
    assert.equal(first.ok, true);

    const second = TaskService.claimTask({ agent_name: "codex", title: "login", lock_patterns: ["src/auth/login.ts"] });
    assert.equal(second.ok, false);
    assert.match(second.error, /locked by antigravity/);
    assert.match(second.error, new RegExp(first.task.id));
    assert.equal(second.conflictingLocks.length, 1);
    assert.equal(second.conflictingLocks[0].pattern, "src/auth/**");
  });

  test("allows disjoint claims", () => {
    assert.equal(TaskService.claimTask({ agent_name: "a", title: "x", lock_patterns: ["src/auth/**"] }).ok, true);
    assert.equal(TaskService.claimTask({ agent_name: "b", title: "y", lock_patterns: ["src/billing/**"] }).ok, true);
  });

  test("lets the same agent extend its own locks, ignoring name spelling", () => {
    assert.equal(TaskService.claimTask({ agent_name: "claude-code", title: "x", lock_patterns: ["src/**"] }).ok, true);
    assert.equal(TaskService.claimTask({ agent_name: "Claude_Code", title: "y", lock_patterns: ["src/a.ts"] }).ok, true);
  });

  test("stores normalized, de-duplicated patterns", () => {
    const res = TaskService.claimTask({ agent_name: "a", title: "x", lock_patterns: ["./src/auth", "src\\auth", "README.md"] });
    assert.deepEqual(res.task.locked_patterns, ["src/auth", "README.md"]);
    const { activeLocks } = TaskService.getActiveTasks();
    assert.deepEqual(activeLocks.map((l) => l.pattern).sort(), ["README.md", "src/auth"]);
  });
});

describe("TaskService.releaseTask", () => {
  test("reports unknown tasks instead of claiming success", () => {
    const res = TaskService.releaseTask({ agent_name: "a", task_id: "task-missing", summary: "x" });
    assert.equal(res.ok, false);
    assert.match(res.message, /not found/);
  });

  test("only the owner can release, unless forced", () => {
    const { task } = TaskService.claimTask({ agent_name: "antigravity", title: "x", lock_patterns: ["src/**"] });

    const denied = TaskService.releaseTask({ agent_name: "codex", task_id: task.id, summary: "hijack" });
    assert.equal(denied.ok, false);
    assert.match(denied.message, /assigned to antigravity/);
    assert.equal(TaskService.getActiveTasks().activeLocks.length, 1);

    const forced = TaskService.releaseTask({ agent_name: "codex", task_id: task.id, summary: "stale", force: true });
    assert.equal(forced.ok, true);
    assert.equal(TaskService.getActiveTasks().activeLocks.length, 0);
    assert.equal(ActivityService.list({ limit: 1 })[0].action, "FORCE_RELEASE_TASK");

    // The freed patterns can now be claimed by someone else
    assert.equal(TaskService.claimTask({ agent_name: "codex", title: "y", lock_patterns: ["src/a.ts"] }).ok, true);
  });

  test("owner release frees locks and records status", () => {
    const { task } = TaskService.claimTask({ agent_name: "a", title: "x", lock_patterns: ["src/**"] });
    const res = TaskService.releaseTask({ agent_name: "a", task_id: task.id, summary: "done", status: "blocked" });
    assert.equal(res.ok, true);
    const { tasks, activeLocks } = TaskService.getActiveTasks();
    assert.equal(activeLocks.length, 0);
    assert.equal(tasks.find((t) => t.id === task.id).status, "blocked");
  });
});

describe("RouterService.handoffTask", () => {
  test("transfers ownership, locks and notes", () => {
    const { task } = TaskService.claimTask({ agent_name: "antigravity", title: "x", lock_patterns: ["src/auth/**"] });
    const res = RouterService.handoffTask({
      from_agent: "antigravity",
      to_agent: "claude-code",
      task_id: task.id,
      handoff_notes: "Schema done. Run the test suite.",
    });
    assert.equal(res.ok, true);

    const { tasks, activeLocks } = TaskService.getActiveTasks();
    const moved = tasks.find((t) => t.id === task.id);
    assert.equal(moved.assigned_agent, "claude-code");
    assert.equal(moved.handoff_notes, "Schema done. Run the test suite.");
    assert.equal(activeLocks[0].agent_name, "claude-code");

    // The receiver now owns it and can release it
    assert.equal(TaskService.releaseTask({ agent_name: "claude-code", task_id: task.id, summary: "ok" }).ok, true);
  });

  test("rejects handoffs from non-owners and of completed tasks", () => {
    const { task } = TaskService.claimTask({ agent_name: "antigravity", title: "x" });
    const denied = RouterService.handoffTask({ from_agent: "codex", to_agent: "codex", task_id: task.id, handoff_notes: "" });
    assert.equal(denied.ok, false);

    TaskService.releaseTask({ agent_name: "antigravity", task_id: task.id, summary: "done" });
    const done = RouterService.handoffTask({ from_agent: "antigravity", to_agent: "codex", task_id: task.id, handoff_notes: "" });
    assert.equal(done.ok, false);
    assert.match(done.message, /already completed/);
  });
});

describe("RouterService.recommendAgent", () => {
  const cases = [
    ["Fix the failing tests and rebase onto main", "claude_code"],
    ["Design the circuit diagram for the login page", "antigravity"],
    ["Write a parser for the CSV export", "codex"],
    ["Build the React component library", "antigravity"],
    ["Something completely unrelated", "antigravity"],
  ];
  for (const [description, expected] of cases) {
    test(`'${description}' -> ${expected}`, () => {
      assert.equal(RouterService.recommendAgent(description).recommended_agent, expected);
    });
  }

  test("does not match keywords inside other words", () => {
    const res = RouterService.recommendAgent("Review the latest decision about the circuit");
    assert.deepEqual(res.matched_keywords, []);
  });
});

describe("UnknownService", () => {
  test("open -> investigating -> resolved, with ownership", () => {
    const gap = UnknownService.recordUnknown({ agent_name: "a", question: "Token window?", severity: "high" });

    assert.equal(UnknownService.investigateUnknown({ agent_name: "b", unknown_id: gap.id }).ok, true);
    const busy = UnknownService.investigateUnknown({ agent_name: "c", unknown_id: gap.id });
    assert.equal(busy.ok, false);
    assert.match(busy.message, /already being investigated by b/);

    const [listed] = UnknownService.listUnknowns("investigating");
    assert.equal(listed.investigator, "b");

    assert.equal(UnknownService.resolveUnknown({ agent_name: "b", unknown_id: gap.id, resolution: "15 min" }).ok, true);
    const again = UnknownService.resolveUnknown({ agent_name: "c", unknown_id: gap.id, resolution: "other" });
    assert.equal(again.ok, false);
    assert.equal(UnknownService.listUnknowns("resolved")[0].resolution, "15 min");
  });

  test("lists open gaps most severe first", () => {
    UnknownService.recordUnknown({ agent_name: "a", question: "low one", severity: "low" });
    UnknownService.recordUnknown({ agent_name: "a", question: "critical one", severity: "critical" });
    UnknownService.recordUnknown({ agent_name: "a", question: "medium one" });
    assert.deepEqual(
      UnknownService.listUnknowns("open").map((u) => u.severity),
      ["critical", "medium", "low"]
    );
  });
});

describe("MemoryService.queryMemory", () => {
  beforeEach(() => {
    MemoryService.recordDecision({
      agent_name: "a",
      title: "Use Argon2id",
      context: "Password hashing for auth",
      decision: "Argon2id with default params",
      consequences: "Slower logins under load",
    });
    MemoryService.recordKnowledge({ agent_name: "a", category: "api", topic: "Rate limits", content: "100% of calls are throttled", tags: ["throttling"] });
    MemoryService.recordKnowledge({ agent_name: "a", category: "testing", topic: "Fixtures", content: "Use factories" });
  });

  test("requires every term to match some field", () => {
    assert.equal(MemoryService.queryMemory({ query: "argon2id auth" }).decisions.length, 1);
    assert.equal(MemoryService.queryMemory({ query: "argon2id billing" }).decisions.length, 0);
    assert.equal(MemoryService.queryMemory({ query: "slower" }).decisions.length, 1, "consequences are searchable");
  });

  test("searches tags and filters by category", () => {
    assert.equal(MemoryService.queryMemory({ query: "throttling" }).knowledge.length, 1);
    assert.equal(MemoryService.queryMemory({ category: "testing" }).knowledge.length, 1);
    assert.equal(MemoryService.queryMemory({ category: "testing", query: "rate" }).knowledge.length, 0);
  });

  test("treats LIKE wildcards in the query literally", () => {
    assert.equal(MemoryService.queryMemory({ query: "100%" }).knowledge.length, 1);
    assert.equal(MemoryService.queryMemory({ query: "%" }).knowledge.length, 1);
    assert.equal(MemoryService.queryMemory({ query: "_" }).knowledge.length, 0);
  });
});

describe("ActivityService.list", () => {
  test("returns newest first, with agent filter and limit", () => {
    TaskService.claimTask({ agent_name: "claude_code", title: "one" });
    TaskService.claimTask({ agent_name: "codex", title: "two" });
    TaskService.claimTask({ agent_name: "claude-code", title: "three" });

    const all = ActivityService.list();
    assert.equal(all.length, 3);
    assert.match(all[0].details, /three/);

    const mine = ActivityService.list({ agent_name: "Claude-Code" });
    assert.equal(mine.length, 2);
    assert.equal(ActivityService.list({ limit: 1 }).length, 1);
    assert.equal(ActivityService.list({ since: "2999-01-01T00:00:00Z" }).length, 0);
  });
});

describe("schema migration", () => {
  test("upgrades a v1 database in place without losing rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "synapse-migrate-"));
    const dbPath = join(dir, "brain.db");
    try {
      const legacy = new DatabaseSync(dbPath);
      legacy.exec(`
        CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, assigned_agent TEXT,
          status TEXT DEFAULT 'pending', locked_patterns TEXT, created_at DATETIME, updated_at DATETIME);
        CREATE TABLE unknowns (id TEXT PRIMARY KEY, question TEXT NOT NULL, context TEXT, severity TEXT DEFAULT 'medium',
          status TEXT DEFAULT 'open', resolution TEXT, author_agent TEXT NOT NULL, resolved_by TEXT,
          created_at DATETIME, resolved_at DATETIME);
        INSERT INTO tasks (id, title, assigned_agent, status, locked_patterns) VALUES ('task-old', 'legacy', 'a', 'in_progress', '[]');
      `);
      legacy.close();

      closeDatabase();
      const db = getDatabase(dbPath);
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
      const columns = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
      assert.ok(columns.includes("handoff_notes"));
      assert.equal(TaskService.getActiveTasks().tasks[0].id, "task-old");

      // Re-opening an up-to-date database is a no-op
      closeDatabase();
      getDatabase(dbPath);
    } finally {
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
