import type { DatabaseSync } from "node:sqlite";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_type TEXT NOT NULL,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
  current_task_id TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_agent TEXT,
  status TEXT CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked')) DEFAULT 'pending',
  locked_patterns TEXT, -- JSON array of file patterns/paths
  handoff_notes TEXT, -- Latest synapse_handoff_task notes for the receiving agent
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_locks (
  pattern TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  decision TEXT NOT NULL,
  consequences TEXT,
  author_agent TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT, -- Comma-separated or JSON array
  author_agent TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unknowns (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  context TEXT,
  severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  status TEXT CHECK(status IN ('open', 'investigating', 'resolved')) DEFAULT 'open',
  resolution TEXT,
  author_agent TEXT NOT NULL,
  resolved_by TEXT,
  investigator TEXT, -- Agent that marked the gap as investigating
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_unknowns_status ON unknowns(status);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at);
`;

/** Schema version tracked in `PRAGMA user_version`. Bump when adding a migration below. */
export const SCHEMA_VERSION = 2;

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

/**
 * Apply incremental migrations to databases created by older versions.
 * Must run inside a write transaction so concurrent agents don't race on ALTER TABLE.
 */
export function migrateSchema(db: DatabaseSync): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version >= SCHEMA_VERSION) {
    return;
  }

  // v2: handoff notes visible on the task board, and who is investigating an unknown
  if (!hasColumn(db, "tasks", "handoff_notes")) {
    db.exec("ALTER TABLE tasks ADD COLUMN handoff_notes TEXT;");
  }
  if (!hasColumn(db, "unknowns", "investigator")) {
    db.exec("ALTER TABLE unknowns ADD COLUMN investigator TEXT;");
  }

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}
