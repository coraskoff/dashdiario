import type { ActiveSession } from "./types";

const KEY = "timer.activeSession.v1";

export function readActive(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSession;
  } catch {
    return null;
  }
}

export function writeActive(s: ActiveSession | null): void {
  if (typeof window === "undefined") return;
  if (!s) {
    window.localStorage.removeItem(KEY);
    return;
  }
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

/** Returns elapsed seconds (excluding paused time). */
export function elapsedSeconds(s: ActiveSession, nowMs: number = Date.now()): number {
  const ref = s.pausedAt ?? nowMs;
  const ms = ref - s.startedAt - s.pausedAccumMs;
  return Math.max(0, Math.floor(ms / 1000));
}