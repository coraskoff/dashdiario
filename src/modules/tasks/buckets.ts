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

export function dayAfterTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toIsoDate(d);
}

/**
 * Return the ISO dates from (today + 3) up to and including the upcoming
 * Sunday, in chronological order. Used for the "Resto da semana" strip below
 * the 3-day kanban. Returns an empty array if today is already Friday onwards
 * (i.e. nothing left between hoje+3 and domingo).
 */
export function restOfWeekIsos(): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0 = sunday … 6 = saturday
  // Distance from today to the upcoming Sunday (0 if today is Sunday).
  const daysUntilSunday = (7 - dow) % 7;
  const out: string[] = [];
  for (let offset = 3; offset <= daysUntilSunday; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    out.push(toIsoDate(d));
  }
  return out;
}

/**
 * Classify a task by its due_date relative to today.
 * - today: due == today OR overdue
 * - tomorrow: due == tomorrow
 * - later: due == day after tomorrow (strict — "Depois" means hoje + 2)
 * - week: no due date set OR due date further than hoje + 2
 *   (the task keeps its own due_date; it just lives in the Week strip until
 *   it enters the 3-day kanban window)
 */
export function bucketOf(task: Task): Bucket {
  if (!task.due_date) return "week";
  const today = todayIso();
  const tomorrow = tomorrowIso();
  const dayAfter = dayAfterTomorrowIso();
  if (task.due_date === today) return "today";
  if (task.due_date === tomorrow) return "tomorrow";
  if (task.due_date === dayAfter) return "later";
  return "week";
}

export function bucketDueDate(bucket: Bucket): string | null {
  switch (bucket) {
    case "today":
      return todayIso();
    case "tomorrow":
      return tomorrowIso();
    case "later": {
      const d = new Date();
      d.setDate(d.getDate() + 2);
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
