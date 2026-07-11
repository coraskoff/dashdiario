// ----------------------------------------------------------------- TREINO

export type Performance = "up" | "same" | "down" | "partial";

export interface WorkoutPlan {
  id: string;
  name: string;
  period_weeks: number | null;
  freq_target: number;
  started_at: string;
  ended_at: string | null;
  is_active: number;
}

export interface WorkoutSession {
  id: string;
  plan_id: string;
  label: string;
  position: number;
}

export interface WorkoutExercise {
  id: string;
  session_id: string;
  name: string;
  target_sets: number | null;
  target_reps: string | null;
  target_weight: number | null;
  position: number;
}

export interface WorkoutScheduleEntry {
  id: string;
  plan_id: string;
  weekday: number; // 0 = domingo .. 6 = sábado
  session_id: string | null;
}

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  plan_id: string | null;
  session_id: string | null;
  performance: Performance;
  completed: number;
  note: string | null;
}

export interface WorkoutSetLog {
  id: string;
  log_id: string;
  exercise_id: string | null;
  exercise_name: string;
  weight: number;
  reps: number;
  set_index: number;
  is_pr: number;
}

export interface BodyWeightLog {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number;
}

// ----------------------------------------------------------------- DIETA

export type DietStatus = "followed" | "partial" | "off";

export interface DietPlan {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  is_active: number;
}

export interface DietVariant {
  id: string;
  plan_id: string;
  label: string;
  position: number;
}

export interface DietDish {
  id: string;
  variant_id: string;
  name: string;
  quantity: string | null;
  meal: string | null;
  position: number;
}

export interface DietScheduleEntry {
  id: string;
  plan_id: string;
  weekday: number;
  variant_id: string | null;
}

export interface DietOverride {
  id: string;
  date: string;
  variant_id: string | null;
}

export interface DietLog {
  id: string;
  date: string;
  variant_id: string | null;
  status: DietStatus;
  note: string | null;
}

// ----------------------------------------------------------------- INPUTS

export interface SetInput {
  exercise_id: string | null;
  exercise_name: string;
  weight: number;
  reps: number;
  set_index: number;
}

export interface WorkoutCheckinInput {
  date: string;
  plan_id: string | null;
  session_id: string | null;
  completed: boolean;
  note?: string | null;
  sets: SetInput[];
}
