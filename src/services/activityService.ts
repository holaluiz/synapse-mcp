import { getDatabase } from "../db/database.js";
import type { ActivityEntry } from "../contracts/types.js";
import { normalizeAgentName, normalizedAgentSql } from "./agentIdentity.js";

export class ActivityService {
  /** Append an entry to the audit trail */
  static log(agent_name: string, action: string, details: string): void {
    getDatabase().prepare(`
      INSERT INTO activity_log (agent_name, action, details, created_at)
      VALUES (?, ?, ?, ?)
    `).run(agent_name, action, details, new Date().toISOString());
  }

  /** Most recent audit entries first, optionally filtered by agent and start time */
  static list(params: { limit?: number; agent_name?: string; since?: string } = {}): ActivityEntry[] {
    const db = getDatabase();
    const where: string[] = [];
    const args: (string | number)[] = [];

    if (params.agent_name) {
      where.push(`${normalizedAgentSql("agent_name")} = ?`);
      args.push(normalizeAgentName(params.agent_name));
    }
    if (params.since) {
      // datetime() parses both legacy 'YYYY-MM-DD HH:MM:SS' rows and ISO-8601 rows
      where.push("datetime(created_at) >= datetime(?)");
      args.push(params.since);
    }

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    args.push(limit);

    return db.prepare(`
      SELECT id, agent_name, action, details, created_at
      FROM activity_log
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY id DESC
      LIMIT ?
    `).all(...args) as unknown as ActivityEntry[];
  }
}
