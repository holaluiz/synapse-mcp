# 🤝 Multi-Agent Collaboration Workflows

How to maximize developer velocity by pairing **Antigravity**, **Claude Code**, and **Codex** on the same repository with Synapse MCP.

---

## The Three Agent Archetypes

```text
┌─────────────────────────────────┐
│     Antigravity (IDE Agent)     │
│   Architecture • UI • Refactor  │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│    Claude Code (CLI Agent)      │◄────►│      Codex / OpenAI Agent       │
│  Git • Tests • Unix Pipelines   │      │   Sandboxed Code & Algorithms   │
└─────────────────────────────────┘      └─────────────────────────────────┘
```

### 1. Antigravity (The Architect & UI Specialist)
- **Role:** System architecture, database migrations, complex component design, IDE multi-file edits with compiler/linter feedback.
- **Workflow:**
  1. Starts by claiming the architectural epic via `synapse_claim_task`.
  2. Records all technical decisions with `synapse_record_decision`.
  3. Scaffolds types, models, and core logic.
  4. Hands off test execution and git staging to Claude Code via `synapse_handoff_task`.

### 2. Claude Code (The Terminal & Test Runner)
- **Role:** Deep terminal interaction, executing large test suites, reviewing diffs, git branch management, and CI/CD troubleshooting.
- **Workflow:**
  1. Inspects active tasks via `synapse_get_tasks`.
  2. Runs test suites and diagnostic commands in the terminal.
  3. When an unexpected test fails, checks `synapse_list_unknowns` or files a new one.
  4. Finishes tasks with `synapse_release_task` and commits cleanly to git.

### 3. Codex (The Algorithmic Specialist)
- **Role:** Micro-utilities, standalone parsers, mathematical scripts, isolated function implementations.
- **Workflow:**
  1. Consults `synapse_query_memory` to understand conventions.
  2. Implements algorithms and utility functions.
  3. Logs knowledge snippets via `synapse_record_knowledge`.

---

## Best Practices

1. **Always Claim Before Writing**: Never begin modifying critical files without calling `synapse_claim_task`. This gives other agents immediate visibility and prevents collisions.
2. **Document Decisions Immediately**: Record an ADR (`synapse_record_decision`) whenever you make a non-obvious choice. It prevents other agents from reverting your decision.
3. **Don't Swallow Unknowns**: If an agent hits a wall or missing requirement, call `synapse_record_unknown` instead of guessing or hallucinating. Before digging into someone else's gap, call `synapse_investigate_unknown` so nobody duplicates the work.
4. **Catch Up Before Starting**: Call `synapse_get_activity` with `since` set to your last session to see what other agents claimed, handed off or decided while you were away.
5. **Lock Precisely**: Prefer `src/auth/**` or exact files over `**`. Overlapping patterns block each other, so an over-broad lock stalls every other agent.
6. **One Name per Session**: An agent never collides with its own locks. If you run two Claude Code sessions at once, name them distinctly (`claude-code`, `claude-code-2`).
