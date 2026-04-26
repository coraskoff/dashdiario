import { supabase } from "@/integrations/supabase/client";
import type { Project } from "./types";

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function createProject(name: string): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Informe um nome para o projeto.");
  if (trimmed.length > 60) throw new Error("Nome muito longo (máx. 60).");
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: trimmed })
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/** Deterministic color per project id — semantic anchor for scanning. */
const PALETTE = [
  "oklch(0.65 0.15 250)", // blue
  "oklch(0.62 0.16 155)", // green
  "oklch(0.68 0.16 60)",  // amber
  "oklch(0.62 0.18 25)",  // red
  "oklch(0.62 0.16 310)", // magenta
  "oklch(0.65 0.13 200)", // teal
  "oklch(0.65 0.15 90)",  // olive
  "oklch(0.6 0.18 290)",  // violet
];

export function projectColor(project: { id: string; color: string | null }): string {
  if (project.color) return project.color;
  let h = 0;
  for (let i = 0; i < project.id.length; i++) {
    h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
