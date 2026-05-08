import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
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
  const [night, setNight] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("focus-night") === "1";
  });
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

  const bg = night ? "#11140f" : "#ffffff";
  const fg = night ? "#9ca38f" : "#6b6b6b";
  const subtle = night ? "#5a6150" : "#a8a8a8";

  const toggleNight = () => {
    const next = !night;
    setNight(next);
    if (typeof window !== "undefined")
      window.localStorage.setItem("focus-night", next ? "1" : "0");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: bg, color: fg }}
    >
      <button
        onClick={toggleNight}
        aria-label={night ? "Modo claro" : "Modo noturno"}
        className="absolute right-5 top-5 rounded-full p-2 opacity-60 transition-opacity hover:opacity-100"
        style={{ color: subtle }}
      >
        {night ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
      </button>

      <div
        onClick={togglePause}
        className="cursor-pointer select-none tabular-nums leading-none px-6 text-center"
        style={{
          fontFamily: '"Crimson Pro", serif',
          fontWeight: 300,
          fontSize:
            remaining !== null
              ? (active.plannedSeconds && active.plannedSeconds >= 3600
                  ? "clamp(4rem, 17vw, 18rem)"
                  : "clamp(6rem, 24vw, 22rem)")
              : (elapsed >= 3600
                  ? "clamp(4rem, 17vw, 18rem)"
                  : "clamp(6rem, 24vw, 22rem)"),
          letterSpacing: "-0.04em",
          color: fg,
          opacity: active.pausedAt ? 0.45 : 1,
          transition: "opacity 200ms ease",
        }}
      >
        {display}
      </div>

      <button
        onClick={() => finish({ completed: false })}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full px-6 py-2 text-xs uppercase tracking-[0.25em] transition-opacity hover:opacity-100"
        style={{ color: subtle, opacity: 0.7, border: `1px solid ${subtle}33` }}
      >
        Finalizar
      </button>
    </div>
  );
}