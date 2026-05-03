import { supabase } from "@/integrations/supabase/client";
import type { Task, TaskInput, TaskStatus } from "./types";

function normalizeTitle(title: string): string {
  return title.trim();
}

function assertValidTask(input: TaskInput) {
  const title = normalizeTitle(input.title);
  if (!title) throw new Error("O título da tarefa é obrigatório.");
  if (title.length > 200) throw new Error("Título muito longo (máx. 200).");
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(0, 1999);
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function reorderTasks(ids: string[]): Promise<void> {
  const updates = ids.map((id, i) => ({ id, position: i * 10 }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from("tasks")
    .upsert(updates as any, { onConflict: "id" });
  if (error) throw error;
}

export async function createTask(input: TaskInput): Promise<Task> {
  assertValidTask(input);
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
      due_date: input.due_date ?? null,
      project_id: input.project_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  assertValidTask(input);
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
      due_date: input.due_date ?? null,
      project_id: input.project_id ?? null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function setTaskDueDate(id: string, dueDate: string | null): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ due_date: dueDate })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function setTaskProject(id: string, projectId: string | null): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ project_id: projectId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
