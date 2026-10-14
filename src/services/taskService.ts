import { randomUUID } from "node:crypto";
import { getDatabase, getWorkspaceRoot, withTransaction } from "../db/database.js";
import type { Task, FileLock } from "../contracts/types.js";
import { ActivityService } from "./activityService.js";
import { sameAgent } from "./agentIdentity.js";
import { lockPatternsOverlap, normalizeLockPattern } from "./lockPatterns.js";
import { RouterService } from "./routerService.js";

export interface ClaimResult {
  ok: boolean;
  task?: Task;
  error?: string;
  conflictingLocks?: FileLock[];
}

function describeLastSeen(agentName: string): string {
  const lastActive = RouterService.getLastActive(agentName);
  if (!lastActive) {
    return "holder has no recorded activity";
  }
  const minutes = Math.floor((Date.now() - new Date(lastActive).getTime()) / 60_000);
  return minutes < 1 ? "holder active within the last minute" : `holder last seen ${minutes} min ago`;
}

export class TaskService {
  /** Claim a new task and lock specific file patterns */
  static claimTask(params: {
    agent_name: string;
    title: string;
    description?: string;
    lock_patterns?: string[];
  }): ClaimResult {
    const db = getDatabase();
    const root = getWorkspaceRoot();
    const lockPatterns = [...new Set((params.lock_patterns || []).map((p) => normalizeLockPattern(p, root)))];

    // Conflict check and inserts share one write transaction, so two agents
    // racing for overlapping patterns cannot both succeed.
    return withTransaction((): ClaimResult => {
      // 1. Check for conflicts: any held pattern that overlaps a requested one
      if (lockPatterns.length > 0) {
        const held = db.prepare(
          "SELECT pattern, task_id, agent_name, created_at FROM file_locks"
        ).all() as unknown as FileLock[];

        const externalConflicts = held.filter(
          (lock) =>
            !sameAgent(lock.agent_name, params.agent_name) &&
            lockPatterns.some((p) => lockPatternsOverlap(p, lock.pattern, root))
        );
        if (externalConflicts.length > 0) {
          const details = externalConflicts
            .map(
              (c) =>
                `'${c.pattern}' is currently locked by ${c.agent_name} (Task: ${c.task_id}) since ${c.created_at}; ${describeLastSeen(c.agent_name)}`
            )
            .join("; ");
          return {
            ok: false,
            error:
              `File lock collision detected: ${details}. Coordinate or wait before editing. ` +
              `If the holder crashed and the lock is stale, release it with synapse_release_task (force: true).`,
            conflictingLocks: externalConflicts,
          };
        }
      }

      const taskId = `task-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      // 2. Insert task
      db.prepare(`
        INSERT INTO tasks (id, title, description, assigned_agent, status, locked_patterns, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)
      `).run(
        taskId,
        params.title,
        params.description || null,
        params.agent_name,
        JSON.stringify(lockPatterns),
        now,
        now
      );

      // 3. Insert file locks
      if (lockPatterns.length > 0) {
        const insertLock = db.prepare(`
          INSERT OR REPLACE INTO file_locks (pattern, task_id, agent_name, created_at)
          VALUES (?, ?, ?, ?)
        `);
        for (const pattern of lockPatterns) {
          insertLock.run(pattern, taskId, params.agent_name, now);
        }
      }

      // 4. Log activity
      ActivityService.log(
        params.agent_name,
        "CLAIM_TASK",
        `Claimed task '${params.title}' (${taskId}) with locks: ${lockPatterns.join(", ")}`
      );

      return {
        ok: true,
        task: {
          id: taskId,
          title: params.title,
          description: params.description,
          assigned_agent: params.agent_name,
          status: "in_progress",
          locked_patterns: lockPatterns,
          created_at: now,
          updated_at: now,
        },
      };
    });
  }

  /** Release or complete a task and release all its file locks */
  static releaseTask(params: {
    agent_name: string;
    task_id: string;
    summary: string;
    status?: "completed" | "blocked" | "pending";
    force?: boolean;
  }): { ok: boolean; message: string } {
    const db = getDatabase();
    const finalStatus = params.status || "completed";

    return withTransaction(() => {
      const task = db.prepare("SELECT id, assigned_agent FROM tasks WHERE id = ?").get(params.task_id) as
        | { id: string; assigned_agent: string | null }
        | undefined;
      if (!task) {
        return { ok: false, message: `Task '${params.task_id}' not found.` };
      }

      const isOwner = !task.assigned_agent || sameAgent(task.assigned_agent, params.agent_name);
      if (!isOwner && !params.force) {
        return {
          ok: false,
          message:
            `Task ${params.task_id} is assigned to ${task.assigned_agent}; only the owner can release it. ` +
            `Use synapse_handoff_task to coordinate, or pass force: true if the owner is gone and its locks are stale.`,
        };
      }

      const now = new Date().toISOString();

      // 1. Release file locks
      db.prepare("DELETE FROM file_locks WHERE task_id = ?").run(params.task_id);

      // 2. Update task
      db.prepare(`
        UPDATE tasks
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(finalStatus, now, params.task_id);

      // 3. Log activity
      if (isOwner) {
        ActivityService.log(params.agent_name, "RELEASE_TASK", `Task ${params.task_id} marked as ${finalStatus}: ${params.summary}`);
      } else {
        ActivityService.log(
          params.agent_name,
          "FORCE_RELEASE_TASK",
          `Force-released ${task.assigned_agent}'s task ${params.task_id} as ${finalStatus}: ${params.summary}`
        );
      }

      return {
        ok: true,
        message: `Task ${params.task_id} released as '${finalStatus}'. All file locks cleared.`,
      };
    });
  }

  /** List all active tasks and locks */
  static getActiveTasks(): { tasks: Task[]; activeLocks: FileLock[] } {
    const db = getDatabase();
    const rawTasks = db.prepare(`
      SELECT id, title, description, assigned_agent, status, locked_patterns, handoff_notes, created_at, updated_at
      FROM tasks
      WHERE status IN ('in_progress', 'pending', 'blocked')
      ORDER BY updated_at DESC
    `).all() as any[];

    const tasks: Task[] = rawTasks.map((t) => ({
      ...t,
      locked_patterns: t.locked_patterns ? JSON.parse(t.locked_patterns) : [],
    }));

    const activeLocks = db.prepare(`
      SELECT pattern, task_id, agent_name, created_at FROM file_locks
    `).all() as unknown as FileLock[];

    return { tasks, activeLocks };
  }
}
