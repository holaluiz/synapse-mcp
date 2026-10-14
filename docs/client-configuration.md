# 🔌 Client Configuration Guide

Synapse MCP connects with any AI agent client supporting the Model Context Protocol (MCP).

---

## Supported Clients & Paths

| Client | Platform | Config Location | Format | Auto-Setup Support |
| :--- | :--- | :--- | :---: | :---: |
| **Antigravity** | Windows | `%USERPROFILE%\.gemini\config\mcp_config.json` | JSON | :white_check_mark: |
| | macOS / Linux | `~/.gemini/config/mcp_config.json` | JSON | :white_check_mark: |
| **Claude Code** | Windows | `%USERPROFILE%\.claude.json` | JSON | :white_check_mark: |
| | macOS / Linux | `~/.claude.json` | JSON | :white_check_mark: |
| **Codex** | Windows | `%USERPROFILE%\.codex\config.toml` | TOML | :white_check_mark: |
| | macOS / Linux | `~/.codex/config.toml` | TOML | :white_check_mark: |
| **Cursor** | Windows | `%USERPROFILE%\.cursor\mcp.json` | JSON | :white_check_mark: |
| | macOS / Linux | `~/.cursor/mcp.json` | JSON | :white_check_mark: |
| **OpenCode** | All | `~/.config/opencode/opencode.json` | JSON | :white_check_mark: |
| **Gemini CLI** | All | `~/.gemini/settings.json` | JSON | Manual |
| **VS Code** | All | `~/AppData/Roaming/Code/User/mcp.json` | JSON | Manual |

---

## 1. Automated Setup (Recommended)

Run the auto-configurator inside your `synapse-mcp` directory:
```bash
npm run setup
```
To test what changes would be made without modifying files:
```bash
node dist/cli.js setup --dry-run
```
To target a specific client:
```bash
node dist/cli.js setup --client claude_code
```

---

## 2. Manual Configuration

### JSON-based Clients (Antigravity, Claude Code, Cursor, OpenCode)

Add the `synapse` entry inside `mcpServers`:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": [
        "/absolute/path/to/synapse-mcp/dist/cli.js",
        "mcp"
      ]
    }
  }
}
```

*On Windows, make sure to escape backslashes:*
```json
{
  "mcpServers": {
    "synapse": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "D:\\meus documentos\\synapse-mcp\\dist\\cli.js",
        "mcp"
      ]
    }
  }
}
```

---

### TOML-based Clients (Codex)

Append to your `config.toml`:

```toml
[mcp_servers.synapse]
command = "node"
args = ["/absolute/path/to/synapse-mcp/dist/cli.js", "mcp"]
```

*On Windows:*
```toml
[mcp_servers.synapse]
command = "C:\\Program Files\\nodejs\\node.exe"
args = ["D:\\meus documentos\\synapse-mcp\\dist\\cli.js", "mcp"]
```

---

## 3. Pinning the Workspace (`SYNAPSE_WORKSPACE`)

Synapse stores its brain in `.synapse/brain.db` under the workspace root, which it finds by searching upwards from the server's working directory for `.git` or `.synapse`. Most clients start MCP servers inside the open project, so this just works.

If a client starts servers from another directory (for example your home folder), agents would end up with **different databases** and could not see each other. Run `synapse doctor` from the same place to check the resolved `[Workspace Root]`, and pin it with an environment variable when needed:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": ["/absolute/path/to/synapse-mcp/dist/cli.js", "mcp"],
      "env": { "SYNAPSE_WORKSPACE": "/absolute/path/to/your/project" }
    }
  }
}
```

```toml
[mcp_servers.synapse]
command = "node"
args = ["/absolute/path/to/synapse-mcp/dist/cli.js", "mcp"]
env = { SYNAPSE_WORKSPACE = "/absolute/path/to/your/project" }
```
