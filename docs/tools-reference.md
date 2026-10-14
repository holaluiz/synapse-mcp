# 🛠️ Synapse MCP Complete Tools Reference

Every tool exposed by Synapse MCP is registered through the official `@modelcontextprotocol/sdk` and strongly typed with Zod (schemas live in [`src/contracts/types.ts`](../src/contracts/types.ts)). Read-only tools carry the MCP `readOnlyHint` annotation. Failures (collisions, unknown IDs, ownership violations) are returned as tool results with `isError: true` and a human-readable explanation.

**Agent identity:** `agent_name` comparisons ignore case and treat `_`, spaces and `-` alike, so `claude_code` and `Claude-Code` are the same agent. Use a distinct name per concurrent session (e.g. `claude-code-2`), because an agent never collides with its own locks.

---

## 1. Task & Anti-Collision Tools

### `synapse_claim_task`
Claims a task and optionally locks file patterns to prevent other agents from modifying them concurrently.

**Inputs:**
- `agent_name` (string, required): Name of your agent (`"claude-code"`, `"antigravity"`, `"codex"`).
- `title` (string, required): Short summary of the task.
- `description` (string, optional): Detailed specifications, requirements, and scope.
- `lock_patterns` (array of strings, optional): Files, directories or globs to lock (e.g. `["src/api/**", "package.json"]`).

**Lock pattern semantics:**

| Pattern | Covers |
| :--- | :--- |
| `src/index.ts` | That file only (last segment has an extension) |
| `src/auth`, `.github` | The directory and everything below it |
| `src/v1.2/` | Trailing slash: always a directory subtree (same as `src/v1.2/**`) |
| `src/*.ts` | Direct children of `src` ending in `.ts` |
| `src/**/*.test.ts`, `src/{auth,user}/**` | Standard `*`, `?`, `**`, `[ab]` and `{a,b}` globs |

