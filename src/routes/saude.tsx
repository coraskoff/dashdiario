import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flame, Plus, Check, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PulseScreen } from "@/components/Pulse";
import { useMobileFab } from "@/routes/__root";
import { cn } from "@/lib/utils";
import {
  addBodyWeight,
  createDietPlan,
  createDietVariant,
  createPlan,
  createSession,
  deleteDish,
  deleteExercise,
  fetchActiveDietPlan,
  fetchActivePlan,
  fetchBodyWeights,
  fetchDietDishes,
  fetchDietLogs,
  fetchDietSchedule,
  fetchDietVariants,
  fetchExercises,
  fetchSchedule,
  fetchSessions,
  fetchWorkoutLogs,
  saveDietCheckin,
  saveWorkoutCheckin,
  setDietScheduleDay,
  setScheduleDay,
  upsertDish,
  upsertExercise,
} from "@/modules/health/api";
import {
  daysUntilWeighIn,
  heatLevel,
  isoDate,
  planEndDate,
  startOfWeek,
  todayIso,
} from "@/modules/health/calc";
import type { DietStatus, SetInput } from "@/modules/health/types";

export const Route = createFileRoute("/saude")({
  component: SaudeHome,
});

type Chip = "treino" | "dieta";

function SaudeHome() {
  const [chip, setChip] = useState<Chip>("treino");
  return (
    <>
      <header className="mb-6 flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Seu corpo</p>
        <h1 className="text-4xl font-medium tracking-tight md:text-5xl">Hoje.</h1>
      </header>

      <div className="mb-7 flex items-end gap-1 border-b border-border/70">
        <ChipTab active={chip === "treino"} onClick={() => setChip("treino")} color="var(--income)">
          Treino
        </ChipTab>
        <ChipTab
          active={chip === "dieta"}
          onClick={() => setChip("dieta")}
          color="oklch(0.72 0.15 75)"
        >
          Dieta
        </ChipTab>
      </div>

      {chip === "treino" ? <TreinoView /> : <DietaView />}
    </>
  );
}

