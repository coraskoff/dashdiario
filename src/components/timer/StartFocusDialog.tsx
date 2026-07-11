import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clock, Timer, Waves, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { writeActive } from "@/modules/timer/active-session";
import { writeFlow } from "@/modules/flow/session";
import type { Ambiance } from "@/modules/flow/audio";

type Mode = "clock" | "session" | "flow";

const MIN = 5;
const MAX = 120;

const AMBIANCES: { v: Ambiance; label: string }[] = [
  { v: "brown", label: "Marrom" },
  { v: "pink", label: "Rosa" },
  { v: "white", label: "Branco" },
  { v: "rain", label: "Chuva" },
  { v: "metronome", label: "Metrônomo" },
];

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
  // Fluxo
  const [intention, setIntention] = useState("");
  const [ambiance, setAmbiance] = useState<Ambiance>("brown");
  const [bpm, setBpm] = useState(90);
  const [volume, setVolume] = useState(0.5);
  const [flowFree, setFlowFree] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("clock");
      setMinutes(25);
      setIntention(initialTag ?? "");
      setAmbiance("brown");
      setBpm(90);
      setVolume(0.5);
      setFlowFree(false);
    }
  }, [open, initialTag]);

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
    if (mode === "flow") {
      writeFlow({
        startedAt: Date.now(),
        plannedSeconds: flowFree ? null : minutes * 60,
        intention: intention.trim(),
        ambiance,
        bpm,
        volume,
        pausedAt: null,
        pausedAccumMs: 0,
      });
      onOpenChange(false);
      navigate({ to: "/timer/flow" });
      return;
    }
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
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-foreground/10"
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

        <div className="grid grid-cols-3 gap-3 px-6 pt-5">
          <ModeCard
            active={mode === "clock"}
            onClick={() => setMode("clock")}
            icon={<Clock className="h-5 w-5" strokeWidth={1.75} />}
            title="Relógio"
            subtitle="Papel de parede."
          />
          <ModeCard
            active={mode === "session"}
            onClick={() => setMode("session")}
            icon={<Timer className="h-5 w-5" strokeWidth={1.75} />}
            title="Sessão"
            subtitle="Período definido."
          />
          <ModeCard
            active={mode === "flow"}
            onClick={() => setMode("flow")}
            icon={<Waves className="h-5 w-5" strokeWidth={1.75} />}
            title="Fluxo"
            subtitle="Acompanha você."
          />
        </div>

        {mode === "session" && (
          <div className="px-6 pt-6">
            <DurationPicker minutes={minutes} onChange={setMinutes} />
          </div>
        )}

        {mode === "flow" && (
          <div className="space-y-5 px-6 pt-6">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                Intenção
              </p>
              <Input
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                placeholder="O que você vai fazer?"
                className="h-9"
                autoFocus
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                Ambiência
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AMBIANCES.map((a) => (
                  <button
                    key={a.v}
                    onClick={() => setAmbiance(a.v)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      ambiance === a.v
                        ? "border-foreground bg-foreground text-background"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {ambiance === "metronome" && (
              <LabeledSlider
                label="Ritmo"
                value={bpm}
                suffix=" BPM"
                min={40}
                max={160}
                step={1}
                onChange={setBpm}
              />
            )}

            <LabeledSlider
              label="Volume"
              value={Math.round(volume * 100)}
              suffix="%"
              min={0}
              max={100}
              step={5}
              onChange={(v) => setVolume(v / 100)}
            />

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                Duração
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setFlowFree(true)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    flowFree
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Livre
                </button>
                {[25, 50, 90].map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setFlowFree(false);
                      setMinutes(m);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      !flowFree && minutes === m
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
        )}

        <div className="px-6 pb-6 pt-6">
          <Button onClick={start} className="h-11 w-full text-base">
            Começar →
          </Button>
        </div>
      </div>
    </div>
  );
}

function DurationPicker({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (m: number) => void;
}) {
  return (
    <>
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
        onValueChange={(v) => onChange(v[0])}
        className="mt-4"
      />
      <div className="mt-4 flex gap-1.5">
        {[25, 50, 90].map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
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
    </>
  );
}

function LabeledSlider({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="tabular-nums text-sm text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
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
