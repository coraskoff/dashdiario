import { all, one, run, uid, nowIso } from "@/lib/db";
import type { ProjectGoal, TimerGoal, TimerSession } from "./types";

// SQLite guarda boolean como 0/1 — normalizamos ao ler.
type SessionRow = Omit<TimerSession, "completed"> & { completed: number | boolean };
function mapSession(r: SessionRow): TimerSession {
  return { ...r, completed: !!r.completed };
}

export async function fetchSessions(sinceIso?: string): Promise<TimerSession[]> {
  const rows = sinceIso
    ? await all<SessionRow>(
        `SELECT * FROM timer_sessions
         WHERE ended_at IS NOT NULL AND started_at >= $1
         ORDER BY started_at DESC LIMIT 2000`,
        [sinceIso],
      )
    : await all<SessionRow>(
        `SELECT * FROM timer_sessions
         WHERE ended_at IS NOT NULL
         ORDER BY started_at DESC LIMIT 2000`,
      );
  return rows.map(mapSession);
}

export async function createSession(input: {
  project_id: string | null;
  tag: string | null;
  mode: TimerSession["mode"];
  planned_seconds: number | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  completed: boolean;
}): Promise<TimerSession> {
  const id = uid();
  const now = nowIso();
  await run(
    `INSERT INTO timer_sessions
       (id, project_id, tag, mode, planned_seconds, started_at, ended_at, duration_seconds, completed, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      input.project_id,
      input.tag,
      input.mode,
      input.planned_seconds,
      input.started_at,
      input.ended_at,
      input.duration_seconds,
      input.completed ? 1 : 0,
      now,
      now,
    ],
  );
  return {
    id,
    project_id: input.project_id,
    tag: input.tag,
    mode: input.mode,
    planned_seconds: input.planned_seconds,
    started_at: input.started_at,
    ended_at: input.ended_at,
    duration_seconds: input.duration_seconds,
    completed: input.completed,
    created_at: now,
    updated_at: now,
  };
}

export async function deleteSession(id: string): Promise<void> {
  await run(`DELETE FROM timer_sessions WHERE id = $1`, [id]);
}

export async function fetchGoal(): Promise<TimerGoal | null> {
  return one<TimerGoal>(
    `SELECT * FROM timer_goals ORDER BY created_at ASC LIMIT 1`,
  );
}

export async function setGoal(weekly_seconds: number): Promise<TimerGoal> {
  const existing = await fetchGoal();
  const now = nowIso();
  if (existing) {
    await run(`UPDATE timer_goals SET weekly_seconds = $1, updated_at = $2 WHERE id = $3`, [
      weekly_seconds,
      now,
      existing.id,
    ]);
    return { ...existing, weekly_seconds };
  }
  const id = uid();
  await run(
    `INSERT INTO timer_goals (id, weekly_seconds, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    [id, weekly_seconds, now, now],
  );
  return { id, weekly_seconds } as TimerGoal;
}

export async function fetchProjectGoals(): Promise<ProjectGoal[]> {
  return all<ProjectGoal>(`SELECT * FROM timer_project_goals`);
}

export async function setProjectGoal(
  project_id: string,
  weekly_seconds: number,
): Promise<void> {
  if (weekly_seconds <= 0) {
    await run(`DELETE FROM timer_project_goals WHERE project_id = $1`, [project_id]);
    return;
  }
  const now = nowIso();
  await run(
    `INSERT INTO timer_project_goals (id, project_id, weekly_seconds, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(project_id) DO UPDATE SET weekly_seconds = excluded.weekly_seconds, updated_at = excluded.updated_at`,
    [uid(), project_id, weekly_seconds, now, now],
  );
}
