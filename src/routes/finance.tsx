import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Sparkles,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  deleteTransaction,
  fetchAllDays,
  fetchAllMonths,
  fetchAllTransactions,
  upsertDayDiario,
  upsertMonth,
  upsertTransaction,
} from "@/modules/finance/api";
import type { FinanceMonth, FinanceTransaction } from "@/modules/finance/types";
import {
  buildDayRows,
  buildYearProjection,
  currentMonth,
  daysInMonth,
  formatCurrency,
  formatCurrencyCompact,
  formatDayLabel,
  formatMonthLabel,
  shiftMonth,
  suggestedDaily,
  summarizeMonth,
  todayIso,
  type DayRow,
} from "@/modules/finance/calculations";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/finance")({
  component: FinancePage,
});

/* ---------- helpers ---------- */
function parseAmount(input: string): number {
  if (!input) return 0;
  const normalized = input.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatInput(value: number): string {
  if (!value) return "";
  return value.toFixed(2).replace(".", ",");
}

type PanelKind = "entrada" | "saida" | null;

/* ---------- page ---------- */
function FinancePage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(currentMonth());
  const [panel, setPanel] = useState<PanelKind>(null);

  const monthsQuery = useQuery({ queryKey: ["finance", "months"], queryFn: fetchAllMonths });
  const daysQuery = useQuery({ queryKey: ["finance", "days"], queryFn: fetchAllDays });
  const txQuery = useQuery({
    queryKey: ["finance", "transactions"],
    queryFn: fetchAllTransactions,
  });

  const months = monthsQuery.data ?? [];
  const allDays = daysQuery.data ?? [];
  const allTx = txQuery.data ?? [];

  const openingBalance = useMemo(() => {
    const earlier = months
      .map((c) => c.month)
      .concat(allDays.map((d) => d.date.slice(0, 7)))
      .concat(allTx.map((t) => t.date.slice(0, 7)))
      .filter((m) => m < month);
    if (earlier.length === 0) return 0;
    const earliest = earlier.sort()[0];
    let opening = 0;
    let cursor = earliest;
    while (cursor < month) {
      const cfg = months.find((c) => c.month === cursor);
      const monthDays = allDays.filter((d) => d.date.startsWith(cursor));
      const monthTx = allTx.filter((t) => t.date.startsWith(cursor));
      const { closingBalance } = buildDayRows(cursor, opening, cfg, monthDays, monthTx);
      opening = closingBalance;
      cursor = shiftMonth(cursor, 1);
    }
    return opening;
  }, [months, allDays, allTx, month]);

  const monthConfig = months.find((c) => c.month === month);
  const monthDays = useMemo(
    () => allDays.filter((d) => d.date.startsWith(month)),
    [allDays, month],
  );
  const monthTx = useMemo(
    () => allTx.filter((t) => t.date.startsWith(month)),
    [allTx, month],
  );

  const { rows } = useMemo(
    () => buildDayRows(month, openingBalance, monthConfig, monthDays, monthTx),
    [month, openingBalance, monthConfig, monthDays, monthTx],
  );
  const summary = useMemo(() => summarizeMonth(rows, openingBalance), [rows, openingBalance]);

  const projection = useMemo(() => {
    const [y] = month.split("-");
    return buildYearProjection(`${y}-01`, 0, months, allDays, allTx);
  }, [month, months, allDays, allTx]);

  const updateMonthMutation = useMutation({
    mutationFn: upsertMonth,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "months"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDiarioMutation = useMutation({
    mutationFn: upsertDayDiario,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "days"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertTxMutation = useMutation({
    mutationFn: upsertTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTxMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const suggested = suggestedDaily(monthConfig?.variable_amount ?? 0, month);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-5 sm:px-4 md:space-y-6 md:px-8 md:py-6">
      <Header
        month={month}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
        onToday={() => setMonth(currentMonth())}
      />

      <HeroCard
        month={month}
        config={monthConfig}
        summary={summary}
        openingBalance={openingBalance}
        onSaveVariable={(variable) =>
          updateMonthMutation.mutate({ month, variable_amount: variable })
        }
      />

      <SecondaryStats
        summary={summary}
        openingBalance={openingBalance}
        onOpenEntradas={() => setPanel("entrada")}
        onOpenSaidas={() => setPanel("saida")}
      />

      <Pulse
        rows={rows}
        suggestedDaily={suggested}
        onUpdateDiario={(date, value) =>
          updateDiarioMutation.mutate({ date, diario_override: value })
        }
        onOpenKind={setPanel}
      />

      <ProjectionCard projection={projection} highlightMonth={month} />

      <TransactionsPanel
        kind={panel}
        month={month}
        transactions={monthTx}
        onClose={() => setPanel(null)}
        onSave={(input) => upsertTxMutation.mutate(input)}
        onDelete={(id) => deleteTxMutation.mutate(id)}
      />
    </div>
  );
}

/* ---------- header ---------- */
function Header({
  month,
  onPrev,
  onNext,
  onToday,
}: {
  month: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const isCurrent = month === currentMonth();
  return (
    <header className="flex flex-row items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Finanças</p>
        <h1 className="truncate text-xl font-semibold capitalize tracking-tight md:text-3xl">
          {formatMonthLabel(month)}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Mês anterior">
          <ArrowLeft />
        </Button>
        {!isCurrent && (
          <Button variant="ghost" size="sm" onClick={onToday}>
            Hoje
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onNext} aria-label="Próximo mês">
          <ArrowRight />
        </Button>
      </div>
    </header>
  );
}

/* ---------- hero card: projeção + ritmo ---------- */
function HeroCard({
  month,
  config,
  summary,
  openingBalance,
  onSaveVariable,
}: {
  month: string;
  config: FinanceMonth | undefined;
  summary: ReturnType<typeof summarizeMonth>;
  openingBalance: number;
  onSaveVariable: (variable: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const variable = config?.variable_amount ?? 0;
  const daily = suggestedDaily(variable, month);

  useEffect(() => {
    setDraft(formatInput(variable));
  }, [variable, editing]);

  // Projeção fim do mês = summary.closingBalance (já considera diário sugerido nos dias futuros)
  const projected = summary.closingBalance;
  // Meta: terminar o mês tendo gasto exatamente o variável planejado.
  // Delta = variável total - diário efetivo (positivo = abaixo da meta / economizou)
  const metaDelta = variable - summary.totalDiario;
  const aboveMeta = metaDelta >= 0;
  const isProjPositive = projected >= 0;

  // Tempo decorrido & gasto real (apenas dias passados/hoje)
  const today = todayIso();
  const monthPrefix = month;
  const totalDays = daysInMonth(month);
  // Quantos dias decorridos no mês visível (clamp 0..totalDays)
  let elapsedDays = totalDays;
  if (today.startsWith(monthPrefix)) {
    elapsedDays = Number(today.split("-")[2]);
  } else if (today < monthPrefix + "-01") {
    elapsedDays = 0;
  }
  const elapsedRatio = totalDays > 0 ? elapsedDays / totalDays : 0;
  // Gasto real até hoje = variável proporcional consumido (usa diário efetivo dos dias passados).
  // Como buildDayRows já distribui, aproximamos com diário sugerido * elapsedDays + ajustes.
  // Para fidelidade: usamos summary.totalDiario - (suggested * diasFuturos).
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const suggestedFuture = daily * remainingDays;
  const spentReal = Math.max(0, summary.totalDiario - suggestedFuture);
  const targetProportional = variable * elapsedRatio;
  const spentRatio = variable > 0 ? Math.min(1, spentReal / variable) : 0;
  const targetRatio = variable > 0 ? Math.min(1, elapsedRatio) : 0;
  const overPace = spentReal > targetProportional + 0.005;

  const pctMonth = Math.round(elapsedRatio * 100);
  const pctVar = variable > 0 ? Math.round((spentReal / variable) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="grid gap-px bg-border md:grid-cols-2">
        {/* Bloco esquerdo: projeção */}
        <div className="bg-card p-5 md:p-6">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Projeção de saldo — fim do mês
          </p>
          <p
            className={cn(
              "mt-2 text-4xl font-semibold tracking-tight tabular-nums md:text-5xl",
              isProjPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {formatCurrency(projected)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {variable > 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                  aboveMeta
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                )}
              >
                {aboveMeta ? "↑" : "↓"} {formatCurrency(Math.abs(metaDelta))}{" "}
                {aboveMeta ? "abaixo da meta" : "acima da meta"}
              </span>
            )}
            <span className="text-xs text-muted-foreground">se mantiver o ritmo atual</span>
          </div>

          {/* Contexto: variável (editável) + diário sugerido */}
          <div className="mt-5 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="uppercase tracking-wide">Variável</span>
              {editing ? (
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onSaveVariable(parseAmount(draft));
                      setEditing(false);
                    } else if (e.key === "Escape") {
                      setEditing(false);
                    }
                  }}
                  onBlur={() => {
                    onSaveVariable(parseAmount(draft));
                    setEditing(false);
                  }}
                  className="h-7 w-24 text-xs"
                />
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="group inline-flex items-center gap-1 font-medium text-foreground tabular-nums hover:text-primary"
                >
                  {formatCurrency(variable)}
                  <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                </button>
              )}
            </div>
            <span className="text-border">•</span>
            <div className="flex items-center gap-1.5">
              <span className="uppercase tracking-wide">Diário</span>
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(daily)}
              </span>
            </div>
          </div>
        </div>

        {/* Bloco direito: gasto vs tempo */}
        <div className="bg-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Gasto vs tempo decorrido
            </p>
            {variable > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{pctMonth}%</span> do mês /{" "}
                <span
                  className={cn(
                    "font-medium",
                    overPace
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {pctVar}%
                </span>{" "}
                do variável
              </p>
            )}
          </div>

          {/* Barra */}
          <div className="mt-4">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  overPace ? "bg-rose-500" : "bg-emerald-500",
                )}
                style={{ width: `${spentRatio * 100}%` }}
              />
              {/* Linha vertical da meta proporcional */}
              {variable > 0 && (
                <span
                  aria-hidden
                  className="absolute top-[-3px] h-[calc(100%+6px)] w-px bg-foreground/70"
                  style={{ left: `${targetRatio * 100}%` }}
                />
              )}
            </div>

            {/* Labels */}
            <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>R$ 0</span>
              <span className="text-foreground/80">
                Meta proporcional {formatCurrencyCompact(targetProportional)}
              </span>
              <span>{formatCurrencyCompact(variable)}</span>
            </div>
          </div>

          {/* Legenda */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-sm",
                  overPace ? "bg-rose-500" : "bg-emerald-500",
                )}
              />
              Gasto real ({formatCurrencyCompact(spentReal)})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-px bg-foreground/70" />
              Meta proporcional ao dia
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- secondary stats row ---------- */
function SecondaryStats({
  summary,
  openingBalance,
  onOpenEntradas,
  onOpenSaidas,
}: {
  summary: ReturnType<typeof summarizeMonth>;
  openingBalance: number;
  onOpenEntradas: () => void;
  onOpenSaidas: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
      <Stat label="Saldo inicial" value={openingBalance} />
      <StatButton
        label="Entradas"
        value={summary.totalEntrada}
        tone="positive"
        onClick={onOpenEntradas}
      />
      <StatButton
        label="Saídas"
        value={summary.totalSaida}
        tone="negative"
        onClick={onOpenSaidas}
      />
      <Stat
        label="Performance"
        value={summary.performance}
        tone={summary.performance >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  emphasize,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
  emphasize?: boolean;
}) {
  return (
    <div className="bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tracking-tight",
          emphasize ? "text-xl" : "text-base",
          tone === "positive" && value > 0 && "text-emerald-600 dark:text-emerald-400",
          tone === "negative" && value > 0 && "text-rose-600 dark:text-rose-400",
          tone === "positive" && value < 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function StatButton({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group bg-card p-4 text-left transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Plus className="h-3 w-3 text-muted-foreground/50 transition-colors group-hover:text-primary" />
      </div>
      <p
        className={cn(
          "mt-1 text-base font-semibold tracking-tight",
          tone === "positive" && value > 0 && "text-emerald-600 dark:text-emerald-400",
          tone === "negative" && value > 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        {formatCurrency(value)}
      </p>
    </button>
  );
}

/* ---------- Pulse: o trilho diário ---------- */
function Pulse({
  rows,
  suggestedDaily,
  onUpdateDiario,
  onOpenKind,
}: {
  rows: DayRow[];
  suggestedDaily: number;
  onUpdateDiario: (date: string, value: number | null) => void;
  onOpenKind: (k: PanelKind) => void;
}) {
  const todayRef = useRef<HTMLLIElement>(null);

  // Insight: comparar gasto diário acumulado vs meta acumulada (apenas dias passados + hoje)
  const elapsed = rows.filter((r) => !r.isFuture);
  const spentSoFar = elapsed.reduce((s, r) => s + r.diario, 0);
  const targetSoFar = elapsed.reduce((s, r) => s + suggestedDaily, 0);
  const insightDelta = spentSoFar - targetSoFar; // > 0 = acima da meta
  const remainingDays = rows.filter((r) => r.isFuture).length;
  const totalTarget = rows.reduce((s, r) => s + suggestedDaily, 0);
  const remainingBudget = totalTarget - spentSoFar;
  const recalibrated = remainingDays > 0 ? remainingBudget / remainingDays : 0;
  const isOver = insightDelta > 0.5;

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pulso diário</p>
          <h2 className="text-sm font-semibold">Saldo correndo</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            entrada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            saída
          </span>
        </div>
      </div>

      {elapsed.length > 0 && suggestedDaily > 0 && (
        <div
          className={cn(
            "flex items-start gap-3 border-b px-4 py-3",
            isOver
              ? "bg-rose-500/10 text-rose-900 dark:text-rose-200"
              : "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              isOver ? "bg-rose-500/20" : "bg-emerald-500/20",
            )}
          >
            {isOver ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 text-xs leading-relaxed">
            {isOver ? (
              <>
                Você está{" "}
                <strong className="font-semibold tabular-nums">
                  {formatCurrency(insightDelta)}
                </strong>{" "}
                acima da meta no período.
                {remainingDays > 0 && recalibrated > 0 && (
                  <>
                    {" "}Para equilibrar até o fim do mês, gaste no máximo{" "}
                    <strong className="font-semibold tabular-nums">
                      {formatCurrency(recalibrated)}
                    </strong>{" "}
                    por dia nos {remainingDays} dias restantes.
                  </>
                )}
              </>
            ) : (
              <>
                Você está{" "}
                <strong className="font-semibold tabular-nums">
                  {formatCurrency(Math.abs(insightDelta))}
                </strong>{" "}
                abaixo da meta. Continua no ritmo —
                {remainingDays > 0 && recalibrated > 0 ? (
                  <>
                    {" "}folga de{" "}
                    <strong className="font-semibold tabular-nums">
                      {formatCurrency(recalibrated)}
                    </strong>
                    /dia pelos próximos {remainingDays} dias.
                  </>
                ) : (
                  <> bom controle.</>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ul className="relative">
        {rows.map((r, i) => {
          const negative = r.saldo < 0;
          const hasActivity = r.transactions.length > 0;
          const isLast = i === rows.length - 1;
          const dayDelta = r.diario - suggestedDaily;
          const deltaTone: "over" | "under" | "neutral" =
            Math.abs(dayDelta) < 0.005 ? "neutral" : dayDelta > 0 ? "over" : "under";
          return (
            <li
              key={r.date}
              ref={r.isToday ? todayRef : undefined}
              className={cn(
                "relative grid grid-cols-[56px_1fr] gap-3 px-4 py-3 transition-colors",
                r.isToday && "bg-primary/[0.04]",
                r.isFuture && "opacity-60",
                !isLast && "border-b border-border/40",
              )}
            >
              {/* Left rail: day number + connector */}
              <div className="relative flex flex-col items-center">
                {/* Vertical connector line */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-0 h-full w-px -translate-x-1/2",
                    "bg-border/60",
                  )}
                />
                {/* Dot */}
                <span
                  aria-hidden
                  className={cn(
                    "relative z-10 mt-1.5 h-2 w-2 rounded-full ring-4 ring-card",
                    r.isToday
                      ? "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]"
                      : negative
                        ? "bg-rose-500"
                        : hasActivity
                          ? "bg-foreground/60"
                          : "bg-border",
                  )}
                />
                {/* Day number */}
                <div
                  className={cn(
                    "relative z-10 mt-1 flex flex-col items-center",
                    r.isToday && "font-semibold text-primary",
                  )}
                >
                  <span className="text-xs font-semibold tabular-nums">
                    {String(r.dayNumber).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][r.weekday]}
                  </span>
                </div>
              </div>

              {/* Right: content */}
              <div className="min-w-0">
                {/* Top row: dois blocos com mesmo peso visual — gasto | saldo */}
                <div className="flex items-stretch gap-4">
                  {/* Bloco esquerdo: gasto + delta vs meta */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <DiarioInline
                      value={r.diario}
                      isOverride={r.hasOverride}
                      suggested={suggestedDaily}
                      onCommit={(v) => onUpdateDiario(r.date, v === 0 ? null : v)}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        gasto
                      </span>
                      {suggestedDaily > 0 && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                            deltaTone === "over" &&
                              "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                            deltaTone === "under" &&
                              "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                            deltaTone === "neutral" && "bg-muted text-muted-foreground",
                          )}
                          title={`Meta diária: ${formatCurrency(suggestedDaily)}`}
                        >
                          {deltaTone === "neutral"
                            ? "no alvo"
                            : `${dayDelta > 0 ? "+" : "−"}${formatCurrencyCompact(Math.abs(dayDelta))} vs meta`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Divisor sutil */}
                  <div className="w-px shrink-0 self-stretch bg-border/60" aria-hidden />

                  {/* Bloco direito: saldo do dia com mesma escala tipográfica */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {hasActivity || r.hasOverride ? (
                      <>
                        <span
                          className={cn(
                            "text-lg font-semibold tabular-nums tracking-tight",
                            negative
                              ? "text-rose-600 dark:text-rose-400"
                              : r.isFuture
                                ? "text-foreground/60"
                                : "text-foreground/90",
                          )}
                          title="Saldo correndo"
                        >
                          {formatCurrency(r.saldo)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          saldo
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className="text-lg font-semibold tabular-nums tracking-tight text-muted-foreground/40"
                          aria-hidden
                        >
                          —
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          saldo
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Transactions row */}
                {hasActivity && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {r.transactions.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onOpenKind(t.kind)}
                        className={cn(
                          "group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums transition-colors",
                          t.kind === "entrada"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300",
                        )}
                      >
                        {t.kind === "entrada" ? (
                          <ArrowDownLeft className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        <span>{formatCurrencyCompact(t.amount)}</span>
                        {t.label && (
                          <span className="max-w-[100px] truncate opacity-70">· {t.label}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* Diário inline-editable — protagonista da linha */
function DiarioInline({
  value,
  isOverride,
  suggested,
  onCommit,
}: {
  value: number;
  isOverride: boolean;
  suggested: number;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value > 0 ? formatInput(value) : "");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        inputMode="decimal"
        value={draft}
        placeholder={formatInput(suggested)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(parseAmount(draft));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(parseAmount(draft));
            setEditing(false);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className="h-8 w-28 rounded border border-primary/40 bg-background px-2 text-lg font-semibold tabular-nums tracking-tight outline-none ring-1 ring-primary/20"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "group inline-flex items-baseline gap-1 rounded px-1 -mx-1 text-lg font-semibold tabular-nums tracking-tight transition-colors hover:bg-muted",
        isOverride ? "text-foreground" : "text-foreground/90",
      )}
      title="Editar diário deste dia"
    >
      {formatCurrency(value)}
      {isOverride && (
        <span className="text-[9px] font-medium uppercase tracking-wider text-primary/80">
          ajustado
        </span>
      )}
    </button>
  );
}

/* ---------- Transactions panel (Sheet desktop / Drawer mobile) ---------- */
function TransactionsPanel({
  kind,
  month,
  transactions,
  onClose,
  onSave,
  onDelete,
}: {
  kind: PanelKind;
  month: string;
  transactions: FinanceTransaction[];
  onClose: () => void;
  onSave: (input: Parameters<typeof upsertTransaction>[0]) => void;
  onDelete: (id: string) => void;
}) {
  const isMobile = useIsMobile();
  const open = kind !== null;

  if (!kind) {
    // Render closed wrapper to keep transition consistent
  }

  const title =
    kind === "entrada" ? "Entradas do mês" : kind === "saida" ? "Saídas do mês" : "";

  const filtered = transactions.filter((t) => t.kind === kind);
  const total = filtered.reduce((s, t) => s + t.amount, 0);

  const body = kind ? (
    <PanelBody
      kind={kind}
      month={month}
      list={filtered}
      total={total}
      onSave={onSave}
      onDelete={onDelete}
    />
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
        <DrawerContent className="max-h-[88vh]">
          <DrawerHeader className="px-4 pt-4">
            <DrawerTitle className="text-left text-base">{title}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  kind,
  month,
  list,
  total,
  onSave,
  onDelete,
}: {
  kind: "entrada" | "saida";
  month: string;
  list: FinanceTransaction[];
  total: number;
  onSave: (input: Parameters<typeof upsertTransaction>[0]) => void;
  onDelete: (id: string) => void;
}) {
  const isCurrentMonth = month === currentMonth();
  const defaultDate = isCurrentMonth ? todayIso() : `${month}-01`;

  const [amountStr, setAmountStr] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setDate(defaultDate);
  }, [defaultDate, kind]);

  const tone =
    kind === "entrada"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  function reset() {
    setAmountStr("");
    setLabel("");
    setDate(defaultDate);
    setEditingId(null);
  }

  function submit() {
    const amount = parseAmount(amountStr);
    if (amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    onSave({
      id: editingId ?? undefined,
      date,
      kind,
      amount,
      label: label.trim() || null,
    });
    reset();
  }

  // Group by date for the list
  const grouped = useMemo(() => {
    const byDate = new Map<string, FinanceTransaction[]>();
    for (const t of list) {
      if (!byDate.has(t.date)) byDate.set(t.date, []);
      byDate.get(t.date)!.push(t);
    }
    return Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [list]);

  return (
    <div className="space-y-5">
      {/* Total */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total no mês</p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone)}>
          {formatCurrency(total)}
        </p>
      </div>

      {/* Add form */}
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {editingId ? "Editar lançamento" : "Novo lançamento"}
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className={cn("h-10 text-right text-base tabular-nums", tone)}
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-[140px]"
          />
        </div>
        <Input
          placeholder="Descrição (opcional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="h-10"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          {editingId && (
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={submit}>
            <Plus className="mr-1 h-4 w-4" />
            {editingId ? "Salvar" : "Adicionar"}
          </Button>
        </div>
      </div>

      {/* List */}
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          Lançamentos
        </p>
        {grouped.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum lançamento neste mês.
          </p>
        ) : (
          <ul className="space-y-3">
            {grouped.map(([d, items]) => (
              <li key={d}>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {formatDayLabel(d)}
                </p>
                <ul className="divide-y rounded-lg border">
                  {items.map((t) => (
                    <li
                      key={t.id}
                      className="group flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <button
                        onClick={() => {
                          setEditingId(t.id);
                          setAmountStr(formatInput(t.amount));
                          setLabel(t.label ?? "");
                          setDate(t.date);
                        }}
                        className="flex-1 text-left"
                      >
                        <p className="text-sm">
                          {t.label || (
                            <span className="text-muted-foreground">Sem descrição</span>
                          )}
                        </p>
                        <p className={cn("text-sm font-semibold tabular-nums", tone)}>
                          {formatCurrency(t.amount)}
                        </p>
                      </button>
                      <button
                        onClick={() => onDelete(t.id)}
                        className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-rose-600 group-hover:opacity-100"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- projection ---------- */
function ProjectionCard({
  projection,
  highlightMonth,
}: {
  projection: { month: string; label: string; closingBalance: number; variable: number }[];
  highlightMonth: string;
}) {
  if (projection.length === 0) return null;
  const values = projection.map((p) => p.closingBalance);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Projeção</p>
          <h2 className="text-base font-semibold">Saldo até dezembro</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Considera o diário sugerido para meses sem registros
        </p>
      </div>

      <div className="grid grid-cols-12 items-end gap-1 h-32">
        {projection.map((p) => {
          const heightPct = ((p.closingBalance - min) / range) * 100;
          const isHighlight = p.month === highlightMonth;
          const negative = p.closingBalance < 0;
          return (
            <div key={p.month} className="flex h-full flex-col items-center justify-end">
              <div
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  negative ? "bg-rose-500/70" : "bg-primary/70",
                  isHighlight && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                )}
                style={{ height: `${Math.max(2, heightPct)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-12 gap-1 text-center text-[10px] text-muted-foreground">
        {projection.map((p) => (
          <div key={p.month} className="capitalize">
            {p.label.split(" ")[0].slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-12 gap-1 text-center text-[10px] tabular-nums">
        {projection.map((p) => (
          <div
            key={p.month}
            className={cn(
              p.closingBalance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground",
              p.month === highlightMonth && "font-semibold",
            )}
          >
            {formatCurrencyCompact(p.closingBalance)}
          </div>
        ))}
      </div>
    </div>
  );
}
