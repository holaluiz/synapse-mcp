import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { SCHEMA_SQL } from "./schema.js";

/** Find workspace root by traversing upwards for .git or package.json */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, ".git")) || existsSync(join(current, ".synapse"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root
      return startDir;
    }
    current = parent;
  }
}

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

export function getDatabase(customPath?: string): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const workspaceRoot = findWorkspaceRoot();
  const synapseDir = join(workspaceRoot, ".synapse");
  if (!existsSync(synapseDir)) {
    mkdirSync(synapseDir, { recursive: true });
  }

  const dbPath = customPath || join(synapseDir, "brain.db");
  currentDbPath = dbPath;

  const db = new DatabaseSync(dbPath);

  // High-concurrency WAL configuration
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Run schema migration
  db.exec(SCHEMA_SQL);

  dbInstance = db;
  return db;
}

export function getDatabasePath(): string | null {
  return currentDbPath;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}
