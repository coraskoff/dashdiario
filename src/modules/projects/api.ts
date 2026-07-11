import { all, run, uid, nowIso } from "@/lib/db";
import type { Project } from "./types";

export async function fetchProjects(): Promise<Project[]> {
  return all<Project>(`SELECT * FROM projects ORDER BY created_at ASC`);
}

export async function createProject(name: string): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Informe um nome para o projeto.");
  if (trimmed.length > 60) throw new Error("Nome muito longo (máx. 60).");
  const id = uid();
  const now = nowIso();
  await run(
    `INSERT INTO projects (id, name, color, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, $4)`,
    [id, trimmed, now, now],
  );
  return { id, name: trimmed, color: null, created_at: now, updated_at: now };
}

export async function deleteProject(id: string): Promise<void> {
  // Sem FK ativa no SQLite local — soltamos as referências manualmente
  // pra não deixar tarefas/metas apontando pra um projeto que não existe mais.
  await run(`UPDATE tasks SET project_id = NULL WHERE project_id = $1`, [id]);
  await run(`DELETE FROM timer_project_goals WHERE project_id = $1`, [id]);
  await run(`DELETE FROM projects WHERE id = $1`, [id]);
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
