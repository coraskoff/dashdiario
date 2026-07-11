import type { Performance, WorkoutSetLog } from "./types";

/** yyyy-mm-dd em horário local. */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

/** Segunda-feira 00:00 local da semana que contém `d`. */
export function startOfWeek(d: Date = new Date()): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const diff = (out.getDay() + 6) % 7; // dias desde segunda
  out.setDate(out.getDate() - diff);
  return out;
}

/** Volume total de uma lista de séries (Σ carga × reps). */
export function volume(sets: { weight: number; reps: number }[]): number {
  return sets.reduce((s, x) => s + x.weight * x.reps, 0);
}

/**
 * Deriva a "performance" de um treino comparando as séries de hoje com a
 * última vez que a mesma sessão foi feita. Dirige a cor do mapa de calor.
 *
 * - up      → progrediu: mais volume OU carga de topo maior
 * - same    → manteve: volume ~igual (±3%)
 * - down    → regrediu: menos volume/carga
 * - partial → fez menos exercícios do que o previsto
 */
export function derivePerformance(
  todaySets: { weight: number; reps: number }[],
  prevSets: { weight: number; reps: number }[] | null,
  plannedExerciseCount: number,
  doneExerciseCount: number,
): Performance {
  if (plannedExerciseCount > 0 && doneExerciseCount < plannedExerciseCount) {
    return "partial";
  }
  const todayVol = volume(todaySets);
  if (!prevSets || prevSets.length === 0) {
    // Sem referência anterior: qualquer treino completo conta como "same".
    return "same";
  }
  const prevVol = volume(prevSets);
  if (prevVol <= 0) return "same";
  const ratio = todayVol / prevVol;
  if (ratio >= 1.03) return "up";
  if (ratio <= 0.97) return "down";
  return "same";
}

/** Nível 0–4 do mapa de calor a partir da performance (0 = descanso). */
export function heatLevel(perf: Performance | null): 0 | 1 | 2 | 3 | 4 {
  switch (perf) {
    case "up":
      return 4;
    case "same":
      return 3;
    case "down":
      return 2;
    case "partial":
      return 1;
    default:
      return 0;
  }
}

/**
 * Próxima pesagem devida: última data + 1 mês. Retorna null se nunca pesou.
 */
export function nextWeighIn(lastDate: string | null): Date | null {
  if (!lastDate) return null;
  const [y, m, d] = lastDate.split("-").map(Number);
  const next = new Date(y, m - 1, d);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/** Dias até a próxima pesagem (negativo = atrasada). null se nunca pesou. */
export function daysUntilWeighIn(lastDate: string | null): number | null {
  const next = nextWeighIn(lastDate);
  if (!next) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/** Fim previsto do ciclo de treino (início + período em semanas). */
export function planEndDate(startedAt: string, periodWeeks: number | null): Date | null {
  if (!periodWeeks || periodWeeks <= 0) return null;
  const start = new Date(startedAt);
  const end = new Date(start);
  end.setDate(end.getDate() + periodWeeks * 7);
  return end;
}

/** Agrupa séries por exercício preservando ordem de registro. */
export function groupSetsByExercise(sets: WorkoutSetLog[]): Map<string, WorkoutSetLog[]> {
  const out = new Map<string, WorkoutSetLog[]>();
  for (const s of sets) {
    const key = s.exercise_id ?? s.exercise_name;
    const arr = out.get(key) ?? [];
    arr.push(s);
    out.set(key, arr);
  }
  return out;
}
