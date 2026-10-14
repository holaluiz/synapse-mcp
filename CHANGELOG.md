# Changelog

All notable changes to Synapse MCP are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **Lock collisions now detect overlapping patterns.** Previously only identical strings collided, so a lock on `src/auth/**` did not block a claim on `src/auth/login.ts`. Globs (`*`, `?`, `**`, `[ab]`, `{a,b}`), directories and files are now compared by overlap, case-insensitively, with `\`/`/`, `./` and absolute workspace paths normalized.
- **Claims are atomic across processes.** The conflict check and lock insert now share one `BEGIN IMMEDIATE` transaction. Before, several agents racing for the same files could all succeed (reproduced with 8 concurrent processes).
- `synapse_release_task` no longer lets any agent release another agent's task, and no longer reports success for task IDs that do not exist.
- `synapse_handoff_task` can only be called by the task owner and rejects completed tasks.
- `synapse_resolve_unknown` no longer silently overwrites an already resolved gap.
- `synapse_recommend_agent` matches whole words: `ci` no longer matches "circuit", `ui` no longer matches "build", and `test` no longer matches "latest".
- `synapse_query_memory` treats `%` and `_` in queries literally.
- `synapse setup` resolves the server entrypoint from its own location instead of the current directory, so the `synapse` bin works from any folder. Re-running setup on an already registered JSON client is a no-op (no needless backup/rewrite).
- `busy_timeout` is applied before switching to WAL, so agents opening a new database at the same time wait instead of failing with `SQLITE_BUSY`.
- The server startup log printed `Database: null`; the database is now opened before connecting.
- `package-lock.json` was out of sync with `package.json` (it pinned TypeScript 7 / `@types/node` 26), which made `npm ci` fail.

### Added
- `synapse_investigate_unknown`: marks a gap as `investigating` under your name (the status existed but was unreachable).
- `synapse_get_activity`: reads the audit trail, filterable by agent and `since` timestamp.
- `force` option on `synapse_release_task` to clear stale locks left by a crashed agent (logged as `FORCE_RELEASE_TASK`).
- Handoff notes are stored on the task and returned by `synapse_get_tasks`, so the receiving agent actually sees them.
- Collision errors report how long ago the lock holder was last seen.
- Multi-word `synapse_query_memory` searches (every word must match), now also covering ADR consequences and knowledge tags.
- `SYNAPSE_WORKSPACE` environment variable to pin the workspace root for clients that start servers outside the project.
- `synapse doctor` reports Node.js compatibility, journal mode, schema version, possibly stale locks and whether `synapse` is registered in each client (not just whether the client is installed).
- `synapse --version`, and the server version is read from `package.json`.
- Versioned schema migrations via `PRAGMA user_version` (v2 adds `tasks.handoff_notes` and `unknowns.investigator`); existing databases are upgraded in place.
- Test suite on `node:test` (`npm test`): lock-pattern unit tests, service tests, MCP integration tests over an in-memory transport, and a multi-process race test.
- CI workflow running build and tests on Ubuntu, Windows and macOS with Node 22 and 24.

### Changed
- Tools are registered with `registerTool` (the `server.tool` API is deprecated) using the shared Zod schemas from `src/contracts/types.ts`, and carry MCP `readOnlyHint` annotations.
- Failed operations (collisions, unknown IDs, ownership violations) return `isError: true`.
- Agent names are compared ignoring case and `-`/`_`/space differences.
- `engines.node` is now `>= 22.13.0`, the first Node 22 release with `node:sqlite` unflagged.

## [0.1.0] - 2026-10-14

### Added
- Initial release: SQLite WAL shared brain, task board with advisory file locks, ADRs, knowledge base, investigation unknowns, specialty router and handoffs, `setup` and `doctor` CLI.
