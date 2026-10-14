# Contributing to Synapse MCP

Thank you for your interest in contributing to **Synapse MCP**! We welcome bug fixes, documentation improvements, new AI client adapters, and multi-agent coordination enhancements.

---

## 1. Guiding Principles

- **Local-Only & Self-Contained**: Synapse must never depend on remote cloud servers or daemons to coordinate agents. All synchronization occurs through embedded SQLite WAL.
- **Fail-Safe Idempotency**: All operations, schema migrations, and client setup writes must be safely repeatable without data loss or corruption.
- **Agent Neutrality**: No single AI client (Claude Code, Antigravity, Codex, Cursor) should be favored at the expense of others. Tools must output clean, structured, and parseable JSON-RPC.
- **Performance First**:
  1. *Token Economy*: Return compact, informative summaries to preserve agent context windows.
  2. *Latency*: SQLite WAL queries must resolve in single-digit milliseconds.
  3. *Zero-Build Native Dependencies*: Synapse leverages Node's built-in `node:sqlite` to eliminate C++ compilation failures on Windows/macOS/Linux.

---

## 2. Development Workflow

### Prerequisites
- Node.js `>= 22.0.0` (with built-in `node:sqlite`)
- npm `>= 10.0.0`

### Setup
```bash
git clone https://github.com/holaluiz/synapse-mcp.git
cd synapse-mcp
npm install
npm run build
```

### Running Tests & Diagnostics
```bash
# Check system and connected client status
npm run doctor

# Test the setup CLI in dry-run mode (does not modify config files)
node dist/cli.js setup --dry-run
```

---

## 3. Contribution Scope

### In Scope
- Additional client adapter registrations in `src/cli/setup.ts` (e.g. Zed, Windsurf, Aider).
- New coordination tools that enhance cross-agent communication.
- Enhancements to the SQLite WAL concurrency, busy timeout, or schema migrations.
- Translations and documentation guides.

### Out of Scope
- External network daemons or cloud synchronization services.
- Mandatory telemetry or analytics tracking.
- Heavy native C++ addons that break cross-platform installation.

---

## 4. Submitting a Pull Request

1. Fork the repository and create a feature branch (`git checkout -b feature/my-cool-feature`).
2. Run `npm run build` and ensure TypeScript compiles cleanly with zero errors.
3. Commit using conventional commit format:
   - `feat: add Windsurf client adapter`
   - `fix: resolve file lock race condition on Windows`
   - `docs: update Portuguese translation`
4. Push to your branch and open a Pull Request with a clear description of the problem solved.
