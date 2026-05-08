import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Flame, Clock, Target, TrendingUp, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heatmap } from "@/components/timer/Heatmap";
import { StartFocusDialog } from "@/components/timer/StartFocusDialog";
import {
  deleteSession,
  fetchGoal,
  fetchProjectGoals,
  fetchSessions,
  setGoal,
  setProjectGoal,
} from "@/modules/timer/api";
import { fetchProjects, projectColor } from "@/modules/projects/api";
import {
  currentStreak,
  endOfWeek,
  formatDuration,
  formatHM,
  peakHourRange,
  startOfWeek,
  totalInRange,
  totalsByProject,
} from "@/modules/timer/stats";
import { useMobileFab } from "@/routes/__root";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/timer")({
  component: TimerHome,
});

function TimerHome() {
  const [startOpen, setStartOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);

  useMobileFab(() => setStartOpen(true));

  const { data: sessions = [] } = useQuery({
    queryKey: ["timer-sessions"],
    queryFn: () => fetchSessions(),
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const { data: goal } = useQuery({ queryKey: ["timer-goal"], queryFn: fetchGoal });
  const { data: projectGoals = [] } = useQuery({
    queryKey: ["timer-project-goals"],
    queryFn: fetchProjectGoals,
  });

  const wkStart = startOfWeek();
  const wkEnd = endOfWeek();
  const prevStart = new Date(wkStart);
  prevStart.setDate(prevStart.getDate() - 7);

  const totalThisWeek = totalInRange(sessions, wkStart, wkEnd);
  const totalLastWeek = totalInRange(sessions, prevStart, wkStart);
  const delta = totalThisWeek - totalLastWeek;

  const projectTotals = totalsByProject(sessions, wkStart, wkEnd);
  const sortedProjects = useMemo(
    () =>
      [...projectTotals.entries()]
        .filter(([k]) => !!k)
        .sort((a, b) => b[1] - a[1]),
    [projectTotals],
  );
  const topProjectId = sortedProjects[0]?.[0] ?? null;
  const topProject = projects.find((p) => p.id === topProjectId);
  const topProjectSec = sortedProjects[0]?.[1] ?? 0;
  const topProjectShare = totalThisWeek > 0 ? Math.round((topProjectSec / totalThisWeek) * 100) : 0;

  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const peak = peakHourRange(sessions, last30);

  const streak = currentStreak(sessions);

  // weekly goal math
  const goalSec = goal?.weekly_seconds ?? 0;
  const remaining = Math.max(0, goalSec - totalThisWeek);
  const pct = goalSec > 0 ? Math.min(100, Math.round((totalThisWeek / goalSec) * 100)) : 0;
  const today = new Date();
  const daysLeft = Math.max(1, Math.ceil((wkEnd.getTime() - today.getTime()) / 86400000));
  const perDay = remaining / daysLeft;

  return (
    <>
      {/* Header */}
      <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Seu foco</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">Esta semana.</h1>
        </div>
        <div className="hidden md:block">
          <Button onClick={() => setStartOpen(true)} className="h-11 px-5 text-base">
            Iniciar foco <ArrowRight size={16} />
          </Button>
        </div>
      </header>

      {/* Heatmap */}
      <section className="mb-10 rounded-xl border border-border/60 bg-card p-5">
        <Heatmap sessions={sessions} />
      </section>

      {/* Stats */}
      <section className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Clock size={14} strokeWidth={1.75} />}
          label="Tempo · semana"
          value={formatDuration(totalThisWeek)}
          hint={
            totalLastWeek > 0
              ? `${delta >= 0 ? "+" : "−"}${formatDuration(Math.abs(delta))} vs anterior`
              : "primeira semana"
          }
        />
        <StatCard
          icon={<TrendingUp size={14} strokeWidth={1.75} />}
          label="Projeto top"
          value={topProject?.name ?? "—"}
          hint={topProject ? `${formatDuration(topProjectSec)} · ${topProjectShare}%` : "Sem dados"}
          color={topProject ? projectColor(topProject) : undefined}
        />
        <StatCard
          icon={<Target size={14} strokeWidth={1.75} />}
          label="Pico produtivo"
          value={
            peak ? `${String(peak.startHour).padStart(2, "0")}h–${String(peak.endHour).padStart(2, "0")}h` : "—"
          }
          hint={peak ? "últimos 30 dias" : "Sem dados"}
        />
        <StatCard
          icon={<Flame size={14} strokeWidth={1.75} />}
          label="Streak"
          value={streak > 0 ? `${streak} ${streak === 1 ? "dia" : "dias"}` : "—"}
          hint={streak > 0 ? "consecutivos" : "Comece hoje"}
        />
      </section>

      {/* Weekly goal */}
      <section className="mb-10 rounded-xl border border-border/60 bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {goalSec > 0 ? `Meta · ${formatHM(goalSec)} esta semana` : "Defina sua meta semanal"}
          </p>
          <button
            onClick={() => setGoalsOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil size={12} /> Editar metas
          </button>
        </div>

        {goalSec > 0 ? (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-3xl font-medium tracking-tight tabular-nums">
                {formatDuration(totalThisWeek)}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">/ {formatHM(goalSec)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full bg-foreground transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {remaining === 0
                ? "Meta batida ✓"
                : `Faltam ${formatDuration(remaining)} em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} · ~${formatDuration(Math.round(perDay))}/dia`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Defina uma meta global para acompanhar seu ritmo da semana.
          </p>
        )}

        {/* per-project goals */}
        {projects.length > 0 && (
          <div className="mt-6 space-y-2 border-t border-border/60 pt-5">
            {projects.map((p) => {
              const sec = projectTotals.get(p.id) ?? 0;
              const pg = projectGoals.find((g) => g.project_id === p.id);
              const target = pg?.weekly_seconds ?? 0;
              const pgPct = target > 0 ? Math.min(100, Math.round((sec / target) * 100)) : 0;
              const remain = Math.max(0, target - sec);
              return (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: projectColor(p) }}
                  />
                  <span className="w-32 shrink-0 truncate text-foreground">{p.name}</span>
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                    {formatDuration(sec)}
                  </span>
                  {target > 0 ? (
                    <>
                      <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                        / {formatHM(target)}
                      </span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/50">
                        <div
                          className="h-full rounded-full bg-foreground/80"
                          style={{ width: `${pgPct}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {remain > 0 ? `faltam ${formatDuration(remain)}` : "meta ✓"}
                      </span>
                    </>
                  ) : (
                    <button
                      onClick={() => setGoalsOpen(true)}
                      className="ml-auto text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                      definir meta →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent sessions */}
      <RecentSessions />

      <StartFocusDialog open={startOpen} onOpenChange={setStartOpen} />
      <GoalsDialog
        open={goalsOpen}
        onOpenChange={setGoalsOpen}
        currentGoalSec={goalSec}
        projects={projects}
        projectGoals={projectGoals}
      />
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        {color && (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        )}
        <span className="truncate text-xl font-medium tracking-tight tabular-nums">{value}</span>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RecentSessions() {
  const qc = useQueryClient();
  const { data: sessions = [] } = useQuery({
    queryKey: ["timer-sessions"],
    queryFn: () => fetchSessions(),
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const recent = sessions.slice(0, 12);

  const delMut = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer-sessions"] }),
  });

  if (recent.length === 0) {
    return (
      <section className="mb-12 rounded-xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma sessão ainda. Clique em <span className="font-medium text-foreground">Iniciar foco</span> para começar.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        Sessões recentes
      </p>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
        {recent.map((s) => {
          const p = projects.find((x) => x.id === s.project_id);
          const t = new Date(s.started_at);
          return (
            <li key={s.id} className="group flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-20 shrink-0 tabular-nums text-foreground">
                {formatDuration(s.duration_seconds)}
              </span>
              {p ? (
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: projectColor(p) }} />
                  {p.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Sem projeto</span>
              )}
              {s.tag && <span className="text-xs text-muted-foreground">· {s.tag}</span>}
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {t.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ·{" "}
                {t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                onClick={() => delMut.mutate(s.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GoalsDialog({
  open,
  onOpenChange,
  currentGoalSec,
  projects,
  projectGoals,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentGoalSec: number;
  projects: { id: string; name: string; color: string | null }[];
  projectGoals: { project_id: string; weekly_seconds: number }[];
}) {
  const qc = useQueryClient();
  const [globalH, setGlobalH] = useState<string>(
    currentGoalSec ? String(Math.round(currentGoalSec / 3600)) : "",
  );
  const [perProject, setPerProject] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const g of projectGoals) o[g.project_id] = String(Math.round(g.weekly_seconds / 3600));
    return o;
  });

  const save = async () => {
    try {
      const gh = Number(globalH.replace(",", ".")) || 0;
      await setGoal(Math.round(gh * 3600));
      for (const p of projects) {
        const raw = perProject[p.id];
        const hours = raw === undefined || raw === "" ? 0 : Number(raw.replace(",", ".")) || 0;
        await setProjectGoal(p.id, Math.round(hours * 3600));
      }
      qc.invalidateQueries({ queryKey: ["timer-goal"] });
      qc.invalidateQueries({ queryKey: ["timer-project-goals"] });
      toast.success("Metas atualizadas");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui salvar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">Metas semanais</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-5">
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-widest text-muted-foreground">
              Meta global · horas/semana
            </label>
            <Input
              type="number"
              min={0}
              value={globalH}
              onChange={(e) => setGlobalH(e.target.value)}
              placeholder="ex: 25"
              className="h-10"
            />
          </div>
          {projects.length > 0 && (
            <div className="space-y-2 border-t border-border/60 pt-4">
              <p className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                Por projeto · horas/semana
              </p>
              {projects.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-foreground">{p.name}</span>
                  <Input
                    type="number"
                    min={0}
                    value={perProject[p.id] ?? ""}
                    onChange={(e) =>
                      setPerProject((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                    placeholder="0"
                    className="h-9 w-24"
                  />
                </div>
              ))}
            </div>
          )}
          <Button onClick={save} className="w-full h-10">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// avoid unused warning for cn import in case needed later
void cn;