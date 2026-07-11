import type { Ambiance } from "./audio";

export interface FlowSession {
  startedAt: number; // epoch ms
  plannedSeconds: number | null; // null = livre (conta pra cima)
  intention: string;
  ambiance: Ambiance;
  bpm: number;
  volume: number;
  pausedAt: number | null;
  pausedAccumMs: number;
}

const KEY = "flow.activeSession.v1";

export function readFlow(): FlowSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FlowSession) : null;
  } catch {
    return null;
  }
}

export function writeFlow(s: FlowSession | null): void {
  if (typeof window === "undefined") return;
  if (!s) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(s));
}

export function flowElapsed(s: FlowSession, nowMs = Date.now()): number {
  const ref = s.pausedAt ?? nowMs;
  return Math.max(0, Math.floor((ref - s.startedAt - s.pausedAccumMs) / 1000));
}

/* ---------------- Classificação de apps (aprendida durante o uso) ---------------- */

export type AppClass = "work" | "distraction";

const CLS_KEY = "flow.appClasses.v1";

export function getAppClasses(): Record<string, AppClass> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CLS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function setAppClass(process: string, cls: AppClass): void {
  const all = getAppClasses();
  all[process] = cls;
  localStorage.setItem(CLS_KEY, JSON.stringify(all));
}

/** Navegadores — tratados como trabalho até passar muito tempo neles. */
export const BROWSERS = new Set([
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "brave.exe",
  "opera.exe",
  "vivaldi.exe",
  "arc.exe",
  "zen.exe",
]);

/** O próprio Dash — nunca é distração. */
export const SELF = new Set(["dash.exe", "app.exe"]);
