import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export interface ClientTarget {
  name: string;
  displayName: string;
  configPath: string;
  format: "json" | "toml";
}

export type RegistrationStatus = "registered" | "not_registered" | "not_installed" | "unreadable";

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

/** Absolute path of the built CLI, independent of the directory setup is run from */
export function getEntrypoint(): string {
  return fileURLToPath(new URL("../cli.js", import.meta.url));
}

/** Whether a client's config file already contains a 'synapse' MCP server entry */
export function getRegistrationStatus(client: ClientTarget): RegistrationStatus {
  if (!existsSync(client.configPath)) {
    return "not_installed";
  }
  try {
    const raw = readFileSync(client.configPath, "utf-8");
    if (client.format === "toml") {
      return raw.includes("[mcp_servers.synapse]") ? "registered" : "not_registered";
    }
    return JSON.parse(raw)?.mcpServers?.synapse ? "registered" : "not_registered";
  } catch {
    return "unreadable";
  }
}

export async function runSetup(options: { dryRun?: boolean; targetClient?: string } = {}): Promise<void> {
  const clients = getKnownClients();
  const entrypoint = getEntrypoint();

  console.log("\n=======================================================");
  console.log("       SYNAPSE MCP - Multi-Agent Auto Setup           ");
  console.log("=======================================================\n");
  console.log(`Executable entrypoint: ${entrypoint}\n`);

  if (options.targetClient && !clients.some((c) => c.name === options.targetClient)) {
    console.error(`Unknown client '${options.targetClient}'. Valid values: ${clients.map((c) => c.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

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

      if (client.format === "json") {
        const raw = readFileSync(client.configPath, "utf-8");
        const json = JSON.parse(raw);
        const desired = { command: process.execPath, args: [entrypoint, "mcp"] };

        if (JSON.stringify(json.mcpServers?.synapse) === JSON.stringify(desired)) {
          console.log(`    [ALIGNED] 'synapse' is already registered with this entrypoint.\n`);
          continue;
        }
        if (options.dryRun) {
          console.log(`    [DRY RUN] Would inject 'synapse' MCP server definition.\n`);
          continue;
        }

        // 1. Create safety backup
        const backupPath = `${client.configPath}.synapse.backup`;
        copyFileSync(client.configPath, backupPath);
        console.log(`    Backed up to ${backupPath}`);

        // 2. Inject
        if (!json.mcpServers) {
          json.mcpServers = {};
        }
        json.mcpServers.synapse = desired;

        writeFileSync(client.configPath, JSON.stringify(json, null, 2), "utf-8");
        console.log(`    [SUCCESS] Registered 'synapse' in ${client.displayName} configuration!\n`);
      } else if (client.format === "toml") {
        let content = readFileSync(client.configPath, "utf-8");
        const escapedExec = process.execPath.replace(/\\/g, "\\\\");
        const escapedEntry = entrypoint.replace(/\\/g, "\\\\");

        if (content.includes("[mcp_servers.synapse]")) {
          if (content.includes(escapedEntry)) {
            console.log(`    [ALIGNED] 'synapse' is already registered in TOML.\n`);
          } else {
            console.log(
              `    [WARNING] 'synapse' is registered with a different entrypoint. Update [mcp_servers.synapse] manually to:\n` +
                `              args = ["${escapedEntry}", "mcp"]\n`
            );
          }
          continue;
        }
        if (options.dryRun) {
          console.log(`    [DRY RUN] Would append [mcp_servers.synapse] to TOML configuration.\n`);
          continue;
        }

        const backupPath = `${client.configPath}.synapse.backup`;
        copyFileSync(client.configPath, backupPath);
        console.log(`    Backed up to ${backupPath}`);

        const tomlSnippet = `\n[mcp_servers.synapse]\ncommand = "${escapedExec}"\nargs = ["${escapedEntry}", "mcp"]\n`;
        content += tomlSnippet;
        writeFileSync(client.configPath, content, "utf-8");
        console.log(`    [SUCCESS] Appended 'synapse' to TOML configuration!\n`);
      }
    } catch (err: any) {
      console.error(`    [ERROR] Failed to configure ${client.displayName}: ${err.message}\n`);
    }
  }

  console.log("Setup complete! Connected agents will now have access to Synapse memory and task locks.");
}
