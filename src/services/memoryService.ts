import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/database.js";
import type { Decision, Knowledge } from "../contracts/types.js";

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

    db.prepare(`
      INSERT INTO activity_log (agent_name, action, details)
      VALUES (?, 'RECORD_DECISION', ?)
    `).run(params.agent_name, `Recorded ADR '${params.title}' (${id})`);

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

    db.prepare(`
      INSERT INTO activity_log (agent_name, action, details)
      VALUES (?, 'RECORD_KNOWLEDGE', ?)
    `).run(params.agent_name, `Added knowledge in category '${params.category}': ${params.topic}`);

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

  /** Search across decisions and knowledge entries */
  static queryMemory(params?: { query?: string; category?: string }): {
    decisions: Decision[];
    knowledge: Knowledge[];
  } {
    const db = getDatabase();
    const q = params?.query ? `%${params.query}%` : null;

    let decisions: Decision[] = [];
    if (q) {
      decisions = db.prepare(`
        SELECT id, title, context, decision, consequences, author_agent, created_at
        FROM decisions
        WHERE title LIKE ? OR context LIKE ? OR decision LIKE ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(q, q, q) as unknown as Decision[];
    } else {
      decisions = db.prepare(`
        SELECT id, title, context, decision, consequences, author_agent, created_at
        FROM decisions
        ORDER BY created_at DESC
        LIMIT 20
      `).all() as unknown as Decision[];
    }

    let rawKnowledge: any[] = [];
    if (params?.category && q) {
      rawKnowledge = db.prepare(`
        SELECT id, category, topic, content, tags, author_agent, updated_at
        FROM knowledge
        WHERE category = ? AND (topic LIKE ? OR content LIKE ?)
        ORDER BY updated_at DESC
        LIMIT 20
      `).all(params.category, q, q) as any[];
    } else if (params?.category) {
      rawKnowledge = db.prepare(`
        SELECT id, category, topic, content, tags, author_agent, updated_at
        FROM knowledge
        WHERE category = ?
        ORDER BY updated_at DESC
        LIMIT 20
      `).all(params.category) as any[];
    } else if (q) {
      rawKnowledge = db.prepare(`
        SELECT id, category, topic, content, tags, author_agent, updated_at
        FROM knowledge
        WHERE topic LIKE ? OR content LIKE ?
        ORDER BY updated_at DESC
        LIMIT 20
      `).all(q, q) as any[];
    } else {
      rawKnowledge = db.prepare(`
        SELECT id, category, topic, content, tags, author_agent, updated_at
        FROM knowledge
        ORDER BY updated_at DESC
        LIMIT 20
      `).all() as any[];
    }

    const knowledge: Knowledge[] = rawKnowledge.map((k) => ({
      ...k,
      tags: k.tags ? JSON.parse(k.tags) : undefined,
    }));

    return { decisions, knowledge };
  }
}
