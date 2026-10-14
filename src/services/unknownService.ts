import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/database.js";
import type { UnknownGap, UnknownSeverity, UnknownStatus } from "../contracts/types.js";

export class UnknownService {
  /** Record an unresolved gap or question for other agents to investigate */
  static recordUnknown(params: {
    agent_name: string;
    question: string;
    context?: string;
    severity?: UnknownSeverity;
  }): UnknownGap {
    const db = getDatabase();
    const id = `unk-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const severity = params.severity || "medium";

    db.prepare(`
      INSERT INTO unknowns (id, question, context, severity, status, author_agent, created_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?)
    `).run(id, params.question, params.context || null, severity, params.agent_name, now);

    db.prepare(`
      INSERT INTO activity_log (agent_name, action, details)
      VALUES (?, 'RECORD_UNKNOWN', ?)
    `).run(params.agent_name, `Reported gap [${severity}]: '${params.question}' (${id})`);

    return {
      id,
      question: params.question,
      context: params.context,
      severity,
      status: "open",
      author_agent: params.agent_name,
      created_at: now,
    };
  }

  /** Mark an unknown as resolved with verified explanation or fix */
  static resolveUnknown(params: {
    agent_name: string;
    unknown_id: string;
    resolution: string;
  }): { ok: boolean; message: string } {
    const db = getDatabase();
    const now = new Date().toISOString();

    const update = db.prepare(`
      UPDATE unknowns 
      SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ?
      WHERE id = ?
    `);
    const result = update.run(params.resolution, params.agent_name, now, params.unknown_id);

    if (result.changes === 0) {
      return { ok: false, message: `Unknown '${params.unknown_id}' was not found.` };
    }

    db.prepare(`
      INSERT INTO activity_log (agent_name, action, details)
      VALUES (?, 'RESOLVE_UNKNOWN', ?)
    `).run(params.agent_name, `Resolved gap ${params.unknown_id}: ${params.resolution}`);

    return { ok: true, message: `Unknown '${params.unknown_id}' marked as resolved.` };
  }

  /** List unknowns filtered by status */
  static listUnknowns(statusFilter: UnknownStatus | "all" = "open"): UnknownGap[] {
    const db = getDatabase();
    if (statusFilter === "all") {
      return db.prepare(`
        SELECT id, question, context, severity, status, resolution, author_agent, resolved_by, created_at, resolved_at
        FROM unknowns
        ORDER BY created_at DESC
      `).all() as unknown as UnknownGap[];
    }

    return db.prepare(`
      SELECT id, question, context, severity, status, resolution, author_agent, resolved_by, created_at, resolved_at
      FROM unknowns
      WHERE status = ?
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        created_at DESC
    `).all(statusFilter) as unknown as UnknownGap[];
  }
}
