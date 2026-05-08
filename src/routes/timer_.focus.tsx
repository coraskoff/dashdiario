import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { X, Pause, Play, Square } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AnalogClock } from "@/components/timer/AnalogClock";
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

export const Route = createFileRoute("/timer/focus")({
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
    <div className="fixed inset-0 z-[100] bg-background text-foreground">
      {/* close */}
      <button
        onClick={() => finish({ completed: false })}
        aria-label="Encerrar"
        className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X size={18} strokeWidth={1.75} />
      </button>

      <div className="flex h-full flex-col items-center justify-center px-6">
        {(projectName || active.tag) && (
          <p className="mb-8 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {projectName}
            {projectName && active.tag ? " · " : ""}
            {active.tag}
          </p>
        )}

        <AnalogClock
          elapsedSeconds={elapsed}
          plannedSeconds={active.plannedSeconds}
          size={Math.min(420, typeof window !== "undefined" ? Math.min(window.innerWidth - 80, window.innerHeight - 320) : 360)}
        />

        <div className="mt-10 font-light tabular-nums tracking-tight text-foreground" style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)" }}>
          {display}
        </div>

        {active.pausedAt && (
          <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Pausado</p>
        )}

        <div className="mt-12 flex items-center gap-2">
          <button
            onClick={togglePause}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
          >
            {active.pausedAt ? <Play size={14} /> : <Pause size={14} />}
            {active.pausedAt ? "Retomar" : "Pausar"}
          </button>
          <button
            onClick={() => finish({ completed: false })}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm text-background transition-opacity hover:opacity-90"
          >
            <Square size={12} />
            Finalizar
          </button>
        </div>

        <p className="mt-8 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
          espaço · pausar    esc · encerrar
        </p>
      </div>
    </div>
  );
}