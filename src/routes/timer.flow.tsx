import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CornerUpLeft, Pause, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { FlowAudio } from "@/modules/flow/audio";
import {
  BROWSERS,
  SELF,
  flowElapsed,
  getAppClasses,
  readFlow,
  setAppClass,
  writeFlow,
  type AppClass,
  type FlowSession,
} from "@/modules/flow/session";
import { enterCompanion, exitCompanion } from "@/modules/flow/window";
import { createSession } from "@/modules/timer/api";

export const Route = createFileRoute("/timer/flow")({
  component: FlowCompanion,
});

const POLL_MS = 1500;
const BROWSER_LIMIT_MS = 3 * 60 * 1000; // navegador vira distração após 3 min contínuos
const SNOOZE_MS = 20 * 1000;

type FocusState = "focused" | "nudge";

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

async function pollActive(): Promise<string | null> {
  const mock = (window as unknown as { __flowMockApp?: string | null }).__flowMockApp;
  if (mock !== undefined) return mock ? String(mock).toLowerCase() : null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<{ process: string } | null>("active_app");
    return r ? r.process.toLowerCase() : null;
  } catch {
    return null;
  }
}

function FlowCompanion() {
  const navigate = useNavigate();
  const [session, setSession] = useState<FlowSession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [state, setState] = useState<FocusState>("focused");
  const [unknown, setUnknown] = useState<string | null>(null);
  const [classes, setClasses] = useState<Record<string, AppClass>>({});

  const audioRef = useRef<FlowAudio | null>(null);
  const browserSince = useRef<number | null>(null);
  const snoozeUntil = useRef<number>(0);
  const prevState = useRef<FocusState>("focused");
  const classesRef = useRef(classes);
  classesRef.current = classes;
  const sessionRef = useRef<FlowSession | null>(null);
  const finishedRef = useRef(false);

  // Mount: carrega sessão, vira companheira, inicia áudio
  useEffect(() => {
    const s = readFlow();
    if (!s) {
      navigate({ to: "/timer" });
      return;
    }
    setSession(s);
    sessionRef.current = s;
    setClasses(getAppClasses());

    const audio = new FlowAudio();
    audio.setVolume(s.volume);
    audio.setBpm(s.bpm);
    audio.setAmbiance(s.ambiance);
    audioRef.current = audio;
    if (!s.pausedAt) audio.start();

    enterCompanion();
    return () => {
      audio.dispose();
      exitCompanion();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick de tempo
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = session ? flowElapsed(session, now) : 0;
  const remaining =
    session && session.plannedSeconds != null
      ? Math.max(0, session.plannedSeconds - elapsed)
      : null;

  // Vigília do app em foco → decide focar/reconduzir
  useEffect(() => {
    if (!session) return;
    let alive = true;
    const check = async () => {
      const proc = await pollActive();
      if (!alive) return;
      if (proc === null) return; // sem info, mantém
      const cls = classesRef.current[proc];
      let next: FocusState = "focused";
      if (SELF.has(proc)) {
        next = "focused";
      } else if (cls === "work") {
        browserSince.current = null;
        setUnknown(null);
        next = "focused";
      } else if (cls === "distraction") {
        next = "nudge";
      } else if (BROWSERS.has(proc)) {
        setUnknown(null);
        if (browserSince.current == null) browserSince.current = Date.now();
        next = Date.now() - browserSince.current > BROWSER_LIMIT_MS ? "nudge" : "focused";
      } else {
        // app desconhecido → pergunta gentil, sem cutucar ainda
        browserSince.current = null;
        setUnknown(proc);
        next = "focused";
      }
      if (next === "nudge" && Date.now() < snoozeUntil.current) next = "focused";
      // toca o chime só ao ENTRAR em nudge
      if (next === "nudge" && prevState.current !== "nudge") audioRef.current?.chime();
      prevState.current = next;
      setState(next);
    };
    const id = window.setInterval(check, POLL_MS);
    check();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [session]);

  const finish = async (completed: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const s = sessionRef.current;
    audioRef.current?.stop();
    if (s) {
      const dur = flowElapsed(s, Date.now());
      if (dur >= 5) {
        try {
          await createSession({
            project_id: null,
            tag: s.intention || null,
            mode: s.plannedSeconds != null ? "count_down" : "count_up",
            planned_seconds: s.plannedSeconds,
            started_at: new Date(s.startedAt).toISOString(),
            ended_at: new Date().toISOString(),
            duration_seconds: dur,
            completed,
          });
        } catch (e) {
          console.error(e);
          toast.error("Não consegui salvar a sessão");
        }
      }
    }
    writeFlow(null);
    await exitCompanion();
    navigate({ to: "/timer" });
  };

  // Fim automático na contagem regressiva
  useEffect(() => {
    if (remaining === 0 && session?.plannedSeconds != null && !finishedRef.current) {
      audioRef.current?.chime();
      finish(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const togglePause = () => {
    const s = sessionRef.current;
    if (!s) return;
    const next: FlowSession = s.pausedAt
      ? { ...s, pausedAccumMs: s.pausedAccumMs + (Date.now() - s.pausedAt), pausedAt: null }
      : { ...s, pausedAt: Date.now() };
    writeFlow(next);
    setSession(next);
    sessionRef.current = next;
    if (next.pausedAt) audioRef.current?.stop();
    else audioRef.current?.start();
  };

  const extend = () => {
    const s = sessionRef.current;
    if (!s || s.plannedSeconds == null) return;
    const next = { ...s, plannedSeconds: s.plannedSeconds + 300 };
    writeFlow(next);
    setSession(next);
    sessionRef.current = next;
  };

  const classify = (proc: string, cls: AppClass) => {
    setAppClass(proc, cls);
    setClasses((c) => ({ ...c, [proc]: cls }));
    setUnknown(null);
  };

  const backToFocus = () => {
    snoozeUntil.current = Date.now() + SNOOZE_MS;
    setState("focused");
    prevState.current = "focused";
  };

  if (!session) return null;

  const paused = !!session.pausedAt;
  const nudging = state === "nudge";
  const timeLabel = remaining !== null ? fmt(remaining) : fmt(elapsed);
  const progress =
    session.plannedSeconds != null && session.plannedSeconds > 0
      ? Math.min(100, (elapsed / session.plannedSeconds) * 100)
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-center px-4 py-3 select-none"
      style={{
        backgroundColor: nudging ? "#161410" : "#131313",
        color: "#eaeaea",
        transition: "background-color 300ms ease",
      }}
    >
      {nudging ? (
        <>
          <div className="flex items-center gap-2">
            <CornerUpLeft className="h-4 w-4" style={{ color: "#d8b878" }} />
            <span
              className="text-[10px] uppercase tracking-[0.16em]"
              style={{ color: "#b89a5e" }}
            >
              Volte com calma
            </span>
          </div>
          <p className="mt-1.5 truncate text-sm font-medium" style={{ color: "#fbf4e6" }}>
            {session.intention || "Foco"}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={backToFocus}
              className="flex-1 rounded-lg py-1.5 text-xs font-medium"
              style={{ background: "#e2c891", color: "#1c1a15" }}
            >
              Voltar ao foco
            </button>
            {session.plannedSeconds != null && (
              <button
                onClick={extend}
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: "#3a352a", color: "#9a927f" }}
              >
                <Plus className="mr-0.5 inline h-3 w-3" />5 min
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: "#eaeaea",
                  animation: paused ? "none" : "pulse-dot 1.8s ease-in-out infinite",
                  opacity: paused ? 0.4 : 1,
                }}
              />
              <span
                className="text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "#7d7d7d" }}
              >
                {paused ? "Pausado" : "Em foco"}
              </span>
            </div>
            <span className="tabular-nums text-sm font-medium" style={{ color: "#e8e8e8" }}>
              {timeLabel}
            </span>
          </div>

          <p className="mt-1.5 truncate text-sm" style={{ color: "#f2f2f2" }}>
            {session.intention || "Foco"}
          </p>

          <div className="mt-2 h-[3px] overflow-hidden rounded-full" style={{ background: "#262626" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: progress != null ? `${progress}%` : "100%",
                background: progress != null ? "#dcdcdc" : "#3a3a3a",
              }}
            />
          </div>

          {unknown ? (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="truncate text-[11px]" style={{ color: "#9a9a9a" }}>
                {unknown} é trabalho?
              </span>
              <div className="ml-auto flex gap-1.5">
                <button
                  onClick={() => classify(unknown, "work")}
                  className="rounded-md border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: "#333", color: "#cfcfcf" }}
                >
                  Sim
                </button>
                <button
                  onClick={() => classify(unknown, "distraction")}
                  className="rounded-md border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: "#333", color: "#cfcfcf" }}
                >
                  Não
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "#8a8f82" }}>
                {ambianceLabel(session.ambiance)}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={togglePause}
                  aria-label={paused ? "Retomar" : "Pausar"}
                  className="flex h-6 w-6 items-center justify-center rounded-md border"
                  style={{ borderColor: "#333", color: "#9a9a9a" }}
                >
                  {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => finish(false)}
                  aria-label="Encerrar"
                  className="flex h-6 w-6 items-center justify-center rounded-md border"
                  style={{ borderColor: "#333", color: "#9a9a9a" }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ambianceLabel(a: FlowSession["ambiance"]): string {
  switch (a) {
    case "brown":
      return "Ruído marrom";
    case "pink":
      return "Ruído rosa";
    case "white":
      return "Ruído branco";
    case "rain":
      return "Chuva";
    case "metronome":
      return "Metrônomo";
  }
}
