import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { SCHEMA_SQL, migrateSchema } from "./schema.js";

/** Find workspace root by traversing upwards for .git or .synapse */
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

/**
 * Resolve the workspace root. `SYNAPSE_WORKSPACE` overrides discovery for
 * clients that launch MCP servers from a directory outside the project.
 */
export function getWorkspaceRoot(): string {
  if (currentWorkspaceRoot) {
    return currentWorkspaceRoot;
  }
  const override = process.env.SYNAPSE_WORKSPACE;
  return override ? resolve(override) : findWorkspaceRoot();
}

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;
let currentWorkspaceRoot: string | null = null;
let transactionDepth = 0;

export function getDatabase(customPath?: string): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const workspaceRoot = getWorkspaceRoot();
  const dbPath = customPath || join(workspaceRoot, ".synapse", "brain.db");
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // High-concurrency WAL configuration. busy_timeout goes first so that even
  // switching a fresh database to WAL waits for other agents instead of failing.
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Run schema migration
  db.exec(SCHEMA_SQL);
  dbInstance = db;
  currentDbPath = dbPath;
  currentWorkspaceRoot = workspaceRoot;
  try {
    withTransaction(() => migrateSchema(db));
  } catch (err) {
    closeDatabase();
    throw err;
  }

  return db;
}

export function getDatabasePath(): string | null {
  return currentDbPath;
}

/**
 * Run `fn` inside a `BEGIN IMMEDIATE` transaction so check-then-write sequences
 * are atomic across agent processes. The write lock is taken up front, and
 * `busy_timeout` makes competing processes wait for it instead of failing.
 * Nested calls join the outer transaction.
 */
export function withTransaction<T>(fn: () => T): T {
  const db = getDatabase();
  if (transactionDepth > 0) {
    return fn();
  }

  db.exec("BEGIN IMMEDIATE;");
  transactionDepth++;
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  } finally {
    transactionDepth--;
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
    currentWorkspaceRoot = null;
  }
}