Two claims collide when their patterns **could match a common path**: `src/auth/**` collides with `src/auth/login.ts` and with `src/*/login.ts`, but not with `src/billing/**`. Matching is case-insensitive, `\` and `/` are equivalent, and absolute paths inside the workspace are converted to workspace-relative ones. When two globs are both wildcarded the check is conservative: it may report a collision that cannot happen, but it never misses one.

**Output:**
JSON containing the new task (with its normalized `locked_patterns`), or an error naming each conflicting pattern, the holding agent and task, and how long ago the holder was last seen.

---

### `synapse_release_task`
Marks a task as completed, blocked, or pending, and releases all acquired file locks. Only the task owner may release it.

**Inputs:**
- `agent_name` (string, required): Agent releasing the task.
- `task_id` (string, required): The ID of the task.
- `summary` (string, required): Summary of achievements or reasons for release.
- `status` (enum, optional): `"completed"` (default), `"blocked"`, or `"pending"`.
- `force` (boolean, optional): Release a task owned by another agent, e.g. after that agent crashed and left stale locks. Recorded as `FORCE_RELEASE_TASK` in the activity log; confirm the owner is really gone first.

---

### `synapse_get_tasks`
Lists all active, pending, or blocked tasks across all agents (including the latest `handoff_notes`), alongside currently locked files.

**Inputs:** None.

---

## 2. Shared Memory & Knowledge Tools

### `synapse_record_decision`
Records an Architectural Decision Record (ADR). Use this whenever choosing a library, designing a database schema, or establishing a project pattern.

**Inputs:**
- `agent_name` (string, required): Authoring agent.
- `title` (string, required): Short descriptive title.
- `context` (string, required): Rationale and alternatives evaluated.
- `decision` (string, required): The exact approach chosen.
- `consequences` (string, optional): Trade-offs, drawbacks, or future obligations.

---

### `synapse_record_knowledge`
Stores reusable project knowledge, API secrets caveats, configuration patterns, or conventions.

**Inputs:**
- `agent_name` (string, required): Authoring agent.
- `category` (string, required): e.g. `"architecture"`, `"api"`, `"testing"`.
- `topic` (string, required): Specific topic.
- `content` (string, required): The markdown or text content.
- `tags` (array of strings, optional): Tags for search indexing.

---

### `synapse_query_memory`
Queries decisions and knowledge entries using keyword or category filtering. Every whitespace-separated word in `query` must appear (case-insensitively) in at least one field: title, context, decision and consequences for ADRs; topic, content and tags for knowledge. Returns up to 20 of each, newest first.

**Inputs:**
- `query` (string, optional): Search keywords.
- `category` (string, optional): Knowledge category filter.

---

## 3. Unknowns & Investigation Gaps (Inspired by REA)

### `synapse_record_unknown`
Flags an unresolved question, unexplained error, or missing specification so another agent can pick it up.

**Inputs:**
- `agent_name` (string, required): Reporting agent.
- `question` (string, required): The unanswered question or issue.
- `context` (string, optional): Reproduction steps or affected files.
- `severity` (enum, optional): `"low"`, `"medium"`, `"high"`, `"critical"` (default: `"medium"`).

---

### `synapse_investigate_unknown`
Marks an open gap as `investigating` and records you as its investigator, so other agents don't duplicate the work. Fails if the gap is resolved or another agent is already investigating it.

**Inputs:**
- `agent_name` (string, required): Agent taking the investigation.
- `unknown_id` (string, required): ID of the unknown.

---

### `synapse_resolve_unknown`
Closes an open or investigating gap with a verified explanation or fix. Fails if the gap was already resolved.

**Inputs:**
- `agent_name` (string, required): Resolving agent.
- `unknown_id` (string, required): ID of the unknown.
- `resolution` (string, required): Detailed solution or explanation.

---

### `synapse_list_unknowns`
Returns all open or investigating gaps, sorted by severity.

**Inputs:**
- `status` (enum, optional): `"open"`, `"investigating"`, `"resolved"`, `"all"` (default: `"open"`).

---

## 4. Routing & Presence Tools

### `synapse_handoff_task`
Transfers task assignment and associated file locks to another agent with handoff instructions. Only the current owner can hand a task off, and completed tasks cannot be handed off. The notes are stored on the task and shown to the receiver by `synapse_get_tasks`.

**Inputs:**
- `from_agent` (string, required): Origin agent.
- `to_agent` (string, required): Target agent.
- `task_id` (string, required): Task ID to transfer.
- `handoff_notes` (string, required): Context and instructions for the recipient.

---

### `synapse_recommend_agent`
Evaluates a task description against the agent capability matrix to recommend the optimal AI agent. Keywords are matched against whole words (short ones like `ci` or `ui` exactly, longer ones as word prefixes, so `test` matches `testing` but not `latest`); the agent with the most matches wins.

**Inputs:**
- `task_description` (string, required): Description of the task.

**Output:** `recommended_agent`, `rationale`, `matched_keywords`, and the full capability `matrix`.

---

### `synapse_get_active_agents`
Returns a list of all agents that sent a heartbeat within the last 15 minutes. Every write tool counts as a heartbeat.

**Inputs:** None.

---

### `synapse_get_activity`
Reads the append-only audit trail (`CLAIM_TASK`, `RELEASE_TASK`, `FORCE_RELEASE_TASK`, `HANDOFF_TASK`, `RECORD_DECISION`, `RECORD_KNOWLEDGE`, `RECORD_UNKNOWN`, `INVESTIGATE_UNKNOWN`, `RESOLVE_UNKNOWN`), newest first.

**Inputs:**
- `limit` (integer 1–100, optional): Maximum entries (default `20`).
- `agent_name` (string, optional): Only entries from this agent.
- `since` (string, optional): ISO-8601 timestamp; only entries at or after it. Useful to catch up on what other agents did while you were away.
