import { getKnownClients, getRegistrationStatus } from "./setup.js";
import { getDatabase, getDatabasePath, getWorkspaceRoot } from "../db/database.js";
import { SCHEMA_VERSION } from "../db/schema.js";
import { RouterService } from "../services/routerService.js";
import { TaskService } from "../services/taskService.js";
import { VERSION } from "../version.js";

/** Locks whose holder has been silent this long are reported as possibly stale */
const STALE_LOCK_MINUTES = 60;

/** node:sqlite is available without --experimental-sqlite from Node 22.13 */
const MIN_NODE = [22, 13];

export async function runDoctor(): Promise<void> {
  console.log("\n=======================================================");
  console.log(`       SYNAPSE MCP v${VERSION} - System Doctor & Diagnostics`);
  console.log("=======================================================\n");

  const [major, minor] = process.versions.node.split(".").map(Number);
  const nodeOk = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
  console.log(`[Node.js]: ${process.versions.node} ${nodeOk ? "OK" : `UNSUPPORTED (requires >= ${MIN_NODE.join(".")})`}`);

  const root = getWorkspaceRoot();
  const override = process.env.SYNAPSE_WORKSPACE ? " (from SYNAPSE_WORKSPACE)" : "";
  console.log(`[Workspace Root]: ${root}${override}`);

  // 1. Database check
  try {
    const db = getDatabase();
    const { journal_mode } = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
    console.log(`[Database]: OK (${getDatabasePath()})`);
    console.log(`[Journal Mode]: ${journal_mode.toUpperCase()}${journal_mode === "wal" ? "" : " - WARNING: expected WAL"}`);
    console.log(`[Schema Version]: ${user_version}${user_version === SCHEMA_VERSION ? "" : ` - WARNING: expected ${SCHEMA_VERSION}`}`);

    const { tasks, activeLocks } = TaskService.getActiveTasks();
    console.log(`[Tasks Active]: ${tasks.length}`);
    console.log(`[File Locks]: ${activeLocks.length}`);
    const locksByTask = new Map<string, typeof activeLocks>();
    for (const lock of activeLocks) {
      locksByTask.set(lock.task_id, [...(locksByTask.get(lock.task_id) ?? []), lock]);
    }
    for (const [taskId, locks] of locksByTask) {
      const holder = locks[0].agent_name;
      const lastActive = RouterService.getLastActive(holder);
      const idleMinutes = lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 60_000) : null;
      if (idleMinutes === null || idleMinutes >= STALE_LOCK_MINUTES) {
        const idle = idleMinutes === null ? "never seen" : `idle ${idleMinutes} min`;
        const patterns = locks.map((l) => l.pattern).join(", ");
        console.log(`  - POSSIBLY STALE: ${taskId} held by ${holder} (${idle}): ${patterns}`);
      }
    }

    const agents = RouterService.getActiveAgents();
    console.log(`[Active Agents in last 15m]: ${agents.length}`);
    for (const a of agents) {
      console.log(`  - ${a.name} (${a.client_type}) - Last seen: ${a.last_active}`);
    }
  } catch (err: any) {
    console.error(`[Database]: FAILED (${err.message})`);
    process.exitCode = 1;
  }

  // 2. Client registration checks
  console.log("\n[Supported Client Registrations]:");
  const labels = {
    registered: "REGISTERED",
    not_registered: "DETECTED, synapse not registered (run: synapse setup --client {name})",
    not_installed: "NOT INSTALLED",
    unreadable: "DETECTED, config could not be parsed",
  } as const;
  for (const client of getKnownClients()) {
    const label = labels[getRegistrationStatus(client)].replace("{name}", client.name);
    console.log(`  - ${client.displayName}: ${label} (${client.configPath})`);
  }

  console.log("\nDiagnostics complete.");
}
