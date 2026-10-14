import { getDatabase, withTransaction } from "../db/database.js";
import type { Agent } from "../contracts/types.js";
import { ActivityService } from "./activityService.js";
import { normalizeAgentName, normalizedAgentSql, sameAgent } from "./agentIdentity.js";

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

/**
 * Routing keywords per agent. Words of 3 letters or fewer must match a whole
 * word ("ci" must not match "circuit"); longer ones also match as a word
 * prefix ("test" matches "tests" and "testing", but not "latest").
 * On a score tie, the agent listed first wins.
 */
const ROUTING_KEYWORDS: Array<{ agent: string; keywords: string[] }> = [
  {
    agent: "claude_code",
    keywords: [
      "git", "github", "test", "cli", "terminal", "shell", "bash", "rebase", "ci", "cd", "pipeline",
      "npm", "build", "commit", "branch", "merge", "release", "changelog", "lint", "deploy", "tag",
    ],
  },
  {
    agent: "antigravity",
    keywords: [
      "ui", "ux", "frontend", "react", "vue", "component", "design", "css", "layout", "page",
      "architect", "refactor", "scaffold", "visual", "diagram", "styl",
    ],
  },
  {
    agent: "codex",
    keywords: ["algorithm", "script", "calc", "pars", "regex", "math", "utility", "benchmark", "transform", "sort"],
  },
  {
    agent: "cursor",
    keywords: ["inline", "tweak", "typo", "rename", "autocomplet"],
  },
];

const ROUTING_RATIONALE: Record<string, string> = {
  claude_code: "This task involves terminal execution, git workflows, or test suite execution, where Claude Code excels.",
  antigravity:
    "This task involves architecture, UI/frontend design, or multi-file IDE refactoring, where Antigravity provides the best visual and compilation feedback.",
  codex: "This task is well-suited for isolated algorithmic implementation or script execution.",
  cursor: "This task is a small, localized edit well-suited to inline editor assistance.",
};

function keywordMatches(keyword: string, word: string): boolean {
  return keyword.length <= 3 ? word === keyword : word.startsWith(keyword);
}

export class RouterService {
  /** Last heartbeat timestamp for an agent, or null if it was never seen */
  static getLastActive(agentName: string): string | null {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT last_active FROM agents
      WHERE ${normalizedAgentSql("id")} = ?
      ORDER BY last_active DESC
      LIMIT 1
    `).get(normalizeAgentName(agentName)) as { last_active: string } | undefined;
    return row?.last_active ?? null;
  }

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

    return withTransaction(() => {
      const task = db.prepare("SELECT id, assigned_agent, status FROM tasks WHERE id = ?").get(params.task_id) as
        | { id: string; assigned_agent: string | null; status: string }
        | undefined;
      if (!task) {
        return { ok: false, message: `Task '${params.task_id}' not found.` };
      }
      if (task.status === "completed") {
        return { ok: false, message: `Task ${params.task_id} is already completed; claim a new task instead.` };
      }
      if (task.assigned_agent && !sameAgent(task.assigned_agent, params.from_agent)) {
        return {
          ok: false,
          message: `Task ${params.task_id} is assigned to ${task.assigned_agent}, not ${params.from_agent}; only the owner can hand it off.`,
        };
      }

      const now = new Date().toISOString();

      // 1. Update task assignment and keep the notes on the task for the receiver
      db.prepare(`
        UPDATE tasks
        SET assigned_agent = ?, handoff_notes = ?, updated_at = ?
        WHERE id = ?
      `).run(params.to_agent, params.handoff_notes, now, params.task_id);

      // 2. Transfer file locks to the new agent
      db.prepare(`
        UPDATE file_locks
        SET agent_name = ?
        WHERE task_id = ?
      `).run(params.to_agent, params.task_id);

      // 3. Log handoff in activity
      ActivityService.log(
        params.from_agent,
        "HANDOFF_TASK",
        `Handed off ${params.task_id} to ${params.to_agent}. Notes: ${params.handoff_notes}`
      );

      return {
        ok: true,
        message: `Task ${params.task_id} successfully transferred from ${params.from_agent} to ${params.to_agent}. File locks reassigned.`,
      };
    });
  }

  /** Suggest the best agent based on task type */
  static recommendAgent(taskDescription: string): {
    recommended_agent: string;
    rationale: string;
    matched_keywords: string[];
    matrix: Record<string, AgentSpecialty>;
  } {
    const words = taskDescription.toLowerCase().match(/[a-z0-9]+/g) ?? [];

    let best: { agent: string; matched: string[] } | null = null;
    for (const { agent, keywords } of ROUTING_KEYWORDS) {
      const matched = keywords.filter((kw) => words.some((w) => keywordMatches(kw, w)));
      if (matched.length > 0 && (!best || matched.length > best.matched.length)) {
        best = { agent, matched };
      }
    }

    if (!best) {
      return {
        recommended_agent: "antigravity",
        rationale: "General architecture and code design defaults to Antigravity for comprehensive workspace control.",
        matched_keywords: [],
        matrix: AGENT_MATRIX,
      };
    }

    return {
      recommended_agent: best.agent,
      rationale: ROUTING_RATIONALE[best.agent],
      matched_keywords: best.matched,
      matrix: AGENT_MATRIX,
    };
  }
}
