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
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createTask(input: TaskInput): Promise<Task> {
  assertValidTask(input);
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
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
    })
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
