import { all, one, run, uid, nowIso } from "@/lib/db";
import type { Task, TaskInput, TaskStatus } from "./types";

function normalizeTitle(title: string): string {
  return title.trim();
}

function assertValidTask(input: TaskInput) {
  const title = normalizeTitle(input.title);
  if (!title) throw new Error("O título da tarefa é obrigatório.");
  if (title.length > 200) throw new Error("Título muito longo (máx. 200).");
}

async function getTask(id: string): Promise<Task> {
  const t = await one<Task>(`SELECT * FROM tasks WHERE id = $1`, [id]);
  if (!t) throw new Error("Tarefa não encontrada.");
  return t;
}

export async function fetchTasks(): Promise<Task[]> {
  return all<Task>(
    `SELECT * FROM tasks
     ORDER BY status ASC,
       due_date IS NULL, due_date ASC,
       position IS NULL, position ASC,
       created_at DESC
     LIMIT 2000`,
  );
}

export async function reorderTasks(ids: string[]): Promise<void> {
  const now = nowIso();
  for (let i = 0; i < ids.length; i++) {
    await run(`UPDATE tasks SET position = $1, updated_at = $2 WHERE id = $3`, [
      i * 10,
      now,
      ids[i],
    ]);
  }
}

export async function createTask(input: TaskInput): Promise<Task> {
  assertValidTask(input);
  const id = uid();
  const now = nowIso();
  const title = normalizeTitle(input.title);
  const description = input.description?.trim() || null;
  const due_date = input.due_date ?? null;
  const project_id = input.project_id ?? null;
  await run(
    `INSERT INTO tasks
       (id, title, description, status, due_date, project_id, position, completed_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, NULL, NULL, $6, $7)`,
    [id, title, description, due_date, project_id, now, now],
  );
  return {
    id,
    title,
    description,
    status: "pending",
    due_date,
    project_id,
    position: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  assertValidTask(input);
  await run(
    `UPDATE tasks SET title = $1, description = $2, due_date = $3, project_id = $4, updated_at = $5
     WHERE id = $6`,
    [
      normalizeTitle(input.title),
      input.description?.trim() || null,
      input.due_date ?? null,
      input.project_id ?? null,
      nowIso(),
      id,
    ],
  );
  return getTask(id);
}

export async function setTaskDueDate(id: string, dueDate: string | null): Promise<Task> {
  await run(`UPDATE tasks SET due_date = $1, updated_at = $2 WHERE id = $3`, [
    dueDate,
    nowIso(),
    id,
  ]);
  return getTask(id);
}

export async function setTaskProject(id: string, projectId: string | null): Promise<Task> {
  await run(`UPDATE tasks SET project_id = $1, updated_at = $2 WHERE id = $3`, [
    projectId,
    nowIso(),
    id,
  ]);
  return getTask(id);
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  await run(
    `UPDATE tasks SET status = $1, completed_at = $2, updated_at = $3 WHERE id = $4`,
    [status, status === "completed" ? nowIso() : null, nowIso(), id],
  );
  return getTask(id);
}

export async function deleteTask(id: string): Promise<void> {
  await run(`DELETE FROM tasks WHERE id = $1`, [id]);
}
