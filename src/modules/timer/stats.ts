import type { TimerSession } from "./types";

/** yyyy-mm-dd in local time. */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Monday-based start of week. Returns Date at 00:00 local. */
export function startOfWeek(d: Date = new Date()): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay(); // 0 = sun
  const diff = (dow + 6) % 7; // days since Monday
  out.setDate(out.getDate() - diff);
  return out;
}

export function endOfWeek(d: Date = new Date()): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 7);
  return e;
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return "0min";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function formatHM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}`;
}

/** Map of yyyy-mm-dd -> total seconds. */
export function dailyTotals(sessions: TimerSession[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    const d = isoDate(new Date(s.started_at));
    out.set(d, (out.get(d) ?? 0) + s.duration_seconds);
  }
  return out;
}

export function dailyCounts(sessions: TimerSession[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    const d = isoDate(new Date(s.started_at));
    out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
}

/** Heatmap level 0–4 from seconds. */
export function heatmapLevel(sec: number): 0 | 1 | 2 | 3 | 4 {
  if (sec <= 0) return 0;
  if (sec < 3600) return 1;
  if (sec < 2 * 3600) return 2;
  if (sec < 3 * 3600) return 3;
  return 4;
}

/** Build a 7×N grid (rows = mon..sun, cols = weeks ending this week). */
export function buildHeatmap(
  sessions: TimerSession[],
  weeks = 14,
): { columns: { weekStart: Date; days: { date: Date; sec: number; count: number }[] }[] } {
  const totals = dailyTotals(sessions);
  const counts = dailyCounts(sessions);
  const thisWeekStart = startOfWeek();
  const columns: { weekStart: Date; days: { date: Date; sec: number; count: number }[] }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(thisWeekStart);
    weekStart.setDate(thisWeekStart.getDate() - w * 7);
    const days: { date: Date; sec: number; count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const k = isoDate(d);
      days.push({ date: d, sec: totals.get(k) ?? 0, count: counts.get(k) ?? 0 });
    }
    columns.push({ weekStart, days });
  }
  return { columns };
}

export function totalInRange(sessions: TimerSession[], from: Date, to: Date): number {
  let s = 0;
  for (const x of sessions) {
    const t = new Date(x.started_at);
    if (t >= from && t < to) s += x.duration_seconds;
  }
  return s;
}

export function totalsByProject(
  sessions: TimerSession[],
  from: Date,
  to: Date,
): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const x of sessions) {
    const t = new Date(x.started_at);
    if (t < from || t >= to) continue;
    const key = x.project_id;
    out.set(key, (out.get(key) ?? 0) + x.duration_seconds);
  }
  return out;
}

/** Hour-of-day distribution (0–23) over the given window in seconds. */
export function peakHourRange(
  sessions: TimerSession[],
  from: Date,
): { startHour: number; endHour: number; sec: number } | null {
  const buckets = new Array<number>(24).fill(0);
  let any = false;
  for (const s of sessions) {
    const t = new Date(s.started_at);
    if (t < from) continue;
    any = true;
    const start = t.getHours();
    // distribute proportionally across hours of session
    const end = new Date(t.getTime() + s.duration_seconds * 1000);
    let cur = new Date(t);
    while (cur < end) {
      const h = cur.getHours();
      const nextHour = new Date(cur);
      nextHour.setMinutes(60, 0, 0);
      const slice = Math.min(end.getTime(), nextHour.getTime()) - cur.getTime();
      buckets[h] += slice / 1000;
      cur = new Date(cur.getTime() + slice);
    }
    void start;
  }
  if (!any) return null;
  // pick best 3-hour window
  let bestStart = 0;
  let bestSec = -1;
  for (let h = 0; h < 24; h++) {
    const sum = buckets[h] + buckets[(h + 1) % 24] + buckets[(h + 2) % 24];
    if (sum > bestSec) {
      bestSec = sum;
      bestStart = h;
    }
  }
  return { startHour: bestStart, endHour: (bestStart + 3) % 24, sec: bestSec };
}

export function currentStreak(sessions: TimerSession[]): number {
  const totals = dailyTotals(sessions);
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // If today has no session yet, streak counts from yesterday.
  if (!totals.get(isoDate(d))) d.setDate(d.getDate() - 1);
  while (totals.get(isoDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}