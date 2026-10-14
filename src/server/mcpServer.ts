import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ClaimTaskInputSchema,
  GetActivityInputSchema,
  HandoffTaskInputSchema,
  InvestigateUnknownInputSchema,
  ListUnknownsInputSchema,
  QueryMemoryInputSchema,
  RecommendAgentInputSchema,
  RecordDecisionInputSchema,
  RecordKnowledgeInputSchema,
  RecordUnknownInputSchema,
  ReleaseTaskInputSchema,
  ResolveUnknownInputSchema,
} from "../contracts/types.js";
import { TaskService } from "../services/taskService.js";
import { MemoryService } from "../services/memoryService.js";
import { UnknownService } from "../services/unknownService.js";
import { RouterService } from "../services/routerService.js";
import { ActivityService } from "../services/activityService.js";
import { getDatabase, getDatabasePath } from "../db/database.js";
import { VERSION } from "../version.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

function text(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }] };
}

function json(payload: unknown): CallToolResult {
  return text(JSON.stringify(payload, null, 2));
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

export function createSynapseServer(): McpServer {
  const server = new McpServer({
    name: "synapse-mcp",
    version: VERSION,
  });

  // 1. Task: Claim
  server.registerTool(
    "synapse_claim_task",
    {
      description:
        "Claim a task and lock file patterns to prevent collisions with other agents (Claude, Codex, Antigravity). " +
        "Globs, directories and files are compared by overlap, so 'src/auth/**' blocks 'src/auth/login.ts'.",
      inputSchema: ClaimTaskInputSchema.shape,
      annotations: WRITE,
    },
    async ({ agent_name, title, description, lock_patterns }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const result = TaskService.claimTask({ agent_name, title, description, lock_patterns });

      if (!result.ok) {
        return fail(result.error || "Failed to claim task");
      }
      return json({
        message: `Task '${title}' claimed successfully. Locks acquired.`,
        task: result.task,
      });
    }
  );

  // 2. Task: Release / Complete
  server.registerTool(
    "synapse_release_task",
    {
      description:
        "Complete or release a task you own, freeing all associated file locks for other agents. " +
        "Use force only to clear stale locks left by an agent that is gone.",
      inputSchema: ReleaseTaskInputSchema.shape,
      annotations: { ...WRITE, destructiveHint: true },
    },
    async ({ agent_name, task_id, summary, status, force }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const result = TaskService.releaseTask({ agent_name, task_id, summary, status, force });
      return result.ok ? text(result.message) : fail(result.message);
    }
  );

  // 3. Task: List Active Tasks and Locks
  server.registerTool(
    "synapse_get_tasks",
    {
      description:
        "List all ongoing tasks, assigned agents, handoff notes, and currently locked files across all agents",
      annotations: READ_ONLY,
    },
    async () => json(TaskService.getActiveTasks())
  );

  // 4. Memory: Record Decision (ADR)
  server.registerTool(
    "synapse_record_decision",
    {
      description:
        "Record an Architectural Decision Record (ADR) so other agents understand and respect key technical choices",
      inputSchema: RecordDecisionInputSchema.shape,
      annotations: WRITE,
    },
    async ({ agent_name, title, context, decision, consequences }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const record = MemoryService.recordDecision({ agent_name, title, context, decision, consequences });
      return json({
        message: `Architectural Decision Record saved (${record.id}). Visible to all agents.`,
        decision: record,
      });
    }
  );

  // 5. Memory: Record Knowledge
  server.registerTool(
    "synapse_record_knowledge",
    {
      description:
        "Save project conventions, API patterns, configuration gotchas, or reusable knowledge for other agents",
      inputSchema: RecordKnowledgeInputSchema.shape,
      annotations: WRITE,
    },
    async ({ agent_name, category, topic, content, tags }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const record = MemoryService.recordKnowledge({ agent_name, category, topic, content, tags });
      return json({
        message: `Knowledge recorded (${record.id}).`,
        knowledge: record,
      });
    }
  );

  // 6. Memory: Query Memory
  server.registerTool(
    "synapse_query_memory",
    {
      description: "Search shared decisions and knowledge base across the project",
      inputSchema: QueryMemoryInputSchema.shape,
      annotations: READ_ONLY,
    },
    async ({ query, category }) => json(MemoryService.queryMemory({ query, category }))
  );

  // 7. Unknowns: Record Unknown Gap
  server.registerTool(
    "synapse_record_unknown",
    {
      description:
        "Flag an unresolved question, missing spec, or unexplained bug so another agent can investigate it",
      inputSchema: RecordUnknownInputSchema.shape,
      annotations: WRITE,
    },
    async ({ agent_name, question, context, severity }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const unk = UnknownService.recordUnknown({ agent_name, question, context, severity });
      return json({
        message: `Gap reported (${unk.id}) with severity '${severity}'. Other agents can view and resolve.`,
        unknown: unk,
      });
    }
  );

  // 8. Unknowns: Investigate Unknown Gap
  server.registerTool(
    "synapse_investigate_unknown",
    {
      description:
        "Take ownership of an open gap by marking it 'investigating', so other agents don't duplicate the investigation",
      inputSchema: InvestigateUnknownInputSchema.shape,
      annotations: WRITE,
    },
    async ({ agent_name, unknown_id }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const res = UnknownService.investigateUnknown({ agent_name, unknown_id });
      return res.ok ? text(res.message) : fail(res.message);
    }
  );

  // 9. Unknowns: Resolve Unknown Gap
  server.registerTool(
    "synapse_resolve_unknown",
    {
      description: "Resolve an open gap with a verified explanation or fix",
      inputSchema: ResolveUnknownInputSchema.shape,
      annotations: WRITE,
    },
    async ({ agent_name, unknown_id, resolution }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const res = UnknownService.resolveUnknown({ agent_name, unknown_id, resolution });
      return res.ok ? text(res.message) : fail(res.message);
    }
  );

  // 10. Unknowns: List Unknowns
  server.registerTool(
    "synapse_list_unknowns",
    {
      description: "List unresolved questions, gaps, or bugs reported by any agent, most severe first",
      inputSchema: ListUnknownsInputSchema.shape,
      annotations: READ_ONLY,
    },
    async ({ status }) => json(UnknownService.listUnknowns(status))
  );

  // 11. Router: Handoff Task
  server.registerTool(
    "synapse_handoff_task",
    {
      description:
        "Hand off a task you own and its file locks to another agent (e.g. Antigravity -> Claude Code for test runs). " +
        "The notes are shown to the receiver in synapse_get_tasks.",
      inputSchema: HandoffTaskInputSchema.shape,
      annotations: WRITE,
    },
    async ({ from_agent, to_agent, task_id, handoff_notes }) => {
      RouterService.heartbeat({ agent_name: from_agent, client_type: from_agent });
      const result = RouterService.handoffTask({ from_agent, to_agent, task_id, handoff_notes });
      return result.ok ? text(result.message) : fail(result.message);
    }
  );

  // 12. Router: Recommend Agent
  server.registerTool(
    "synapse_recommend_agent",
    {
      description:
        "Consult the agent specialty matrix to determine which AI agent is best equipped for a given task",
      inputSchema: RecommendAgentInputSchema.shape,
      annotations: READ_ONLY,
    },
    async ({ task_description }) => json(RouterService.recommendAgent(task_description))
  );

  // 13. Presence: Active Agents
  server.registerTool(
    "synapse_get_active_agents",
    {
      description: "See which AI agents are currently active on this project and what they are working on",
      annotations: READ_ONLY,
    },
    async () =>
      json({
        active_agents: RouterService.getActiveAgents(),
        database_location: getDatabasePath(),
      })
  );

  // 14. Audit: Activity Log
  server.registerTool(
    "synapse_get_activity",
    {
      description:
        "Read the shared audit trail (claims, releases, handoffs, decisions, gaps), newest first. " +
        "Use 'since' to catch up on what other agents did while you were away.",
      inputSchema: GetActivityInputSchema.shape,
      annotations: READ_ONLY,
    },
    async ({ limit, agent_name, since }) => json(ActivityService.list({ limit, agent_name, since }))
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  // Open the database up front so a broken workspace fails loudly at startup
  getDatabase();
  const server = createSynapseServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[synapse-mcp] v${VERSION} connected via stdio. Database: ${getDatabasePath()}\n`);
}
