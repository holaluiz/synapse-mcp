import { z } from "zod";

export interface Agent {
  id: string;
  name: string;
  client_type: string;
  last_active: string;
  current_task_id?: string | null;
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  assigned_agent?: string | null;
  status: TaskStatus;
  locked_patterns: string[];
  created_at: string;
  updated_at: string;
}

export interface FileLock {
  pattern: string;
  task_id: string;
  agent_name: string;
  created_at: string;
}

export interface Decision {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences?: string | null;
  author_agent: string;
  created_at: string;
}

export interface Knowledge {
  id: string;
  category: string;
  topic: string;
  content: string;
  tags?: string[] | null;
  author_agent: string;
  updated_at: string;
}

export type UnknownSeverity = "low" | "medium" | "high" | "critical";
export type UnknownStatus = "open" | "investigating" | "resolved";

export interface UnknownGap {
  id: string;
  question: string;
  context?: string | null;
  severity: UnknownSeverity;
  status: UnknownStatus;
  resolution?: string | null;
  author_agent: string;
  resolved_by?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

// Zod Input Schemas for Tools

export const ClaimTaskInputSchema = z.object({
  agent_name: z.string().describe("Identifier of the agent claiming the task (e.g. 'claude-code', 'antigravity', 'codex')"),
  title: z.string().describe("Clear, concise summary of the task to be done"),
  description: z.string().optional().describe("Detailed scope, intent, and acceptance criteria"),
  lock_patterns: z.array(z.string()).optional().describe("Files or glob patterns that this agent intends to edit (e.g. ['src/auth/**', 'package.json'])"),
});

export const ReleaseTaskInputSchema = z.object({
  agent_name: z.string().describe("Agent releasing the task"),
  task_id: z.string().describe("The ID of the task being completed or released"),
  summary: z.string().describe("Summary of what was achieved or reason for release"),
  status: z.enum(["completed", "blocked", "pending"]).default("completed").describe("Final status of the task"),
});

export const RecordDecisionInputSchema = z.object({
  agent_name: z.string().describe("Agent authoring the architectural decision"),
  title: z.string().describe("Title of the Architectural Decision Record (ADR)"),
  context: z.string().describe("Why this decision was needed and alternatives considered"),
  decision: z.string().describe("The exact chosen decision, convention, or pattern"),
  consequences: z.string().optional().describe("Positive, negative, or trade-off consequences of this decision"),
});

export const QueryMemoryInputSchema = z.object({
  query: z.string().optional().describe("Keyword or topic to search across decisions and knowledge base"),
  category: z.string().optional().describe("Optional filter by category (e.g. 'architecture', 'api', 'rules')"),
});

export const RecordUnknownInputSchema = z.object({
  agent_name: z.string().describe("Agent reporting this unknown or unanswered gap"),
  question: z.string().describe("Specific unresolved question, unexpected bug, or missing design spec"),
  context: z.string().optional().describe("Target files, observed behaviors, or reproduction hints"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium").describe("Impact level of this gap"),
});

export const ResolveUnknownInputSchema = z.object({
  agent_name: z.string().describe("Agent that investigated and resolved the gap"),
  unknown_id: z.string().describe("ID of the unknown being resolved"),
  resolution: z.string().describe("The answer, fix, or verified explanation that closes this gap"),
});

export const HandoffTaskInputSchema = z.object({
  from_agent: z.string().describe("Agent initiating the handoff"),
  to_agent: z.string().describe("Target agent to take over (e.g. 'claude-code', 'antigravity', 'codex')"),
  task_id: z.string().describe("ID of the task to hand off"),
  handoff_notes: z.string().describe("What was already completed, what remains to be done, and test instructions"),
});

export const HeartbeatInputSchema = z.object({
  agent_name: z.string().describe("Agent identifier sending heartbeat"),
  client_type: z.string().describe("Client platform ('claude_code', 'antigravity', 'codex', 'cursor', etc.)"),
  current_task_id: z.string().optional().describe("Task currently being worked on, if any"),
});
