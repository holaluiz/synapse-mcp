import { existsSync } from "node:fs";
import { getKnownClients } from "./setup.js";
import { getDatabase, findWorkspaceRoot, getDatabasePath } from "../db/database.js";
import { RouterService } from "../services/routerService.js";
import { TaskService } from "../services/taskService.js";

export async function runDoctor(): Promise<void> {
  console.log("\n=======================================================");
  console.log("       SYNAPSE MCP - System Doctor & Diagnostics       ");
  console.log("=======================================================\n");

  const root = findWorkspaceRoot();
  console.log(`[Workspace Root]: ${root}`);

  // 1. Database check
  try {
    const db = getDatabase();
    console.log(`[Database]: OK (${getDatabasePath()})`);

    const { tasks, activeLocks } = TaskService.getActiveTasks();
    console.log(`[Tasks Active]: ${tasks.length}`);
    console.log(`[File Locks]: ${activeLocks.length}`);

    const agents = RouterService.getActiveAgents();
    console.log(`[Active Agents in last 15m]: ${agents.length}`);
    for (const a of agents) {
      console.log(`  - ${a.name} (${a.client_type}) - Last seen: ${a.last_active}`);
    }
  } catch (err: any) {
    console.error(`[Database]: FAILED (${err.message})`);
  }

  // 2. Client registration checks
  console.log("\n[Supported Client Registrations]:");
  const clients = getKnownClients();
  for (const client of clients) {
    if (!existsSync(client.configPath)) {
      console.log(`  - ${client.displayName}: NOT INSTALLED (${client.configPath})`);
    } else {
      console.log(`  - ${client.displayName}: DETECTED (${client.configPath})`);
    }
  }

  console.log("\nDiagnostics complete.");
}
