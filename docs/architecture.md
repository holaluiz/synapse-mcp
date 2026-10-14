# 🏛️ Synapse MCP Architecture & Concurrency Model

This document outlines how Synapse MCP solves the multi-process memory isolation barrier across distinct AI agent runtimes (Claude Code, Antigravity, Codex, Cursor).

---

## 1. The Multi-Process Problem in MCP

In the Model Context Protocol (MCP) standard:
- AI agent hosts communicate with MCP servers via `stdio` (JSON-RPC over standard input/output).
- Each AI host launches its own independent child process.
- **Result:** If Claude Code, Antigravity, and Codex are active in the same workspace, there are **three separate Node.js processes**.
- Standard in-memory JavaScript variables (`Map`, `Set`, variables) are **not** shared between these processes.

---

## 2. The Storage Engine: Embedded SQLite WAL

To solve cross-process synchronization without requiring background daemons, Docker, or external cloud infrastructure, Synapse uses an embedded **SQLite database running in Write-Ahead Logging (WAL) mode**.

### Concurrency Guarantees
- **Location:** `.synapse/brain.db` at the workspace root: the nearest ancestor of the server's working directory containing `.git` or `.synapse`. Set `SYNAPSE_WORKSPACE=/path/to/repo` for clients that launch MCP servers from elsewhere (otherwise each agent could end up with its own database).
- **WAL Mode (`PRAGMA journal_mode = WAL;`)**: Multiple readers can read from the database concurrently while a writer is appending changes, eliminating read/write contention.
- **Busy Timeout (`PRAGMA busy_timeout = 5000;`)**: If two agents attempt to write at the exact same millisecond, SQLite automatically waits up to 5 seconds before retrying, preventing lock timeouts. It is set before switching to WAL, so even two agents opening a brand-new database at once wait instead of failing.
- **Write Transactions (`BEGIN IMMEDIATE`)**: Every check-then-write operation (claim, release, handoff, investigate/resolve unknown, schema migration) runs inside `withTransaction()`, which takes SQLite's write lock up front. A competing agent waits on `busy_timeout` and then sees the committed result, so a decision can never be made on stale data.
- **Zero Daemon Overhead**: Every agent process connects directly to the `.synapse/brain.db` file through the fast native `node:sqlite` driver in Node.js.

---

## 3. Database Schema

The SQLite schema consists of 7 normalized tables:

1. **`agents`**: Tracks active agents, their client platform, and heartbeats.
2. **`tasks`**: The shared task board with status (`pending`, `in_progress`, `completed`, `blocked`).
3. **`file_locks`**: Maps file paths/globs to owning tasks and agents to prevent collision.
4. **`decisions`**: Immutable Architectural Decision Records (ADRs).
5. **`knowledge`**: Free-form documentation, API patterns, and configuration tips.
6. **`unknowns`**: Open questions, missing requirements, and unexplained bug reports.
7. **`activity_log`**: Append-only audit trail of every state transition, readable through `synapse_get_activity`.

### Schema Migrations
The schema version is stored in `PRAGMA user_version`. On startup every process runs `CREATE TABLE IF NOT EXISTS …` and then `migrateSchema()` inside a write transaction, which adds any missing columns and bumps the version. Concurrent agents therefore never race on `ALTER TABLE`, and databases created by older releases are upgraded in place without losing rows.

| Version | Change |
| :---: | :--- |
| 1 | Initial schema |
| 2 | `tasks.handoff_notes`, `unknowns.investigator` |

---

## 4. Multi-Agent Anti-Collision Engine

When an agent claims a task via `synapse_claim_task`:
1. The agent submits a list of `lock_patterns` (e.g. `["src/auth/**", "prisma/schema.prisma"]`).
2. Patterns are normalized (`\` → `/`, `./` and `..` resolved, absolute workspace paths made relative, trailing `/` → `/**`) and de-duplicated.
3. Inside a `BEGIN IMMEDIATE` transaction, Synapse loads `file_locks` and checks every requested pattern against every lock held by **another** agent for **overlap**: whether the two globs could match at least one common path (see [lock pattern semantics](tools-reference.md#synapse_claim_task)).
4. If anything overlaps, the claim is rejected with the holding agent, the task ID, when the lock was acquired, and when the holder was last seen.
5. If no conflict exists, the task and its locks are inserted in the same transaction and committed.
6. When the task is released via `synapse_release_task` or handed over via `synapse_handoff_task`, locks are atomically freed or transferred. Both operations verify that the caller owns the task.

### Stale Locks
Locks are advisory and never expire on their own: an idle agent might simply be waiting for its user. When a holder crashes, its locks remain until someone clears them:
- `synapse doctor` lists locks whose holder has not been seen for 60+ minutes as **POSSIBLY STALE**.
- Collision errors report how long ago the holder was last seen.
- Another agent can call `synapse_release_task` with `force: true`. The override is logged as `FORCE_RELEASE_TASK`.
