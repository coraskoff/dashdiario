import { all, one, run, uid, nowIso } from "@/lib/db";
import { derivePerformance, todayIso } from "./calc";
import type {
  BodyWeightLog,
  DietDish,
  DietLog,
  DietOverride,
  DietPlan,
  DietScheduleEntry,
  DietStatus,
  DietVariant,
  WorkoutCheckinInput,
  WorkoutExercise,
  WorkoutLog,
  WorkoutPlan,
  WorkoutScheduleEntry,
  WorkoutSession,
  WorkoutSetLog,
} from "./types";

// ============================================================ TREINO · PLANO

export async function fetchActivePlan(): Promise<WorkoutPlan | null> {
  const row = await one<WorkoutPlan>(
    `SELECT id, name, period_weeks, freq_target, started_at, ended_at, is_active
     FROM workout_plans WHERE is_active = 1 ORDER BY started_at DESC LIMIT 1`,
  );
  return row ? { ...row, freq_target: Number(row.freq_target) } : null;
}

export async function fetchPlanHistory(): Promise<WorkoutPlan[]> {
  return all<WorkoutPlan>(
    `SELECT id, name, period_weeks, freq_target, started_at, ended_at, is_active
     FROM workout_plans ORDER BY started_at DESC`,
  );
}

export async function fetchSessions(planId: string): Promise<WorkoutSession[]> {
  return all<WorkoutSession>(
    `SELECT id, plan_id, label, position FROM workout_sessions
     WHERE plan_id = $1 ORDER BY position, created_at`,
    [planId],
  );
}

export async function fetchExercises(sessionIds: string[]): Promise<WorkoutExercise[]> {
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map((_, i) => `$${i + 1}`).join(",");
  const rows = await all<WorkoutExercise>(
    `SELECT id, session_id, name, target_sets, target_reps, target_weight, position
     FROM workout_exercises WHERE session_id IN (${placeholders})
     ORDER BY position, created_at`,
    sessionIds,
  );
  return rows.map((r) => ({
    ...r,
    target_weight: r.target_weight == null ? null : Number(r.target_weight),
    target_sets: r.target_sets == null ? null : Number(r.target_sets),
  }));
}

export async function fetchSchedule(planId: string): Promise<WorkoutScheduleEntry[]> {
  return all<WorkoutScheduleEntry>(
    `SELECT id, plan_id, weekday, session_id FROM workout_schedule WHERE plan_id = $1`,
    [planId],
  );
}

export async function createPlan(input: {
  name: string;
  period_weeks: number | null;
  freq_target: number;
}): Promise<WorkoutPlan> {
  const now = nowIso();
  const id = uid();
  // Encerra o plano ativo anterior (vira histórico).
  await run(
    `UPDATE workout_plans SET is_active = 0, ended_at = COALESCE(ended_at, $1), updated_at = $1
     WHERE is_active = 1`,
    [now],
  );
  await run(
    `INSERT INTO workout_plans (id, name, period_weeks, freq_target, started_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, $5, $5)`,
    [id, input.name.trim(), input.period_weeks, input.freq_target, now],
  );
  return {
    id,
    name: input.name.trim(),
    period_weeks: input.period_weeks,
    freq_target: input.freq_target,
    started_at: now,
    ended_at: null,
    is_active: 1,
  };
}

