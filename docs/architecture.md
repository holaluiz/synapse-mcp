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
- **Location:** `.synapse/brain.db` at the repository root.
- **WAL Mode (`PRAGMA journal_mode = WAL;`)**: Multiple readers can read from the database concurrently while a writer is appending changes, eliminating read/write contention.
- **Busy Timeout (`PRAGMA busy_timeout = 5000;`)**: If two agents attempt to write at the exact same millisecond, SQLite automatically waits up to 5 seconds before retrying, preventing lock timeouts.
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
7. **`activity_log`**: Append-only audit trail of every tool call and state transition.

---

## 4. Multi-Agent Anti-Collision Engine

When an agent claims a task via `synapse_claim_task`:
1. The agent submits a list of `lock_patterns` (e.g. `["src/auth/**", "prisma/schema.prisma"]`).
2. Synapse queries `file_locks` inside an atomic transaction.
3. If any pattern matches an existing lock held by another active agent, the claim is rejected with:
   - Name of the holding agent
   - Task ID
   - Timestamp when the lock was acquired
4. If no conflict exists, the locks are stored and assigned to the agent.
5. When the task is released via `synapse_release_task` or handed over via `synapse_handoff_task`, locks are atomically freed or transferred.
