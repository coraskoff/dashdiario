import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clock, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { writeActive } from "@/modules/timer/active-session";

type Mode = "clock" | "session";

const MIN = 5;
const MAX = 120;

export function StartFocusDialog({
  open,
  onOpenChange,
  initialProjectId,
  initialTag,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialProjectId?: string | null;
  initialTag?: string;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("clock");
  const [minutes, setMinutes] = useState(25);

  // Reinicia ao abrir
  useEffect(() => {
    if (open) {
      setMode("clock");
      setMinutes(25);
    }
  }, [open]);

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const start = () => {
    writeActive({
      startedAt: Date.now(),
      mode: mode === "clock" ? "count_up" : "count_down",
      plannedSeconds: mode === "clock" ? null : minutes * 60,
      projectId: initialProjectId ?? null,
      tag: initialTag ?? null,
      pausedAt: null,
      pausedAccumMs: 0,
    });
    onOpenChange(false);
    navigate({ to: "/timer/focus" });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 px-4 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-foreground/10"
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Iniciar foco</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Como você quer começar?</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 pt-5">
          <ModeCard
            active={mode === "clock"}
            onClick={() => setMode("clock")}
            icon={<Clock className="h-5 w-5" strokeWidth={1.75} />}
            title="Relógio"
            subtitle="Tempo livre, conta pra cima."
          />
          <ModeCard
            active={mode === "session"}
            onClick={() => setMode("session")}
            icon={<Timer className="h-5 w-5" strokeWidth={1.75} />}
            title="Sessão"
            subtitle="Contagem regressiva."
          />
        </div>

        {/* Configuração da sessão — altura anima entre os modos */}
        <div
          className="grid transition-all duration-300 ease-out"
          style={{ gridTemplateRows: mode === "session" ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="px-6 pt-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Duração
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="tabular-nums text-3xl font-semibold leading-none tracking-tight"
                    style={{ fontFamily: '"Crimson Pro", serif' }}
                  >
                    {minutes}
                  </span>
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>
              <Slider
                value={[minutes]}
                min={MIN}
                max={MAX}
                step={5}
                onValueChange={(v) => setMinutes(v[0])}
                className="mt-4"
              />
              <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted-foreground/60">
                <span>{MIN}m</span>
                <span>{MAX}m</span>
              </div>
              <div className="mt-4 flex gap-1.5">
                {[25, 50, 90].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMinutes(m)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      minutes === m
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-6">
          <Button onClick={start} className="h-11 w-full text-base">
            Começar →
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
        active
          ? "border-foreground bg-secondary/60 shadow-sm"
          : "border-border/60 hover:border-foreground/30 hover:bg-secondary/30"
      }`}
    >
      <span
        className={`transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
