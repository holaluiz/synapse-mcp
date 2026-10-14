import { getDatabase } from "../db/database.js";
import type { Agent } from "../contracts/types.js";

export interface AgentSpecialty {
  client_type: string;
  name: string;
  strengths: string[];
  best_for: string[];
}

export const AGENT_MATRIX: Record<string, AgentSpecialty> = {
  antigravity: {
    client_type: "antigravity",
    name: "Antigravity (Google DeepMind IDE Agent)",
    strengths: [
      "Deep workspace awareness with IDE compiler and linter integration",
      "Interactive Generative UI widgets and diagram rendering",
      "Concurrent subagent orchestration (research, test runners, generators)",
      "Multi-file complex architectural refactoring with atomic safety",
    ],
    best_for: [
      "System architecture and multi-file project scaffolding",
      "UI/Frontend component design and interactive features",
      "Investigation coordination and delegating to subagents",
      "Pair-programming requiring tight visual feedback",
    ],
  },
  claude_code: {
    client_type: "claude_code",
    name: "Claude Code (Anthropic Terminal Agent)",
    strengths: [
      "Direct CLI terminal control and Unix shell mastery",
      "Git branch management, clean staging, rebasing, and PR preparation",
      "Running heavy test suites and interpreting terminal stderr logs",
      "Large-scale codebase search and fast grep-driven repairs",
    ],
    best_for: [
      "Test execution and test-driven bugfix loops",
      "Git release management, changelog generation, and tagging",
      "CLI build scripts, npm workflows, and CI/CD setup",
      "Heavy refactoring across terminal commands",
    ],
  },
  codex: {
    client_type: "codex",
    name: "Codex / OpenAI Assistant",
    strengths: [
      "Rapid isolated function implementation and mathematical routines",
      "Sandboxed script execution and deterministic code completion",
      "Data transformation and standalone parser creation",
    ],
    best_for: [
      "Isolated algorithmic tasks and utility libraries",
      "Data parsing and schema validation helpers",
      "Micro-benchmarking and standalone script execution",
    ],
  },
  cursor: {
    client_type: "cursor",
    name: "Cursor AI Editor",
    strengths: [
      "Inline code completion and context-aware file editing",
      "Quick cursor-targeted rewrites and localized completions",
    ],
    best_for: [
      "Micro-edits, inline typing assistance, and localized tweaks",
    ],
  },
};

export class RouterService {
  /** Record agent heartbeat to maintain presence */
  static heartbeat(params: {
    agent_name: string;
    client_type: string;
    current_task_id?: string;
  }): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agents (id, name, client_type, last_active, current_task_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_active = excluded.last_active,
        client_type = excluded.client_type,
        current_task_id = excluded.current_task_id
    `).run(
      params.agent_name,
      params.agent_name,
      params.client_type,
      now,
      params.current_task_id || null
    );
  }

  /** Retrieve all agents active in the last 15 minutes */
  static getActiveAgents(): Agent[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT id, name, client_type, last_active, current_task_id
      FROM agents
      WHERE datetime(last_active) >= datetime('now', '-15 minutes')
      ORDER BY last_active DESC
    `).all() as unknown as Agent[];
  }

  /** Handoff a task from one agent to another */
  static handoffTask(params: {
    from_agent: string;
    to_agent: string;
    task_id: string;
    handoff_notes: string;
  }): { ok: boolean; message: string } {
    const db = getDatabase();
    const now = new Date().toISOString();

    // 1. Update task assignment
    const update = db.prepare(`
      UPDATE tasks 
      SET assigned_agent = ?, updated_at = ?
      WHERE id = ?
    `);
    const res = update.run(params.to_agent, now, params.task_id);

    if (res.changes === 0) {
      return { ok: false, message: `Task '${params.task_id}' not found.` };
    }

    // 2. Transfer file locks to the new agent
    db.prepare(`
      UPDATE file_locks
      SET agent_name = ?
      WHERE task_id = ?
    `).run(params.to_agent, params.task_id);

    // 3. Log handoff in activity
    db.prepare(`
      INSERT INTO activity_log (agent_name, action, details)
      VALUES (?, 'HANDOFF_TASK', ?)
    `).run(
      params.from_agent,
      `Handed off ${params.task_id} to ${params.to_agent}. Notes: ${params.handoff_notes}`
    );

    return {
      ok: true,
      message: `Task ${params.task_id} successfully transferred from ${params.from_agent} to ${params.to_agent}. File locks reassigned.`,
    };
  }

  /** Suggest the best agent based on task type */
  static recommendAgent(taskDescription: string): {
    recommended_agent: string;
    rationale: string;
    matrix: Record<string, AgentSpecialty>;
  } {
    const text = taskDescription.toLowerCase();

    if (text.includes("git") || text.includes("test") || text.includes("cli") || text.includes("terminal") || text.includes("rebase") || text.includes("ci")) {
      return {
        recommended_agent: "claude_code",
        rationale: "This task involves terminal execution, git workflows, or test suite execution, where Claude Code excels.",
        matrix: AGENT_MATRIX,
      };
    }

    if (text.includes("ui") || text.includes("frontend") || text.includes("react") || text.includes("component") || text.includes("design") || text.includes("refactor")) {
      return {
        recommended_agent: "antigravity",
        rationale: "This task involves architecture, UI/frontend design, or multi-file IDE refactoring, where Antigravity provides the best visual and compilation feedback.",
        matrix: AGENT_MATRIX,
      };
    }

    if (text.includes("algorithm") || text.includes("script") || text.includes("calc") || text.includes("parse")) {
      return {
        recommended_agent: "codex",
        rationale: "This task is well-suited for isolated algorithmic implementation or script execution.",
        matrix: AGENT_MATRIX,
      };
    }

    return {
      recommended_agent: "antigravity",
      rationale: "General architecture and code design defaults to Antigravity for comprehensive workspace control.",
      matrix: AGENT_MATRIX,
    };
  }
}
