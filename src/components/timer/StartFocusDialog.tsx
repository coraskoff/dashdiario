import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "@/modules/projects/api";
import { writeActive } from "@/modules/timer/active-session";
import type { TimerMode } from "@/modules/timer/types";

const PRESETS: { label: string; seconds: number | null; mode: TimerMode }[] = [
  { label: "Livre", seconds: null, mode: "count_up" },
  { label: "25 min", seconds: 25 * 60, mode: "count_down" },
  { label: "50 min", seconds: 50 * 60, mode: "count_down" },
  { label: "90 min", seconds: 90 * 60, mode: "count_down" },
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
  const [presetIdx, setPresetIdx] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId ?? null);
  const [tag, setTag] = useState(initialTag ?? "");

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });

  // Sync when opened with new defaults
  const lastOpen = useRef(false);
  if (open && !lastOpen.current) {
    lastOpen.current = true;
    setProjectId(initialProjectId ?? null);
    setTag(initialTag ?? "");
  } else if (!open && lastOpen.current) {
    lastOpen.current = false;
  }

  if (!open) return null;

  const start = () => {
    const preset = PRESETS[presetIdx];
    writeActive({
      startedAt: Date.now(),
      mode: preset.mode,
      plannedSeconds: preset.seconds,
      projectId,
      tag: tag.trim() || null,
      pausedAt: null,
      pausedAccumMs: 0,
    });
    onOpenChange(false);
    navigate({ to: "/timer/focus" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-background p-6 shadow-xl shadow-foreground/10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Iniciar foco</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Fechar
          </button>
        </div>

        <div className="mt-2 space-y-5">
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">Modo</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => setPresetIdx(i)}
                  className={`rounded-md border px-2 py-2 text-sm transition-colors ${
                    presetIdx === i
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 bg-background text-foreground hover:bg-secondary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">Projeto</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setProjectId(null)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  projectId === null
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Sem projeto
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProjectId(p.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    projectId === p.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              Descrição · opcional
            </p>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Ex: deep work, reunião…"
              className="h-9"
            />
          </div>

          <Button onClick={start} className="w-full h-11 text-base">
            Começar →
          </Button>
        </div>
      </div>
    </div>
  );
}