function ChipTab({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-3 pb-2.5 pt-1 text-[15px] font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
      <span
        className={cn(
          "absolute inset-x-2 -bottom-px h-px bg-foreground transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

// ================================================================= TREINO

function TreinoView() {
  const qc = useQueryClient();
  const [startOpen, setStartOpen] = useState(false);
  useMobileFab(() => setStartOpen(true));

  const { data: plan, isLoading } = useQuery({ queryKey: ["wplan"], queryFn: fetchActivePlan });
  const { data: sessions = [] } = useQuery({
    queryKey: ["wsessions", plan?.id],
    queryFn: () => fetchSessions(plan!.id),
    enabled: !!plan,
  });
  const { data: exercises = [] } = useQuery({
    queryKey: ["wexercises", sessions.map((s) => s.id).join(",")],
    queryFn: () => fetchExercises(sessions.map((s) => s.id)),
    enabled: sessions.length > 0,
  });
  const { data: schedule = [] } = useQuery({
    queryKey: ["wschedule", plan?.id],
    queryFn: () => fetchSchedule(plan!.id),
    enabled: !!plan,
  });
  const { data: logs = [] } = useQuery({ queryKey: ["wlogs"], queryFn: fetchWorkoutLogs });
  const { data: weights = [] } = useQuery({ queryKey: ["bweights"], queryFn: fetchBodyWeights });

  const createPlanMut = useMutation({
    mutationFn: async (name: string) => {
      const p = await createPlan({ name, period_weeks: 8, freq_target: 3 });
      // Sessões iniciais A, B, C
      const a = await createSession(p.id, "A", 0);
      await createSession(p.id, "B", 1);
      await createSession(p.id, "C", 2);
      // Segunda/Quarta/Sexta = A por padrão (dá pra mudar depois)
      await setScheduleDay(p.id, 1, a.id);
      return p;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wplan"] });
      setStartOpen(false);
      toast.success("Plano criado — adicione seus exercícios.");
    },
  });

  if (isLoading) return <PulseScreen />;

  if (!plan) {
    return (
      <>
        <EmptyState
          title="Comece seu plano de treino"
          body="Crie um plano (ABC, AB, push/pull…) com sessões e exercícios. Depois é só confirmar o treino de cada dia."
          cta="Criar plano de treino"
          onCta={() => setStartOpen(true)}
        />
        {startOpen && (
          <NamePrompt
            title="Novo plano de treino"
            placeholder="ex: Treino ABC · Hipertrofia"
            onCancel={() => setStartOpen(false)}
            onSubmit={(name) => createPlanMut.mutate(name)}
          />
        )}
      </>
    );
  }

  const todayWeekday = new Date().getDay();
  const todaySchedule = schedule.find((s) => s.weekday === todayWeekday);
  const todaySession =
    sessions.find((s) => s.id === todaySchedule?.session_id) ?? sessions[0] ?? null;
  const todayExercises = exercises.filter((e) => e.session_id === todaySession?.id);
  const todayLog = logs.find((l) => l.date === todayIso());

  // frequência da semana
  const wkStart = startOfWeek();
  const thisWeekLogs = logs.filter((l) => new Date(l.date + "T12:00:00") >= wkStart);
  const streak = currentStreak(logs.map((l) => l.date));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      {/* HERO */}
      <TodayWorkoutCard
        planId={plan.id}
        sessionId={todaySession?.id ?? null}
        sessionLabel={todaySession?.label ?? "—"}
        exercises={todayExercises}
        alreadyLogged={!!todayLog}
      />

      <div className="flex flex-col gap-4">
        <PlanCard
          plan={plan}
          sessions={sessions}
          schedule={schedule}
          todaySessionId={todaySession?.id ?? null}
        />
        <TreinoHeatmap logs={logs} />
        <div className="grid grid-cols-3 gap-3">
          <MiniStat
            label="streak"
            value={streak > 0 ? `${streak}` : "—"}
            icon={<Flame size={13} />}
          />
          <MiniStat label="esta semana" value={`${thisWeekLogs.length}/${plan.freq_target}`} />
          <MiniStat label="total" value={`${logs.length}`} />
        </div>
        <BodyWeightCard weights={weights} />
      </div>

      {startOpen && (
        <NamePrompt
          title="Novo plano de treino"
          placeholder="ex: Treino ABC · Hipertrofia"
          onCancel={() => setStartOpen(false)}
          onSubmit={(name) => createPlanMut.mutate(name)}
        />
      )}
    </div>
  );
}

function TodayWorkoutCard({
  planId,
  sessionId,
  sessionLabel,
  exercises,
  alreadyLogged,
}: {
  planId: string;
  sessionId: string | null;
  sessionLabel: string;
  exercises: {
    id: string;
    name: string;
    target_sets: number | null;
    target_reps: string | null;
    target_weight: number | null;
  }[];
  alreadyLogged: boolean;
}) {
  const qc = useQueryClient();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [loads, setLoads] = useState<Record<string, string>>({});

  const checkinMut = useMutation({
    mutationFn: async () => {
      const sets: SetInput[] = exercises
        .filter((e) => done[e.id])
        .map((e, i) => {
          const raw = (loads[e.id] ?? "").trim();
          const [w, r] = raw.split(/[x×]/).map((s) => parseFloat(s.replace(",", ".")));
          return {
            exercise_id: e.id,
            exercise_name: e.name,
            weight: Number.isFinite(w) ? w : (e.target_weight ?? 0),
            reps: Number.isFinite(r) ? r : 0,
            set_index: i,
          };
        });
      return saveWorkoutCheckin(
        {
          date: todayIso(),
          plan_id: planId,
          session_id: sessionId,
          completed: exercises.length > 0 && exercises.every((e) => done[e.id]),
          sets,
        },
        exercises.length,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wlogs"] });
      toast.success("Treino registrado.");
    },
  });

  const doneCount = exercises.filter((e) => done[e.id]).length;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Treino de hoje
        </p>
        {alreadyLogged && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Check size={12} /> registrado
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-foreground px-2 text-sm font-bold text-background">
          {sessionLabel}
        </span>
        <div>
          <p className="text-lg font-semibold tracking-tight">
            {exercises.length > 0 ? `${exercises.length} exercícios` : "Sessão sem exercícios"}
          </p>
        </div>
      </div>

      {exercises.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Adicione exercícios a esta sessão no card "Plano atual" ao lado.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          {exercises.map((e) => (
            <div
              key={e.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted",
                done[e.id] && "opacity-70",
              )}
            >
              <button
                onClick={() => setDone((p) => ({ ...p, [e.id]: !p[e.id] }))}
                className={cn(
                  "flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors",
                  done[e.id]
                    ? "border-transparent bg-emerald-600 text-white"
                    : "border-border text-transparent",
                )}
              >
                <Check size={12} strokeWidth={3.5} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {e.target_sets
                    ? `${e.target_sets}×${e.target_reps ?? "?"}`
                    : (e.target_reps ?? "")}
                  {e.target_weight ? ` · ${e.target_weight} kg` : ""}
                </p>
              </div>
              <input
                value={loads[e.id] ?? ""}
                onChange={(ev) => setLoads((p) => ({ ...p, [e.id]: ev.target.value }))}
                placeholder="kg×reps"
                className="h-7 w-20 rounded-md border border-transparent bg-muted px-2 text-[11px] tabular-nums outline-none focus:border-ring"
              />
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={() => checkinMut.mutate()}
        disabled={exercises.length === 0 || doneCount === 0 || checkinMut.isPending}
        className="mt-4 w-full"
      >
        {alreadyLogged ? "Atualizar treino de hoje" : "Confirmar treino de hoje"}
      </Button>
      {exercises.length > 0 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {doneCount} de {exercises.length} exercícios marcados
        </p>
      )}
    </section>
  );
}

function PlanCard({
  plan,
  sessions,
  schedule,
  todaySessionId,
}: {
  plan: {
    id: string;
    name: string;
    period_weeks: number | null;
    freq_target: number;
    started_at: string;
  };
  sessions: { id: string; label: string }[];
  schedule: { weekday: number; session_id: string | null }[];
  todaySessionId: string | null;
}) {
  const qc = useQueryClient();
  const [editSession, setEditSession] = useState<string | null>(null);

  const end = planEndDate(plan.started_at, plan.period_weeks);
  const now = new Date();
  const totalDays = end ? (end.getTime() - new Date(plan.started_at).getTime()) / 86400000 : 0;
  const elapsed = (now.getTime() - new Date(plan.started_at).getTime()) / 86400000;
  const pct =
    totalDays > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100))) : 0;
  const weeksLeft = end
    ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (7 * 86400000)))
    : null;

  const WD = ["D", "S", "T", "Q", "Q", "S", "S"];

  const scheduleMut = useMutation({
    mutationFn: ({ weekday, sessionId }: { weekday: number; sessionId: string | null }) =>
      setDietOrWorkoutSchedule(plan.id, weekday, sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wschedule", plan.id] }),
  });

  function cycleDay(weekday: number) {
    const current = schedule.find((s) => s.weekday === weekday)?.session_id ?? null;
    const order = [null, ...sessions.map((s) => s.id)];
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    scheduleMut.mutate({ weekday, sessionId: next });
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Plano atual</p>
        <span className="text-xs text-muted-foreground">{plan.freq_target}×/sem</span>
      </div>
      <p className="mt-2 text-[15px] font-semibold">{plan.name}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setEditSession(editSession === s.id ? null : s.id)}
            className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-bold transition-colors",
              s.id === todaySessionId
                ? "border-transparent bg-foreground text-background"
                : "border-border bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {editSession && (
        <SessionEditor sessionId={editSession} onClose={() => setEditSession(null)} />
      )}

      {/* período */}
      {end && (
        <div className="mt-4">
          <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Ciclo · {weeksLeft === 0 ? "terminou" : `faltam ${weeksLeft} sem`}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
          </div>
          {weeksLeft === 0 && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Ciclo concluído — hora de revisar o treino. (Criar um novo plano arquiva este no
              histórico.)
            </p>
          )}
        </div>
      )}

      {/* weekday assignment */}
      <div className="mt-4 flex gap-1">
        {WD.map((d, wd) => {
          const sid = schedule.find((s) => s.weekday === wd)?.session_id ?? null;
          const label = sessions.find((s) => s.id === sid)?.label ?? "—";
          const isToday = wd === new Date().getDay();
          return (
            <div key={wd} className="flex-1 text-center">
              <p className="mb-1 text-[9.5px] uppercase text-muted-foreground">{d}</p>
              <button
                onClick={() => cycleDay(wd)}
                className={cn(
                  "flex h-7 w-full items-center justify-center rounded-md text-xs font-bold transition-colors",
                  sid ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground",
                  isToday && "ring-2 ring-emerald-500 ring-offset-1 ring-offset-card",
                )}
              >
                {label}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Toque num dia para atribuir a sessão.
      </p>
    </section>
  );
}

function SessionEditor({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: exercises = [] } = useQuery({
    queryKey: ["wexercises-one", sessionId],
    queryFn: () => fetchExercises([sessionId]),
  });
  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  const addMut = useMutation({
    mutationFn: () =>
      upsertExercise({
        session_id: sessionId,
        name,
        target_sets: sets ? parseInt(sets) : null,
        target_reps: reps || null,
        target_weight: weight ? parseFloat(weight.replace(",", ".")) : null,
        position: exercises.length,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setName("");
      setSets("");
      setReps("");
      setWeight("");
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteExercise(id),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Exercícios da sessão
        </p>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          fechar
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {exercises.map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{e.name}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {e.target_sets ? `${e.target_sets}×${e.target_reps ?? "?"}` : ""}
              {e.target_weight ? ` · ${e.target_weight}kg` : ""}
            </span>
            <button
              onClick={() => delMut.mutate(e.id)}
              className="text-muted-foreground/60 hover:text-destructive"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="exercício"
          className="h-8 min-w-[120px] flex-1 rounded-md border border-transparent bg-card px-2 text-[13px] outline-none focus:border-ring"
        />
        <input
          value={sets}
          onChange={(e) => setSets(e.target.value)}
          placeholder="séries"
          className="h-8 w-16 rounded-md border border-transparent bg-card px-2 text-[13px] outline-none focus:border-ring"
        />
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="reps"
          className="h-8 w-16 rounded-md border border-transparent bg-card px-2 text-[13px] outline-none focus:border-ring"
        />
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="kg"
          className="h-8 w-14 rounded-md border border-transparent bg-card px-2 text-[13px] outline-none focus:border-ring"
        />
        <button
          onClick={() => name.trim() && addMut.mutate()}
          className="h-8 rounded-md bg-foreground px-3 text-[13px] font-medium text-background"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TreinoHeatmap({ logs }: { logs: { date: string; performance: string }[] }) {
  const perfByDate = new Map(logs.map((l) => [l.date, l.performance]));
  const columns = buildColumns(12);
  const LEVEL = ["var(--muted)", "var(--h1)", "var(--h2)", "var(--h3)", "var(--h4)"];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
        Últimas 12 semanas
      </p>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {col.map((d, di) => {
              const isFuture = d > new Date();
              const perf = perfByDate.get(isoDate(d)) ?? null;
              const lvl = heatLevel(perf as never);
              return (
                <div
                  key={di}
                  title={`${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}${perf ? ` · ${perfLabel(perf)}` : ""}`}
                  className={cn("h-3 w-3 rounded-[3px]", isFuture && "border border-border/40")}
                  style={!isFuture ? { background: LEVEL[lvl] } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[8.5px] uppercase tracking-widest text-muted-foreground">
        menos
        {["var(--h1)", "var(--h2)", "var(--h3)", "var(--h4)"].map((c, i) => (
          <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
        ))}
        progrediu
      </div>
    </section>
  );
}

function BodyWeightCard({ weights }: { weights: { date: string; weight: number }[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  const last = weights[weights.length - 1] ?? null;
  const days = daysUntilWeighIn(last?.date ?? null);
  const due = days === null || days <= 0;

  const addMut = useMutation({
    mutationFn: () => addBodyWeight(parseFloat(val.replace(",", "."))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bweights"] });
      setEditing(false);
      setVal("");
      toast.success("Peso registrado.");
    },
  });

  const delta = weights.length >= 2 ? last!.weight - weights[weights.length - 2].weight : null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Peso corporal</p>
      <div className="mt-2 flex items-baseline gap-2">
        {editing || !last ? (
          <div className="flex items-baseline gap-2">
            <Input
              autoFocus
              inputMode="decimal"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && val.trim()) addMut.mutate();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="78,4"
              className="h-9 w-24 text-xl"
            />
            <span className="text-sm text-muted-foreground">kg</span>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-baseline gap-2">
            <span className="text-2xl font-medium tabular-nums">
              {last.weight.toString().replace(".", ",")}
            </span>
            <span className="text-sm text-muted-foreground">kg</span>
            {delta !== null && delta !== 0 && (
              <span
                className={cn(
                  "text-xs",
                  delta < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                )}
              >
                {delta < 0 ? "−" : "+"}
                {Math.abs(delta).toFixed(1).replace(".", ",")}
              </span>
            )}
          </button>
        )}
      </div>
      {last && !editing && (
        <div
          className={cn(
            "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
            due
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Clock size={12} />
          {due ? (
            <>
              Pesagem do mês em aberto —{" "}
              <button onClick={() => setEditing(true)} className="font-semibold underline">
                registrar agora
              </button>
            </>
          ) : (
            <>
              Próxima pesagem em <b className="mx-0.5">{days}</b> dias.
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ================================================================= DIETA

function DietaView() {
  const qc = useQueryClient();
  const [startOpen, setStartOpen] = useState(false);
  useMobileFab(() => setStartOpen(true));

  const { data: plan, isLoading } = useQuery({ queryKey: ["dplan"], queryFn: fetchActiveDietPlan });
  const { data: variants = [] } = useQuery({
    queryKey: ["dvariants", plan?.id],
    queryFn: () => fetchDietVariants(plan!.id),
    enabled: !!plan,
  });
  const { data: dishes = [] } = useQuery({
    queryKey: ["ddishes", variants.map((v) => v.id).join(",")],
    queryFn: () => fetchDietDishes(variants.map((v) => v.id)),
    enabled: variants.length > 0,
  });
  const { data: schedule = [] } = useQuery({
    queryKey: ["dschedule", plan?.id],
    queryFn: () => fetchDietSchedule(plan!.id),
    enabled: !!plan,
  });
  const { data: logs = [] } = useQuery({ queryKey: ["dlogs"], queryFn: fetchDietLogs });

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const p = await createDietPlan(name);
      await createDietVariant(p.id, "A", 0);
      await createDietVariant(p.id, "B", 1);
      return p;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dplan"] });
      setStartOpen(false);
      toast.success("Plano alimentar criado.");
    },
  });

  if (isLoading) return <PulseScreen />;

  if (!plan) {
    return (
      <>
        <EmptyState
          title="Monte seu plano alimentar"
          body="Crie variantes de cardápio (A, B, C…) com pratos e quantidades, e atribua cada uma aos dias da semana."
          cta="Criar plano alimentar"
          onCta={() => setStartOpen(true)}
        />
        {startOpen && (
          <NamePrompt
            title="Novo plano alimentar"
            placeholder="ex: Cutting · 2.400 kcal"
            onCancel={() => setStartOpen(false)}
            onSubmit={(n) => createMut.mutate(n)}
          />
        )}
      </>
    );
  }

  const todayWd = new Date().getDay();
  const tomorrowWd = (todayWd + 1) % 7;
  const todayVariant =
    variants.find((v) => v.id === schedule.find((s) => s.weekday === todayWd)?.variant_id) ??
    variants[0] ??
    null;
  const tomorrowVariant = variants.find(
    (v) => v.id === schedule.find((s) => s.weekday === tomorrowWd)?.variant_id,
  );
  const todayDishes = dishes.filter((d) => d.variant_id === todayVariant?.id);
  const todayLog = logs.find((l) => l.date === todayIso());

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <TodayDietCard
        variantId={todayVariant?.id ?? null}
        variantLabel={todayVariant?.label ?? "—"}
        dishes={todayDishes}
        currentStatus={todayLog?.status ?? null}
      />

      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Amanhã</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-muted px-2 text-sm font-bold text-muted-foreground">
              {tomorrowVariant?.label ?? "—"}
            </span>
            <p className="text-sm text-muted-foreground">
              {tomorrowVariant
                ? `${dishes.filter((d) => d.variant_id === tomorrowVariant.id).length} pratos`
                : "Sem plano atribuído"}
            </p>
          </div>
        </section>

        <DietPlanCard planId={plan.id} variants={variants} dishes={dishes} schedule={schedule} />
        <DietHeatmap logs={logs} />
      </div>

      {startOpen && (
        <NamePrompt
          title="Novo plano alimentar"
          placeholder="ex: Cutting · 2.400 kcal"
          onCancel={() => setStartOpen(false)}
          onSubmit={(n) => createMut.mutate(n)}
        />
      )}
    </div>
  );
}

function TodayDietCard({
  variantId,
  variantLabel,
  dishes,
  currentStatus,
}: {
  variantId: string | null;
  variantLabel: string;
  dishes: { id: string; name: string; quantity: string | null; meal: string | null }[];
  currentStatus: DietStatus | null;
}) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const checkinMut = useMutation({
    mutationFn: (status: DietStatus) => saveDietCheckin(todayIso(), status, variantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dlogs"] });
      toast.success("Check-in registrado.");
    },
  });

  const STATUS: { key: DietStatus; label: string; cls: string }[] = [
    {
      key: "followed",
      label: "Segui",
      cls: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white",
    },
    {
      key: "partial",
      label: "Em parte",
      cls: "data-[on=true]:bg-amber-500 data-[on=true]:text-white",
    },
    { key: "off", label: "Fora", cls: "data-[on=true]:bg-rose-600 data-[on=true]:text-white" },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
        Cardápio de hoje
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span
          className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-bold"
          style={{ background: "oklch(0.72 0.15 75)", color: "oklch(0.2 0.06 70)" }}
        >
          {variantLabel}
        </span>
        <p className="text-lg font-semibold tracking-tight">{dishes.length} pratos</p>
      </div>

      {dishes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Adicione pratos a esta variante no card "Plano alimentar" ao lado.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          {dishes.map((d) => (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted",
                checked[d.id] && "opacity-70",
              )}
            >
              <button
                onClick={() => setChecked((p) => ({ ...p, [d.id]: !p[d.id] }))}
                className={cn(
                  "flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors",
                  checked[d.id]
                    ? "border-transparent bg-emerald-600 text-white"
                    : "border-border text-transparent",
                )}
              >
                <Check size={12} strokeWidth={3.5} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {d.meal ? <span className="text-muted-foreground">{d.meal} — </span> : null}
                  {d.name}
                </p>
              </div>
              {d.quantity && (
                <span className="text-xs tabular-nums text-muted-foreground">{d.quantity}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          Check-in do dia
        </p>
        <div className="grid grid-cols-3 gap-2">
          {STATUS.map((s) => (
            <button
              key={s.key}
              data-on={currentStatus === s.key}
              onClick={() => checkinMut.mutate(s.key)}
              className={cn(
                "rounded-lg border border-border bg-muted px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors",
                s.cls,
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DietPlanCard({
  planId,
  variants,
  dishes,
  schedule,
}: {
  planId: string;
  variants: { id: string; label: string }[];
  dishes: {
    id: string;
    variant_id: string;
    name: string;
    quantity: string | null;
    meal: string | null;
  }[];
  schedule: { weekday: number; variant_id: string | null }[];
}) {
  const qc = useQueryClient();
  const [editVariant, setEditVariant] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [meal, setMeal] = useState("");
  const WD = ["D", "S", "T", "Q", "Q", "S", "S"];

  const scheduleMut = useMutation({
    mutationFn: ({ weekday, variantId }: { weekday: number; variantId: string | null }) =>
      setDietScheduleDay(planId, weekday, variantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dschedule", planId] }),
  });
  const addDishMut = useMutation({
    mutationFn: () =>
      upsertDish({
        variant_id: editVariant!,
        name,
        quantity: qty || null,
        meal: meal || null,
        position: dishes.filter((d) => d.variant_id === editVariant).length,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setName("");
      setQty("");
      setMeal("");
    },
  });
  const delDishMut = useMutation({
    mutationFn: (id: string) => deleteDish(id),
    onSuccess: () => qc.invalidateQueries(),
  });

  function cycleDay(weekday: number) {
    const current = schedule.find((s) => s.weekday === weekday)?.variant_id ?? null;
    const order = [null, ...variants.map((v) => v.id)];
    const idx = order.indexOf(current);
    scheduleMut.mutate({ weekday, variantId: order[(idx + 1) % order.length] });
  }

  const editDishes = dishes.filter((d) => d.variant_id === editVariant);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Plano alimentar</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {variants.map((v) => (
          <button
            key={v.id}
            onClick={() => setEditVariant(editVariant === v.id ? null : v.id)}
            className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-bold transition-colors",
              editVariant === v.id
                ? "border-transparent bg-foreground text-background"
                : "border-border bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {editVariant && (
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/40 p-3">
          <div className="flex flex-col gap-1">
            {editDishes.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">
                  {d.meal ? <span className="text-muted-foreground">{d.meal} — </span> : null}
                  {d.name}
                </span>
                <span className="text-[11px] text-muted-foreground">{d.quantity}</span>
                <button
                  onClick={() => delDishMut.mutate(d.id)}
                  className="text-muted-foreground/60 hover:text-destructive"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <input
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              placeholder="refeição"
              className="h-8 w-24 rounded-md border border-transparent bg-card px-2 text-[13px] outline-none focus:border-ring"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prato"
              className="h-8 min-w-[100px] flex-1 rounded-md border border-transparent bg-card px-2 text-[13px] outline-none focus:border-ring"
            />
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="qtd"
              className="h-8 w-20 rounded-md border border-transparent bg-card px-2 text-[13px] outline-none focus:border-ring"
            />
            <button
              onClick={() => name.trim() && addDishMut.mutate()}
              className="h-8 rounded-md bg-foreground px-3 text-[13px] font-medium text-background"
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-1">
        {WD.map((d, wd) => {
          const vid = schedule.find((s) => s.weekday === wd)?.variant_id ?? null;
          const label = variants.find((v) => v.id === vid)?.label ?? "—";
          const isToday = wd === new Date().getDay();
          return (
            <div key={wd} className="flex-1 text-center">
              <p className="mb-1 text-[9.5px] uppercase text-muted-foreground">{d}</p>
              <button
                onClick={() => cycleDay(wd)}
                className={cn(
                  "flex h-7 w-full items-center justify-center rounded-md text-xs font-bold transition-colors",
                  vid ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground",
                  isToday && "ring-2 ring-amber-500 ring-offset-1 ring-offset-card",
                )}
              >
                {label}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Toque num dia para atribuir a variante.
      </p>
    </section>
  );
}

function DietHeatmap({ logs }: { logs: { date: string; status: string }[] }) {
  const byDate = new Map(logs.map((l) => [l.date, l.status]));
  const columns = buildColumns(12);
  const COLOR: Record<string, string> = {
    followed: "var(--income)",
    partial: "oklch(0.72 0.15 75)",
    off: "var(--expense)",
  };
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
        Constância · 12 semanas
      </p>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {col.map((d, di) => {
              const isFuture = d > new Date();
              const status = byDate.get(isoDate(d));
              return (
                <div
                  key={di}
                  title={d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  className={cn("h-3 w-3 rounded-[3px]", isFuture && "border border-border/40")}
                  style={
                    !isFuture ? { background: status ? COLOR[status] : "var(--muted)" } : undefined
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[8.5px] uppercase tracking-widest text-muted-foreground">
        <span className="h-3 w-3 rounded-[3px]" style={{ background: "var(--muted)" }} /> fora
        <span className="h-3 w-3 rounded-[3px]" style={{ background: "oklch(0.72 0.15 75)" }} /> em
        parte
        <span className="h-3 w-3 rounded-[3px]" style={{ background: "var(--income)" }} /> segui
      </div>
    </section>
  );
}

// ================================================================= SHARED

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      {icon && <div className="mb-1 text-muted-foreground">{icon}</div>}
      <p className="text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
  onCta,
}: {
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      <Button onClick={onCta} className="mt-6">
        <Plus size={16} /> {cta}
      </Button>
    </div>
  );
}

function NamePrompt({
  title,
  placeholder,
  onSubmit,
  onCancel,
}: {
  title: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">{title}</p>
        <Input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && val.trim()) onSubmit(val.trim());
            if (e.key === "Escape") onCancel();
          }}
          placeholder={placeholder}
          className="mt-3"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => val.trim() && onSubmit(val.trim())}>Criar</Button>
        </div>
      </div>
    </div>
  );
}

// Colunas do mapa: 12 semanas (seg→dom), terminando na semana atual.
function buildColumns(weeks: number): Date[][] {
  const start = startOfWeek();
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const cols: Date[][] = [];
  for (let w = 0; w < weeks; w++) {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      days.push(d);
    }
    cols.push(days);
  }
  return cols;
}

function currentStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!set.has(isoDate(d))) d.setDate(d.getDate() - 1);
  while (set.has(isoDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function perfLabel(p: string): string {
  return p === "up" ? "progrediu" : p === "same" ? "manteve" : p === "down" ? "reduziu" : "parcial";
}

function setDietOrWorkoutSchedule(planId: string, weekday: number, sessionId: string | null) {
  return setScheduleDay(planId, weekday, sessionId);
}
