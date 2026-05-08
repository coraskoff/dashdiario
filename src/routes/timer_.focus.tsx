import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { X, Pause, Play, Square, Sun, Moon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  elapsedSeconds,
  readActive,
  writeActive,
} from "@/modules/timer/active-session";
import { createSession } from "@/modules/timer/api";
import { fetchProjects } from "@/modules/projects/api";
import {
  ensureNotificationPermission,
  fireNotification,
  flashTitle,
  playBell,
  setTabTitle,
} from "@/modules/timer/notify";
import { acquireWakeLock, releaseWakeLock } from "@/modules/timer/wake-lock";
import type { ActiveSession } from "@/modules/timer/types";

export const Route = createFileRoute("/timer_/focus")({
  component: FocusPage,
});

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function FocusPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dark, setDark] = useState(false);
  const completedRef = useRef(false);
  const originalTitleRef = useRef<string>("");

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });

  // Mount: load active session, request permission, wake lock
  useEffect(() => {
    if (typeof document !== "undefined") originalTitleRef.current = document.title;
    const a = readActive();
    if (!a) {
      navigate({ to: "/timer" });
      return;
    }
    setActive(a);
    ensureNotificationPermission();
    acquireWakeLock();
    return () => {
      releaseWakeLock();
      setTabTitle(null, originalTitleRef.current || "Dash");
    };
  }, [navigate]);

  // Tick
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = active ? elapsedSeconds(active, now) : 0;
  const remaining =
    active && active.plannedSeconds ? Math.max(0, active.plannedSeconds - elapsed) : null;
  const projectName =
    active?.projectId ? projects.find((p) => p.id === active.projectId)?.name ?? "" : "";

  // Update tab title
  useEffect(() => {
    if (!active) return;
    const display = remaining !== null ? formatClock(remaining) : formatClock(elapsed);
    const ctx = projectName || active.tag || "Foco";
    setTabTitle(`${display} · ${ctx}`, originalTitleRef.current || "Dash");
  }, [active, elapsed, remaining, projectName]);

  const saveMut = useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timer-sessions"] });
    },
  });

  const finish = async (opts: { completed: boolean }) => {
    if (!active) return;
    const dur = elapsedSeconds(active, Date.now());
    if (dur >= 5) {
      try {
        await saveMut.mutateAsync({
          project_id: active.projectId,
          tag: active.tag,
          mode: active.mode,
          planned_seconds: active.plannedSeconds,
          started_at: new Date(active.startedAt).toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: dur,
          completed: opts.completed,
        });
      } catch (e) {
        toast.error("Não consegui salvar a sessão");
        console.error(e);
      }
    }
    writeActive(null);
    releaseWakeLock();
    navigate({ to: "/timer" });
  };

  // Auto-complete on countdown reaching zero
  useEffect(() => {
    if (!active || active.plannedSeconds == null) return;
    if (completedRef.current) return;
    if (remaining === 0) {
      completedRef.current = true;
      playBell();
      const ctx = projectName ? ` em ${projectName}` : "";
      const mins = Math.round((active.plannedSeconds ?? 0) / 60);
      fireNotification(`Foco concluído · ${mins}min${ctx}`, "Bom trabalho.");
      flashTitle("✓ Concluído");
      finish({ completed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const togglePause = () => {
    if (!active) return;
    const next: ActiveSession = active.pausedAt
      ? {
          ...active,
          pausedAccumMs: active.pausedAccumMs + (Date.now() - active.pausedAt),
          pausedAt: null,
        }
      : { ...active, pausedAt: Date.now() };
    writeActive(next);
    setActive(next);
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      } else if (e.key === "Escape") {
        finish({ completed: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const display = remaining !== null ? formatClock(remaining) : formatClock(elapsed);

  return (
    <div
      className={`fixed inset-0 z-[100] ${dark ? "bg-neutral-950 text-neutral-50" : "bg-white text-neutral-900"}`}
    >
      {/* top-right controls */}
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <button
          onClick={() => setDark((d) => !d)}
          aria-label={dark ? "Modo claro" : "Modo escuro"}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${dark ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"}`}
        >
          {dark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
        </button>
        <button
          onClick={() => finish({ completed: false })}
          aria-label="Encerrar"
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${dark ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"}`}
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex h-full flex-col items-center justify-center px-6">
        {(projectName || active.tag) && (
          <p className={`mb-10 text-[11px] uppercase tracking-[0.2em] ${dark ? "text-neutral-500" : "text-neutral-400"}`}>
            {projectName}
            {projectName && active.tag ? " · " : ""}
            {active.tag}
          </p>
        )}

        <div
          className="text-center font-mono font-bold tabular-nums leading-none tracking-tight"
          style={{ fontSize: "clamp(5rem, 18vw, 16rem)" }}
        >
          {display}
        </div>

        {active.pausedAt && (
          <p className={`mt-6 text-[11px] uppercase tracking-[0.2em] ${dark ? "text-neutral-500" : "text-neutral-400"}`}>
            Pausado
          </p>
        )}

        <div className="mt-16 flex items-center gap-3">
          <button
            onClick={togglePause}
            aria-label={active.pausedAt ? "Retomar" : "Pausar"}
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition-colors ${dark ? "border-neutral-800 text-neutral-200 hover:bg-neutral-900" : "border-neutral-200 text-neutral-800 hover:bg-neutral-50"}`}
          >
            {active.pausedAt ? <Play size={20} strokeWidth={1.75} /> : <Pause size={20} strokeWidth={1.75} />}
          </button>
          <button
            onClick={() => finish({ completed: false })}
            aria-label="Finalizar"
            className={`flex h-14 w-14 items-center justify-center rounded-full transition-opacity hover:opacity-90 ${dark ? "bg-neutral-50 text-neutral-950" : "bg-neutral-900 text-white"}`}
          >
            <Square size={16} strokeWidth={2} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}