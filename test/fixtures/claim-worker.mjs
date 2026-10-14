// Separate agent process for the concurrency test: opens the shared database,
// signals "ready", then claims a lock as soon as the parent says "go".
import { getDatabase, TaskService } from "../../dist/index.js";

const [dbPath, agentName, pattern] = process.argv.slice(2);
getDatabase(dbPath);
process.stdout.write("ready\n");

process.stdin.once("data", () => {
  const result = TaskService.claimTask({ agent_name: agentName, title: `race ${agentName}`, lock_patterns: [pattern] });
  process.stdout.write(JSON.stringify({ agent: agentName, ok: result.ok }) + "\n");
  process.exit(0);
});
