import { randomUUID } from "node:crypto";
import { getDatabase, withTransaction } from "../db/database.js";
import type { UnknownGap, UnknownSeverity, UnknownStatus } from "../contracts/types.js";
import { ActivityService } from "./activityService.js";
import { sameAgent } from "./agentIdentity.js";

const UNKNOWN_COLUMNS =
  "id, question, context, severity, status, resolution, author_agent, resolved_by, investigator, created_at, resolved_at";

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

    ActivityService.log(params.agent_name, "RECORD_UNKNOWN", `Reported gap [${severity}]: '${params.question}' (${id})`);

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

  /** Mark an open unknown as being investigated, so other agents don't duplicate the work */
  static investigateUnknown(params: { agent_name: string; unknown_id: string }): { ok: boolean; message: string } {
    const db = getDatabase();

    return withTransaction(() => {
      const gap = db.prepare("SELECT status, investigator, resolved_by FROM unknowns WHERE id = ?").get(params.unknown_id) as
        | { status: UnknownStatus; investigator: string | null; resolved_by: string | null }
        | undefined;
      if (!gap) {
        return { ok: false, message: `Unknown '${params.unknown_id}' was not found.` };
      }
      if (gap.status === "resolved") {
        return { ok: false, message: `Unknown '${params.unknown_id}' was already resolved by ${gap.resolved_by}.` };
      }
      if (gap.status === "investigating" && !sameAgent(gap.investigator, params.agent_name)) {
        return {
          ok: false,
          message: `Unknown '${params.unknown_id}' is already being investigated by ${gap.investigator}. Coordinate before duplicating the work.`,
        };
      }

      db.prepare("UPDATE unknowns SET status = 'investigating', investigator = ? WHERE id = ?").run(
        params.agent_name,
        params.unknown_id
      );
      ActivityService.log(params.agent_name, "INVESTIGATE_UNKNOWN", `Started investigating gap ${params.unknown_id}`);

      return { ok: true, message: `Unknown '${params.unknown_id}' marked as investigating by ${params.agent_name}.` };
    });
  }

  /** Mark an unknown as resolved with verified explanation or fix */
  static resolveUnknown(params: {
    agent_name: string;
    unknown_id: string;
    resolution: string;
  }): { ok: boolean; message: string } {
    const db = getDatabase();

    return withTransaction(() => {
      const gap = db.prepare("SELECT status, resolved_by FROM unknowns WHERE id = ?").get(params.unknown_id) as
        | { status: UnknownStatus; resolved_by: string | null }
        | undefined;
      if (!gap) {
        return { ok: false, message: `Unknown '${params.unknown_id}' was not found.` };
      }
      if (gap.status === "resolved") {
        return { ok: false, message: `Unknown '${params.unknown_id}' was already resolved by ${gap.resolved_by}.` };
      }

      db.prepare(`
        UPDATE unknowns
        SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ?
        WHERE id = ?
      `).run(params.resolution, params.agent_name, new Date().toISOString(), params.unknown_id);

      ActivityService.log(params.agent_name, "RESOLVE_UNKNOWN", `Resolved gap ${params.unknown_id}: ${params.resolution}`);

      return { ok: true, message: `Unknown '${params.unknown_id}' marked as resolved.` };
    });
  }

  /** List unknowns filtered by status */
  static listUnknowns(statusFilter: UnknownStatus | "all" = "open"): UnknownGap[] {
    const db = getDatabase();
    if (statusFilter === "all") {
      return db.prepare(`
        SELECT ${UNKNOWN_COLUMNS}
        FROM unknowns
        ORDER BY created_at DESC
      `).all() as unknown as UnknownGap[];
    }

    return db.prepare(`
      SELECT ${UNKNOWN_COLUMNS}
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
