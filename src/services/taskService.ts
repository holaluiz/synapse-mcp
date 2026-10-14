import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/database.js";
import type { Task, FileLock } from "../contracts/types.js";

export interface ClaimResult {
  ok: boolean;
  task?: Task;
  error?: string;
  conflictingLocks?: FileLock[];
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
    const lockPatterns = params.lock_patterns || [];

    // 1. Check for conflicts on requested file patterns
    if (lockPatterns.length > 0) {
      const placeholders = lockPatterns.map(() => "?").join(",");
      const stmt = db.prepare(
        `SELECT pattern, task_id, agent_name, created_at FROM file_locks WHERE pattern IN (${placeholders})`
      );
      const conflicts = stmt.all(...lockPatterns) as unknown as FileLock[];

      // Filter out locks owned by the same agent if needed
      const externalConflicts = conflicts.filter((c) => c.agent_name !== params.agent_name);
      if (externalConflicts.length > 0) {
        const details = externalConflicts
          .map((c) => `'${c.pattern}' is currently locked by ${c.agent_name} (Task: ${c.task_id}) since ${c.created_at}`)
          .join("; ");
        return {
          ok: false,
          error: `File lock collision detected: ${details}. Coordinate or wait before editing.`,
          conflictingLocks: externalConflicts,
        };
      }
    }

    const taskId = `task-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // 2. Insert task
    const insertTask = db.prepare(`
      INSERT INTO tasks (id, title, description, assigned_agent, status, locked_patterns, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)
    `);
    insertTask.run(
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
    db.prepare(`
      INSERT INTO activity_log (agent_name, action, details)
      VALUES (?, 'CLAIM_TASK', ?)
    `).run(params.agent_name, `Claimed task '${params.title}' (${taskId}) with locks: ${lockPatterns.join(", ")}`);

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
  }

  /** Release or complete a task and release all its file locks */
  static releaseTask(params: {
    agent_name: string;
    task_id: string;
    summary: string;
    status?: "completed" | "blocked" | "pending";
  }): { ok: boolean; message: string } {
    const db = getDatabase();
    const finalStatus = params.status || "completed";
    const now = new Date().toISOString();

    // 1. Release file locks
    db.prepare("DELETE FROM file_locks WHERE task_id = ?").run(params.task_id);

    // 2. Update task
    const update = db.prepare(`
      UPDATE tasks 
      SET status = ?, updated_at = ? 
      WHERE id = ?
    `);
    update.run(finalStatus, now, params.task_id);

    // 3. Log activity
    db.prepare(`
      INSERT INTO activity_log (agent_name, action, details)
      VALUES (?, 'RELEASE_TASK', ?)
    `).run(params.agent_name, `Task ${params.task_id} marked as ${finalStatus}: ${params.summary}`);

    return {
      ok: true,
      message: `Task ${params.task_id} released as '${finalStatus}'. All file locks cleared.`,
    };
  }

  /** List all active tasks and locks */
  static getActiveTasks(): { tasks: Task[]; activeLocks: FileLock[] } {
    const db = getDatabase();
    const rawTasks = db.prepare(`
      SELECT id, title, description, assigned_agent, status, locked_patterns, created_at, updated_at
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
