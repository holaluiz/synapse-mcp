# 🛠️ Synapse MCP Complete Tools Reference

Every tool exposed by Synapse MCP is registered through the official `@modelcontextprotocol/sdk` and strongly typed with Zod.

---

## 1. Task & Anti-Collision Tools

### `synapse_claim_task`
Claims a task and optionally locks file patterns to prevent other agents from modifying them concurrently.

**Inputs:**
- `agent_name` (string, required): Name of your agent (`"claude-code"`, `"antigravity"`, `"codex"`).
- `title` (string, required): Short summary of the task.
- `description` (string, optional): Detailed specifications, requirements, and scope.
- `lock_patterns` (array of strings, optional): Files or globs to lock (e.g. `["src/api/**", "package.json"]`).

**Output:**
JSON containing assigned `task_id`, acquired locks, or a collision error if another agent already holds the lock.

---

### `synapse_release_task`
Marks a task as completed, blocked, or pending, and releases all acquired file locks.

**Inputs:**
- `agent_name` (string, required): Agent releasing the task.
- `task_id` (string, required): The ID of the task.
- `summary` (string, required): Summary of achievements or reasons for release.
- `status` (enum, optional): `"completed"` (default), `"blocked"`, or `"pending"`.

---

### `synapse_get_tasks`
Lists all active, pending, or blocked tasks across all agents, alongside currently locked files.

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
Queries decisions and knowledge entries using keyword or category filtering.

**Inputs:**
- `query` (string, optional): Search keyword.
- `category` (string, optional): Category filter.

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

### `synapse_resolve_unknown`
Closes an open gap with a verified explanation or fix.

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
Transfers task assignment and associated file locks to another agent with handoff instructions.

**Inputs:**
- `from_agent` (string, required): Origin agent.
- `to_agent` (string, required): Target agent.
- `task_id` (string, required): Task ID to transfer.
- `handoff_notes` (string, required): Context and instructions for the recipient.

---

### `synapse_recommend_agent`
Evaluates a task description against the agent capability matrix to recommend the optimal AI agent.

**Inputs:**
- `task_description` (string, required): Description of the task.

---

### `synapse_get_active_agents`
Returns a list of all agents that sent a heartbeat within the last 15 minutes.

**Inputs:** None.
