import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TaskService } from "../services/taskService.js";
import { MemoryService } from "../services/memoryService.js";
import { UnknownService } from "../services/unknownService.js";
import { RouterService } from "../services/routerService.js";
import { getDatabasePath } from "../db/database.js";

export function createSynapseServer(): McpServer {
  const server = new McpServer({
    name: "synapse-mcp",
    version: "0.1.0",
  });

  // 1. Task: Claim
  server.tool(
    "synapse_claim_task",
    "Claim a task and lock file patterns to prevent collisions with other agents (Claude, Codex, Antigravity)",
    {
      agent_name: z.string().describe("Your agent name, e.g. 'antigravity', 'claude-code', 'codex'"),
      title: z.string().describe("Title/summary of the task to work on"),
      description: z.string().optional().describe("Detailed scope and goals"),
      lock_patterns: z.array(z.string()).optional().describe("Files or patterns you will modify, e.g. ['src/auth/**', 'package.json']"),
    },
    async ({ agent_name, title, description, lock_patterns }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const result = TaskService.claimTask({
        agent_name,
        title,
        description,
        lock_patterns,
      });

      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error || "Failed to claim task" }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Task '${title}' claimed successfully. Locks acquired.`,
                task: result.task,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 2. Task: Release / Complete
  server.tool(
    "synapse_release_task",
    "Complete or release a task, freeing all associated file locks for other agents",
    {
      agent_name: z.string().describe("Your agent name"),
      task_id: z.string().describe("Task ID to release"),
      summary: z.string().describe("Summary of what was done or reason for release"),
      status: z.enum(["completed", "blocked", "pending"]).default("completed").describe("Final status of the task"),
    },
    async ({ agent_name, task_id, summary, status }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const result = TaskService.releaseTask({
        agent_name,
        task_id,
        summary,
        status,
      });

      return {
        content: [{ type: "text", text: result.message }],
      };
    }
  );

  // 3. Task: List Active Tasks and Locks
  server.tool(
    "synapse_get_tasks",
    "List all ongoing tasks, assigned agents, and currently locked files across all agents",
    {},
    async () => {
      const active = TaskService.getActiveTasks();
      return {
        content: [{ type: "text", text: JSON.stringify(active, null, 2) }],
      };
    }
  );

  // 4. Memory: Record Decision (ADR)
  server.tool(
    "synapse_record_decision",
    "Record an Architectural Decision Record (ADR) so other agents understand and respect key technical choices",
    {
      agent_name: z.string().describe("Your agent name"),
      title: z.string().describe("Short title of the architectural decision"),
      context: z.string().describe("Why this decision was made and what was considered"),
      decision: z.string().describe("The exact chosen approach, library, or rule"),
      consequences: z.string().optional().describe("Trade-offs or implications of this decision"),
    },
    async ({ agent_name, title, context, decision, consequences }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const record = MemoryService.recordDecision({
        agent_name,
        title,
        context,
        decision,
        consequences,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Architectural Decision Record saved (${record.id}). Visible to all agents.`,
                decision: record,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 5. Memory: Record Knowledge
  server.tool(
    "synapse_record_knowledge",
    "Save project conventions, API patterns, configuration gotchas, or reusable knowledge for other agents",
    {
      agent_name: z.string().describe("Your agent name"),
      category: z.string().describe("Category, e.g. 'architecture', 'api', 'testing', 'conventions'"),
      topic: z.string().describe("Specific subject/topic"),
      content: z.string().describe("The knowledge content, markdown allowed"),
      tags: z.array(z.string()).optional().describe("Tags for quick discovery"),
    },
    async ({ agent_name, category, topic, content, tags }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const record = MemoryService.recordKnowledge({
        agent_name,
        category,
        topic,
        content,
        tags,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Knowledge recorded (${record.id}).`,
                knowledge: record,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 6. Memory: Query Memory
  server.tool(
    "synapse_query_memory",
    "Search shared decisions and knowledge base across the project",
    {
      query: z.string().optional().describe("Search keyword or phrase"),
      category: z.string().optional().describe("Filter by category"),
    },
    async ({ query, category }) => {
      const results = MemoryService.queryMemory({ query, category });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  // 7. Unknowns: Record Unknown Gap
  server.tool(
    "synapse_record_unknown",
    "Flag an unresolved question, missing spec, or unexplained bug so another agent can investigate it",
    {
      agent_name: z.string().describe("Your agent name"),
      question: z.string().describe("The unanswered question or unexplained issue"),
      context: z.string().optional().describe("Affected files, reproduction details, or hints"),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    },
    async ({ agent_name, question, context, severity }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const unk = UnknownService.recordUnknown({
        agent_name,
        question,
        context,
        severity,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Gap reported (${unk.id}) with severity '${severity}'. Other agents can view and resolve.`,
                unknown: unk,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // 8. Unknowns: Resolve Unknown Gap
  server.tool(
    "synapse_resolve_unknown",
    "Resolve an open gap with a verified explanation or fix",
    {
      agent_name: z.string().describe("Your agent name"),
      unknown_id: z.string().describe("ID of the unknown being resolved"),
      resolution: z.string().describe("Detailed resolution, explanation, or fix"),
    },
    async ({ agent_name, unknown_id, resolution }) => {
      RouterService.heartbeat({ agent_name, client_type: agent_name });
      const res = UnknownService.resolveUnknown({
        agent_name,
        unknown_id,
        resolution,
      });

      return {
        content: [{ type: "text", text: res.message }],
      };
    }
  );

  // 9. Unknowns: List Unknowns
  server.tool(
    "synapse_list_unknowns",
    "List unresolved questions, gaps, or bugs reported by any agent",
    {
      status: z.enum(["open", "investigating", "resolved", "all"]).default("open"),
    },
    async ({ status }) => {
      const unknowns = UnknownService.listUnknowns(status as any);
      return {
        content: [{ type: "text", text: JSON.stringify(unknowns, null, 2) }],
      };
    }
  );

  // 10. Router: Handoff Task
  server.tool(
    "synapse_handoff_task",
    "Hand off a task and its file locks from one agent to another (e.g. Antigravity -> Claude Code for test runs)",
    {
      from_agent: z.string().describe("Your agent name"),
      to_agent: z.string().describe("Agent to receive the task (e.g. 'claude-code', 'antigravity', 'codex')"),
      task_id: z.string().describe("Task ID to transfer"),
      handoff_notes: z.string().describe("Instructions and context for the receiving agent"),
    },
    async ({ from_agent, to_agent, task_id, handoff_notes }) => {
      RouterService.heartbeat({ agent_name: from_agent, client_type: from_agent });
      const result = RouterService.handoffTask({
        from_agent,
        to_agent,
        task_id,
        handoff_notes,
      });

      return {
        content: [{ type: "text", text: result.message }],
      };
    }
  );

  // 11. Router: Recommend Agent
  server.tool(
    "synapse_recommend_agent",
    "Consult the agent specialty matrix to determine which AI agent is best equipped for a given task",
    {
      task_description: z.string().describe("Description of what needs to be done"),
    },
    async ({ task_description }) => {
      const recommendation = RouterService.recommendAgent(task_description);
      return {
        content: [{ type: "text", text: JSON.stringify(recommendation, null, 2) }],
      };
    }
  );

  // 12. Presence: Active Agents
  server.tool(
    "synapse_get_active_agents",
    "See which AI agents are currently active on this project and what they are working on",
    {},
    async () => {
      const agents = RouterService.getActiveAgents();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                active_agents: agents,
                database_location: getDatabasePath(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createSynapseServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[synapse-mcp] Connected via stdio. Database: ${getDatabasePath()}\n`);
}
