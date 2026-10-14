import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ClientTarget {
  name: string;
  displayName: string;
  configPath: string;
  format: "json" | "toml";
}

export function getKnownClients(): ClientTarget[] {
  const home = homedir();
  return [
    {
      name: "antigravity",
      displayName: "Antigravity",
      configPath: join(home, ".gemini", "config", "mcp_config.json"),
      format: "json",
    },
    {
      name: "claude_code",
      displayName: "Claude Code",
      configPath: join(home, ".claude.json"),
      format: "json",
    },
    {
      name: "cursor",
      displayName: "Cursor",
      configPath: join(home, ".cursor", "mcp.json"),
      format: "json",
    },
    {
      name: "codex",
      displayName: "Codex",
      configPath: join(home, ".codex", "config.toml"),
      format: "toml",
    },
    {
      name: "opencode",
      displayName: "OpenCode",
      configPath: join(home, ".config", "opencode", "opencode.json"),
      format: "json",
    },
  ];
}

export async function runSetup(options: { dryRun?: boolean; targetClient?: string } = {}): Promise<void> {
  const clients = getKnownClients();
  const entrypoint = join(process.cwd(), "dist", "cli.js");

  console.log("\n=======================================================");
  console.log("       SYNAPSE MCP - Multi-Agent Auto Setup           ");
  console.log("=======================================================\n");
  console.log(`Executable entrypoint: ${entrypoint}\n`);

  for (const client of clients) {
    if (options.targetClient && client.name !== options.targetClient) {
      continue;
    }

    if (!existsSync(client.configPath)) {
      console.log(`[-] ${client.displayName}: Config file not found (${client.configPath}) - Skipped.`);
      continue;
    }

    try {
      console.log(`[*] ${client.displayName} detected at ${client.configPath}`);

      if (options.dryRun) {
        console.log(`    [DRY RUN] Would inject 'synapse' MCP server definition.`);
        continue;
      }

      // 1. Create safety backup
      const backupPath = `${client.configPath}.synapse.backup`;
      copyFileSync(client.configPath, backupPath);
      console.log(`    Backed up to ${backupPath}`);

      // 2. Read and inject
      if (client.format === "json") {
        const raw = readFileSync(client.configPath, "utf-8");
        const json = JSON.parse(raw);
        if (!json.mcpServers) {
          json.mcpServers = {};
        }

        json.mcpServers.synapse = {
          command: process.execPath,
          args: [entrypoint, "mcp"],
        };

        writeFileSync(client.configPath, JSON.stringify(json, null, 2), "utf-8");
        console.log(`    [SUCCESS] Registered 'synapse' in ${client.displayName} configuration!\n`);
      } else if (client.format === "toml") {
        let content = readFileSync(client.configPath, "utf-8");
        if (!content.includes("[mcp_servers.synapse]")) {
          const escapedExec = process.execPath.replace(/\\/g, "\\\\");
          const escapedEntry = entrypoint.replace(/\\/g, "\\\\");
          const tomlSnippet = `\n[mcp_servers.synapse]\ncommand = "${escapedExec}"\nargs = ["${escapedEntry}", "mcp"]\n`;
          content += tomlSnippet;
          writeFileSync(client.configPath, content, "utf-8");
          console.log(`    [SUCCESS] Appended 'synapse' to TOML configuration!\n`);
        } else {
          console.log(`    [ALIGNED] 'synapse' is already registered in TOML.\n`);
        }
      }
    } catch (err: any) {
      console.error(`    [ERROR] Failed to configure ${client.displayName}: ${err.message}\n`);
    }
  }

  console.log("Setup complete! Connected agents will now have access to Synapse memory and task locks.");
}
