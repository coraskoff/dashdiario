export type TaskStatus = "pending" | "completed";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null; // yyyy-mm-dd, null => "Semana"
  project_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  position: number | null;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  due_date?: string | null;
  project_id?: string | null;
}

export type Bucket = "week" | "today" | "tomorrow" | "later";
