#!/usr/bin/env node
import { runStdioServer } from "./server/mcpServer.js";
import { runSetup } from "./cli/setup.js";
import { runDoctor } from "./cli/doctor.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "mcp";

  if (command === "mcp") {
    await runStdioServer();
  } else if (command === "setup") {
    const isDryRun = args.includes("--dry-run");
    const clientFlagIndex = args.indexOf("--client");
    const targetClient = clientFlagIndex !== -1 ? args[clientFlagIndex + 1] : undefined;
    await runSetup({ dryRun: isDryRun, targetClient });
  } else if (command === "doctor") {
    await runDoctor();
  } else {
    console.log(`
Synapse MCP - Unified Brain, Shared Memory and Task Board for AI Agents

Usage:
  synapse mcp                 Start the MCP server (stdio transport)
  synapse setup [--dry-run]   Auto-configure detected AI agents (Claude, Codex, Antigravity, Cursor)
  synapse doctor              Run diagnostics and health checks
    `);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
