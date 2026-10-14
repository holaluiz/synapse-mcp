# AGENTS.md — Repository Guidelines for AI Assistants

When you are an AI assistant (such as Antigravity, Claude Code, Codex, or Cursor) working on or inside this repository, strictly adhere to the following architectural and operational rules.

---

## 1. Local Architecture & Safety Invariants

- **SQLite WAL Mode is Sacred**: Never alter `PRAGMA journal_mode = WAL` or remove `PRAGMA busy_timeout = 5000`. These settings are mandatory for multi-process concurrent access across active AI agents.
- **Node:SQLite Native Standard**: Do not add external native C++ SQLite packages like `better-sqlite3`. Synapse uses `node:sqlite` built into modern Node.js to guarantee zero compilation failures on Windows, macOS, and Linux.
- **File Lock Integrity**: Locks are advisory coordination barriers. Never perform blocking file deletions without releasing file locks through `TaskService.releaseTask` or `synapse_release_task`.

---

## 2. Multi-Agent Protocol & Context Hygiene

When coordinating through Synapse tools:
1. **Always Claim Before Modifying**: Call `synapse_claim_task` with specific `lock_patterns` before starting multi-file refactoring.
2. **Handle Collisions Gracefully**: If another agent holds a lock, do not retry blindly in an infinite loop. Inspect who owns the lock and wait or coordinate.
3. **Record Architectural Decisions**: If you introduce a library, alter a schema, or make a breaking convention, call `synapse_record_decision`.
4. **Log Unknowns**: If an error, API ambiguity, or missing test fixture blocks your task, call `synapse_record_unknown` with appropriate severity.

---

## 3. Code & Build Standards

- Always run `npm run build` (`tsc`) after code modifications, and `npm test` before handing work off.
- Any new check-then-write logic against the database must run inside `withTransaction()` (`BEGIN IMMEDIATE`); schema changes go through `migrateSchema()` with a `SCHEMA_VERSION` bump.
- Preserve backward-compatibility of tool inputs and outputs.
- Keep responses concise, structured, and free of superficial AI fluff.