export async function updatePlanMeta(
  id: string,
  patch: { name?: string; period_weeks?: number | null; freq_target?: number },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    vals.push(patch.name.trim());
  }
  if (patch.period_weeks !== undefined) {
    sets.push(`period_weeks = $${i++}`);
    vals.push(patch.period_weeks);
  }
  if (patch.freq_target !== undefined) {
    sets.push(`freq_target = $${i++}`);
    vals.push(patch.freq_target);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = $${i++}`);
  vals.push(nowIso());
  vals.push(id);
  await run(`UPDATE workout_plans SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

/**
 * Inicia um novo ciclo a partir do plano atual: arquiva o ativo e cria uma
 * nova versão já com as mesmas sessões, exercícios e agenda (o usuário evolui
 * em cima, em vez de recomeçar do zero). O plano antigo fica no histórico.
 */
export async function clonePlanAsNewCycle(
  sourcePlanId: string,
  opts: { name: string; period_weeks: number | null; freq_target: number },
): Promise<WorkoutPlan> {
  const plan = await createPlan(opts); // já arquiva o ativo anterior

  const sessions = await fetchSessions(sourcePlanId);
  const idMap = new Map<string, string>(); // sessão antiga -> nova
  for (const s of sessions) {
    const created = await createSession(plan.id, s.label, s.position);
    idMap.set(s.id, created.id);
  }

  const exercises = await fetchExercises(sessions.map((s) => s.id));
  for (const e of exercises) {
    const newSession = idMap.get(e.session_id);
    if (!newSession) continue;
    await upsertExercise({
      session_id: newSession,
      name: e.name,
      target_sets: e.target_sets,
      target_reps: e.target_reps,
      target_weight: e.target_weight,
      position: e.position,
    });
  }

  const schedule = await fetchSchedule(sourcePlanId);
  for (const entry of schedule) {
    const mapped = entry.session_id ? (idMap.get(entry.session_id) ?? null) : null;
    await setScheduleDay(plan.id, entry.weekday, mapped);
  }

  return plan;
}

export async function createSession(
  planId: string,
  label: string,
  position: number,
): Promise<WorkoutSession> {
  const now = nowIso();
  const id = uid();
  await run(
    `INSERT INTO workout_sessions (id, plan_id, label, position, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [id, planId, label.trim(), position, now],
  );
  return { id, plan_id: planId, label: label.trim(), position };
}

export async function deleteSession(id: string): Promise<void> {
  await run(`DELETE FROM workout_exercises WHERE session_id = $1`, [id]);
  await run(`DELETE FROM workout_sessions WHERE id = $1`, [id]);
}

export async function upsertExercise(input: {
  id?: string;
  session_id: string;
  name: string;
  target_sets: number | null;
  target_reps: string | null;
  target_weight: number | null;
  position: number;
}): Promise<void> {
  const now = nowIso();
  if (input.id) {
    await run(
      `UPDATE workout_exercises
       SET name = $1, target_sets = $2, target_reps = $3, target_weight = $4, position = $5, updated_at = $6
       WHERE id = $7`,
      [
        input.name.trim(),
        input.target_sets,
        input.target_reps,
        input.target_weight,
        input.position,
        now,
        input.id,
      ],
    );
  } else {
    await run(
      `INSERT INTO workout_exercises (id, session_id, name, target_sets, target_reps, target_weight, position, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [
        uid(),
        input.session_id,
        input.name.trim(),
        input.target_sets,
        input.target_reps,
        input.target_weight,
        input.position,
        now,
      ],
    );
  }
}

export async function deleteExercise(id: string): Promise<void> {
  await run(`DELETE FROM workout_exercises WHERE id = $1`, [id]);
}

export async function setScheduleDay(
  planId: string,
  weekday: number,
  sessionId: string | null,
): Promise<void> {
  const now = nowIso();
  await run(
    `INSERT INTO workout_schedule (id, plan_id, weekday, session_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT(plan_id, weekday) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
    [uid(), planId, weekday, sessionId, now],
  );
}

// ============================================================ TREINO · LOGS

export async function fetchWorkoutLogs(): Promise<WorkoutLog[]> {
  const rows = await all<WorkoutLog>(
    `SELECT id, date, plan_id, session_id, performance, completed, note
     FROM workout_logs ORDER BY date`,
  );
  return rows.map((r) => ({ ...r, completed: Number(r.completed) }));
}

export async function fetchSetLogs(logId: string): Promise<WorkoutSetLog[]> {
  const rows = await all<WorkoutSetLog>(
    `SELECT id, log_id, exercise_id, exercise_name, weight, reps, set_index, is_pr
     FROM workout_set_logs WHERE log_id = $1 ORDER BY set_index, created_at`,
    [logId],
  );
  return rows.map((r) => ({
    ...r,
    weight: Number(r.weight),
    reps: Number(r.reps),
    is_pr: Number(r.is_pr),
  }));
}

/** Última vez (antes de `beforeDate`) em que a sessão foi feita — p/ comparar volume. */
async function lastSessionSets(
  sessionId: string | null,
  beforeDate: string,
): Promise<{ weight: number; reps: number }[] | null> {
  if (!sessionId) return null;
  const log = await one<{ id: string }>(
    `SELECT id FROM workout_logs WHERE session_id = $1 AND date < $2 ORDER BY date DESC LIMIT 1`,
    [sessionId, beforeDate],
  );
  if (!log) return null;
  const sets = await all<{ weight: number; reps: number }>(
    `SELECT weight, reps FROM workout_set_logs WHERE log_id = $1`,
    [log.id],
  );
  return sets.map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) }));
}

/**
 * Registra (ou regrava) o treino de um dia: grava séries, deriva performance
 * comparando com a última sessão igual, e marca PRs.
 */
export async function saveWorkoutCheckin(
  input: WorkoutCheckinInput,
  plannedExerciseCount: number,
): Promise<WorkoutLog> {
  const now = nowIso();
  const prev = await lastSessionSets(input.session_id, input.date);
  const doneExercises = new Set(input.sets.map((s) => s.exercise_id ?? s.exercise_name)).size;
  const performance = derivePerformance(input.sets, prev, plannedExerciseCount, doneExercises);

  // PR: carga máxima por exercício maior do que qualquer registro histórico.
  const prMap = new Map<string, number>();
  for (const s of input.sets) {
    const key = s.exercise_id ?? s.exercise_name;
    prMap.set(key, Math.max(prMap.get(key) ?? 0, s.weight));
  }
  const prevMax = new Map<string, number>();
  for (const [key] of prMap) {
    const isId = input.sets.find((s) => (s.exercise_id ?? s.exercise_name) === key)?.exercise_id;
    const row = isId
      ? await one<{ m: number }>(
          `SELECT MAX(weight) as m FROM workout_set_logs WHERE exercise_id = $1`,
          [isId],
        )
      : await one<{ m: number }>(
          `SELECT MAX(weight) as m FROM workout_set_logs WHERE exercise_name = $1 AND exercise_id IS NULL`,
          [key],
        );
    prevMax.set(key, row?.m ? Number(row.m) : 0);
  }

  // Upsert do log do dia (substitui séries antigas).
  const existing = await one<{ id: string }>(`SELECT id FROM workout_logs WHERE date = $1`, [
    input.date,
  ]);
  const logId = existing?.id ?? uid();
  if (existing) {
    await run(`DELETE FROM workout_set_logs WHERE log_id = $1`, [logId]);
    await run(
      `UPDATE workout_logs SET plan_id = $1, session_id = $2, performance = $3, completed = $4, note = $5, updated_at = $6 WHERE id = $7`,
      [
        input.plan_id,
        input.session_id,
        performance,
        input.completed ? 1 : 0,
        input.note ?? null,
        now,
        logId,
      ],
    );
  } else {
    await run(
      `INSERT INTO workout_logs (id, date, plan_id, session_id, performance, completed, note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [
        logId,
        input.date,
        input.plan_id,
        input.session_id,
        performance,
        input.completed ? 1 : 0,
        input.note ?? null,
        now,
      ],
    );
  }

  for (const s of input.sets) {
    const key = s.exercise_id ?? s.exercise_name;
    const isPr =
      s.weight > 0 && s.weight >= (prMap.get(key) ?? 0) && s.weight > (prevMax.get(key) ?? 0);
    await run(
      `INSERT INTO workout_set_logs (id, log_id, exercise_id, exercise_name, weight, reps, set_index, is_pr, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        uid(),
        logId,
        s.exercise_id,
        s.exercise_name.trim(),
        s.weight,
        s.reps,
        s.set_index,
        isPr ? 1 : 0,
        now,
      ],
    );
  }

  return {
    id: logId,
    date: input.date,
    plan_id: input.plan_id,
    session_id: input.session_id,
    performance,
    completed: input.completed ? 1 : 0,
    note: input.note ?? null,
  };
}

export async function deleteWorkoutLog(date: string): Promise<void> {
  const log = await one<{ id: string }>(`SELECT id FROM workout_logs WHERE date = $1`, [date]);
  if (!log) return;
  await run(`DELETE FROM workout_set_logs WHERE log_id = $1`, [log.id]);
  await run(`DELETE FROM workout_logs WHERE id = $1`, [log.id]);
}

// ============================================================ PESO CORPORAL

export async function fetchBodyWeights(): Promise<BodyWeightLog[]> {
  const rows = await all<BodyWeightLog>(
    `SELECT id, date, weight FROM body_weight_logs ORDER BY date`,
  );
  return rows.map((r) => ({ ...r, weight: Number(r.weight) }));
}

export async function addBodyWeight(weight: number, date = todayIso()): Promise<BodyWeightLog> {
  if (!Number.isFinite(weight) || weight <= 0) throw new Error("Peso inválido.");
  const id = uid();
  const now = nowIso();
  await run(
    `INSERT INTO body_weight_logs (id, date, weight, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)`,
    [id, date, weight, now],
  );
  return { id, date, weight };
}

// ============================================================ DIETA

export async function fetchActiveDietPlan(): Promise<DietPlan | null> {
  return one<DietPlan>(
    `SELECT id, name, started_at, ended_at, is_active FROM diet_plans
     WHERE is_active = 1 ORDER BY started_at DESC LIMIT 1`,
  );
}

export async function fetchDietPlanHistory(): Promise<DietPlan[]> {
  return all<DietPlan>(
    `SELECT id, name, started_at, ended_at, is_active FROM diet_plans ORDER BY started_at DESC`,
  );
}

export async function fetchDietVariants(planId: string): Promise<DietVariant[]> {
  return all<DietVariant>(
    `SELECT id, plan_id, label, position FROM diet_variants WHERE plan_id = $1 ORDER BY position, created_at`,
    [planId],
  );
}

export async function fetchDietDishes(variantIds: string[]): Promise<DietDish[]> {
  if (variantIds.length === 0) return [];
  const ph = variantIds.map((_, i) => `$${i + 1}`).join(",");
  return all<DietDish>(
    `SELECT id, variant_id, name, quantity, meal, position FROM diet_dishes
     WHERE variant_id IN (${ph}) ORDER BY position, created_at`,
    variantIds,
  );
}

export async function fetchDietSchedule(planId: string): Promise<DietScheduleEntry[]> {
  return all<DietScheduleEntry>(
    `SELECT id, plan_id, weekday, variant_id FROM diet_schedule WHERE plan_id = $1`,
    [planId],
  );
}

export async function fetchDietOverrides(): Promise<DietOverride[]> {
  return all<DietOverride>(`SELECT id, date, variant_id FROM diet_overrides ORDER BY date`);
}

export async function fetchDietLogs(): Promise<DietLog[]> {
  return all<DietLog>(`SELECT id, date, variant_id, status, note FROM diet_logs ORDER BY date`);
}

export async function createDietPlan(name: string): Promise<DietPlan> {
  const now = nowIso();
  const id = uid();
  await run(
    `UPDATE diet_plans SET is_active = 0, ended_at = COALESCE(ended_at, $1), updated_at = $1 WHERE is_active = 1`,
    [now],
  );
  await run(
    `INSERT INTO diet_plans (id, name, started_at, is_active, created_at, updated_at) VALUES ($1, $2, $3, 1, $3, $3)`,
    [id, name.trim(), now],
  );
  return { id, name: name.trim(), started_at: now, ended_at: null, is_active: 1 };
}

export async function updateDietPlan(id: string, name: string): Promise<void> {
  await run(`UPDATE diet_plans SET name = $1, updated_at = $2 WHERE id = $3`, [
    name.trim(),
    nowIso(),
    id,
  ]);
}

export async function createDietVariant(
  planId: string,
  label: string,
  position: number,
): Promise<DietVariant> {
  const id = uid();
  const now = nowIso();
  await run(
    `INSERT INTO diet_variants (id, plan_id, label, position, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`,
    [id, planId, label.trim(), position, now],
  );
  return { id, plan_id: planId, label: label.trim(), position };
}

export async function upsertDish(input: {
  id?: string;
  variant_id: string;
  name: string;
  quantity: string | null;
  meal: string | null;
  position: number;
}): Promise<void> {
  const now = nowIso();
  if (input.id) {
    await run(
      `UPDATE diet_dishes SET name = $1, quantity = $2, meal = $3, position = $4, updated_at = $5 WHERE id = $6`,
      [input.name.trim(), input.quantity, input.meal, input.position, now, input.id],
    );
  } else {
    await run(
      `INSERT INTO diet_dishes (id, variant_id, name, quantity, meal, position, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [uid(), input.variant_id, input.name.trim(), input.quantity, input.meal, input.position, now],
    );
  }
}

export async function deleteDish(id: string): Promise<void> {
  await run(`DELETE FROM diet_dishes WHERE id = $1`, [id]);
}

export async function setDietScheduleDay(
  planId: string,
  weekday: number,
  variantId: string | null,
): Promise<void> {
  const now = nowIso();
  await run(
    `INSERT INTO diet_schedule (id, plan_id, weekday, variant_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT(plan_id, weekday) DO UPDATE SET variant_id = excluded.variant_id, updated_at = excluded.updated_at`,
    [uid(), planId, weekday, variantId, now],
  );
}

export async function setDietOverride(date: string, variantId: string | null): Promise<void> {
  const now = nowIso();
  await run(
    `INSERT INTO diet_overrides (id, date, variant_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT(date) DO UPDATE SET variant_id = excluded.variant_id, updated_at = excluded.updated_at`,
    [uid(), date, variantId, now],
  );
}

export async function saveDietCheckin(
  date: string,
  status: DietStatus,
  variantId: string | null,
  note: string | null = null,
): Promise<DietLog> {
  const now = nowIso();
  await run(
    `INSERT INTO diet_logs (id, date, variant_id, status, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT(date) DO UPDATE SET variant_id = excluded.variant_id, status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
    [uid(), date, variantId, status, note, now],
  );
  return { id: uid(), date, variant_id: variantId, status, note };
}
