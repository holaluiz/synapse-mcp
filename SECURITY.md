# Security Policy

## Supported Versions

Security fixes are provided for the latest published version of Synapse MCP.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Local-First Security Architecture

Synapse MCP is designed with strict **local-first privacy and security guarantees**:

1. **Zero External Telemetry**: Synapse MCP does not collect analytics, logs, telemetry, or user metrics.
2. **Zero Cloud Dependencies**: All shared memories, task claims, file locks, and ADRs are stored locally in `.synapse/brain.db` within the repository root.
3. **No Network Sockets**: The MCP server operates strictly over standard local input/output (`stdio`) spawned directly by your authorized local AI agents.
4. **Non-Destructive File Locking**: Locks are advisory coordination barriers managed in SQLite; Synapse never modifies file permissions (`chmod`), hides files, or alters target disk attributes.
5. **Safe Config Backups**: The automated setup engine (`npm run setup`) creates verifiable local backups (`.synapse.backup`) before modifying any client configuration file.

## Reporting a Vulnerability

If you discover a security vulnerability, unintended privilege escalation, or race condition in file lock arbitration:

1. **Do not disclose vulnerabilities publicly** via issues, pull requests, or discussions.
2. Submit a private vulnerability report via GitHub Security Advisories on [holaluiz/synapse-mcp](https://github.com/holaluiz/synapse-mcp/security/advisories).
3. Include:
   - Operating System and Node.js version.
   - AI agent hosts involved (Claude Code, Antigravity, Codex, Cursor).
   - Minimal reproduction script or concurrent lock sequence.
   - Proposed remediation or patch, if available.

The maintainer will acknowledge reports within 48 hours and coordinate a coordinated remediation release.
