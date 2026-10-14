import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/database.js";
import type { Decision, Knowledge } from "../contracts/types.js";
import { ActivityService } from "./activityService.js";

/** Escape LIKE wildcards so '%' and '_' in a query match literally */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

export class MemoryService {
  /** Record an Architectural Decision Record (ADR) */
  static recordDecision(params: {
    agent_name: string;
    title: string;
    context: string;
    decision: string;
    consequences?: string;
  }): Decision {
    const db = getDatabase();
    const id = `adr-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO decisions (id, title, context, decision, consequences, author_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.title, params.context, params.decision, params.consequences || null, params.agent_name, now);

    ActivityService.log(params.agent_name, "RECORD_DECISION", `Recorded ADR '${params.title}' (${id})`);

    return {
      id,
      title: params.title,
      context: params.context,
      decision: params.decision,
      consequences: params.consequences,
      author_agent: params.agent_name,
      created_at: now,
    };
  }

  /** Record a piece of project knowledge */
  static recordKnowledge(params: {
    agent_name: string;
    category: string;
    topic: string;
    content: string;
    tags?: string[];
  }): Knowledge {
    const db = getDatabase();
    const id = `kn-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const tagsJson = params.tags ? JSON.stringify(params.tags) : null;

    db.prepare(`
      INSERT INTO knowledge (id, category, topic, content, tags, author_agent, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.category, params.topic, params.content, tagsJson, params.agent_name, now);

    ActivityService.log(params.agent_name, "RECORD_KNOWLEDGE", `Added knowledge in category '${params.category}': ${params.topic}`);

    return {
      id,
      category: params.category,
      topic: params.topic,
      content: params.content,
      tags: params.tags,
      author_agent: params.agent_name,
      updated_at: now,
    };
  }

  /**
   * Search across decisions and knowledge entries. Every whitespace-separated
   * query term must appear in at least one searchable field (case-insensitive).
   */
  static queryMemory(params?: { query?: string; category?: string }): {
    decisions: Decision[];
    knowledge: Knowledge[];
  } {
    const db = getDatabase();
    const terms = (params?.query ?? "").split(/\s+/).filter(Boolean).map((t) => `%${escapeLike(t)}%`);

    const termFilter = (columns: string[]) =>
      terms.map(() => `(${columns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    const termArgs = (columnCount: number) => terms.flatMap((t) => Array<string>(columnCount).fill(t));

    const decisionColumns = ["title", "context", "decision", "consequences"];
    const decisionWhere = termFilter(decisionColumns);
    const decisions = db.prepare(`
      SELECT id, title, context, decision, consequences, author_agent, created_at
      FROM decisions
      ${decisionWhere.length > 0 ? `WHERE ${decisionWhere.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT 20
    `).all(...termArgs(decisionColumns.length)) as unknown as Decision[];

    const knowledgeColumns = ["topic", "content", "tags"];
    const knowledgeWhere = termFilter(knowledgeColumns);
    const knowledgeArgs = termArgs(knowledgeColumns.length);
    if (params?.category) {
      knowledgeWhere.unshift("category = ?");
      knowledgeArgs.unshift(params.category);
    }
    const rawKnowledge = db.prepare(`
      SELECT id, category, topic, content, tags, author_agent, updated_at
      FROM knowledge
      ${knowledgeWhere.length > 0 ? `WHERE ${knowledgeWhere.join(" AND ")}` : ""}
      ORDER BY updated_at DESC
      LIMIT 20
    `).all(...knowledgeArgs) as any[];

    const knowledge: Knowledge[] = rawKnowledge.map((k) => ({
      ...k,
      tags: k.tags ? JSON.parse(k.tags) : undefined,
    }));

    return { decisions, knowledge };
  }
}
