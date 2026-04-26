import type { Bucket, Task } from "./types";

/** yyyy-mm-dd in local time. */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

/**
 * Classify a task by its due_date relative to today.
 * - today: due == today OR overdue (overdue still belongs to "Hoje" — it screams for attention)
 * - tomorrow: due == tomorrow
 * - later: due > tomorrow
 * - week: no due date set
 */
export function bucketOf(task: Task): Bucket {
  if (!task.due_date) return "week";
  const today = todayIso();
  const tomorrow = tomorrowIso();
  if (task.due_date <= today) return "today";
  if (task.due_date === tomorrow) return "tomorrow";
  return "later";
}

export function bucketDueDate(bucket: Bucket): string | null {
  switch (bucket) {
    case "today":
      return todayIso();
    case "tomorrow":
      return tomorrowIso();
    case "later": {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return toIsoDate(d);
    }
    case "week":
      return null;
  }
}

export function groupByBucket(tasks: Task[]): Record<Bucket, Task[]> {
  const out: Record<Bucket, Task[]> = { week: [], today: [], tomorrow: [], later: [] };
  for (const t of tasks) out[bucketOf(t)].push(t);
  return out;
}
