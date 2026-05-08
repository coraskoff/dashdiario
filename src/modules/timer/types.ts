export type TimerMode = "count_up" | "count_down";

export interface TimerSession {
  id: string;
  project_id: string | null;
  tag: string | null;
  mode: TimerMode;
  planned_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimerGoal {
  id: string;
  weekly_seconds: number;
}

export interface ProjectGoal {
  id: string;
  project_id: string;
  weekly_seconds: number;
}

export interface ActiveSession {
  startedAt: number; // epoch ms
  mode: TimerMode;
  plannedSeconds: number | null;
  projectId: string | null;
  tag: string | null;
  pausedAt: number | null; // epoch ms when paused, null if running
  pausedAccumMs: number; // total ms spent paused
}