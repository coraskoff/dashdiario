import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";

import {
  deleteDay,
  fetchAllDays,
  fetchAllMonths,
  upsertDay,
  upsertMonth,
} from "@/modules/finance/api";
import type { FinanceMonth } from "@/modules/finance/types";
import {
  buildDayRows,
  buildYearProjection,
  currentMonth,
  formatCurrency,
  formatCurrencyCompact,
  formatMonthLabel,
  shiftMonth,
  suggestedDaily,
  summarizeMonth,
  todayIso,
  type DayRow,
} from "@/modules/finance/calculations";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/* ---------- page ---------- */
function FinancePage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(currentMonth());

  const monthsQuery = useQuery({ queryKey: ["finance", "months"], queryFn: fetchAllMonths });
  const daysQuery = useQuery({ queryKey: ["finance", "days"], queryFn: fetchAllDays });

  const months = monthsQuery.data ?? [];
  const allDays = daysQuery.data ?? [];

  // Opening balance for selected month: closing of all months before it.
  const openingBalance = useMemo(() => {
    const earlier = months
      .map((c) => c.month)
      .concat(allDays.map((d) => d.date.slice(0, 7)))
      .filter((m) => m < month);
    const earliest = earlier.length ? earlier.sort()[0] : month;
    if (earliest >= month) return 0;
    let opening = 0;
    let cursor = earliest;
    while (cursor < month) {
      const cfg = months.find((c) => c.month === cursor);
      const monthDays = allDays.filter((d) => d.date.startsWith(cursor));
      const { closingBalance } = buildDayRows(cursor, opening, cfg, monthDays);
      opening = closingBalance;
      cursor = shiftMonth(cursor, 1);
    }
    return opening;
  }, [months, allDays, month]);

  const monthConfig = months.find((c) => c.month === month);
  const monthDays = useMemo(
    () => allDays.filter((d) => d.date.startsWith(month)),
    [allDays, month],
  );

  const { rows } = useMemo(
    () => buildDayRows(month, openingBalance, monthConfig, monthDays),
    [month, openingBalance, monthConfig, monthDays],
  );
  const summary = useMemo(() => summarizeMonth(rows, openingBalance), [rows, openingBalance]);

  // Year projection (only meaningful for current/future months — but always show full year)
  const projection = useMemo(() => {
    // Anchor projection at the earliest of (current real month, viewed month) so the first
    // months align with reality. We start from January of the viewed year for a clean line.
    const [y] = month.split("-");
    const start = `${y}-01`;
    return buildYearProjection(start, 0, months, allDays);
  }, [month, months, allDays]);

  const updateMonthMutation = useMutation({
    mutationFn: upsertMonth,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "months"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertDayMutation = useMutation({
    mutationFn: upsertDay,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "days"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const suggested = suggestedDaily(monthConfig?.variable_amount ?? 0, month);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <Header
        month={month}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
        onToday={() => setMonth(currentMonth())}
      />

      <MonthConfigCard
        month={month}
        config={monthConfig}
        onSave={(variable) =>
          updateMonthMutation.mutate({ month, variable_amount: variable })
        }
      />

      <SummaryCard summary={summary} openingBalance={openingBalance} />

      <DayTable
        rows={rows}
        suggestedDaily={suggested}
        onUpdate={(date, field, value) => {
          const payload: Parameters<typeof upsertDay>[0] = { date };
          if (field === "entrada") payload.entrada = value ?? 0;
          if (field === "saida") payload.saida = value ?? 0;
          if (field === "diario") payload.diario_override = value;
          upsertDayMutation.mutate(payload);
        }}
      />

      <ProjectionCard projection={projection} highlightMonth={month} />
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
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Finanças</p>
        <h1 className="text-2xl font-semibold capitalize tracking-tight md:text-3xl">
          {formatMonthLabel(month)}
        </h1>
      </div>
      <div className="flex items-center gap-1">
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

/* ---------- month config ---------- */
function MonthConfigCard({
  month,
  config,
  onSave,
}: {
  month: string;
  config: FinanceMonth | undefined;
  onSave: (variable: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const variable = config?.variable_amount ?? 0;
  const daily = suggestedDaily(variable, month);

  useEffect(() => {
    setDraft(formatInput(variable));
  }, [variable, editing]);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Variável do mês
          </p>
          {editing ? (
            <div className="flex items-center gap-2">
              <span className="text-lg text-muted-foreground">R$</span>
              <Input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSave(parseAmount(draft));
                    setEditing(false);
                  } else if (e.key === "Escape") {
                    setEditing(false);
                  }
                }}
                onBlur={() => {
                  onSave(parseAmount(draft));
                  setEditing(false);
                }}
                className="h-9 w-32 text-lg"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="group flex items-center gap-2 text-2xl font-semibold tracking-tight hover:text-primary"
            >
              {formatCurrency(variable)}
              <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Diário sugerido</p>
          <p className="text-2xl font-semibold tracking-tight">{formatCurrency(daily)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Sugestão automática dividindo a variável pelos dias do mês. Você pode sobrescrever em
        qualquer dia da tabela.
      </p>
    </div>
  );
}

/* ---------- summary ---------- */
function SummaryCard({
  summary,
  openingBalance,
}: {
  summary: ReturnType<typeof summarizeMonth>;
  openingBalance: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-5">
      <Stat label="Saldo inicial" value={openingBalance} />
      <Stat label="Entradas" value={summary.totalEntrada} tone="positive" />
      <Stat label="Saídas" value={summary.totalSaida} tone="negative" />
      <Stat label="Diário" value={summary.totalDiario} tone="negative" />
      <Stat
        label="Performance"
        value={summary.performance}
        tone={summary.performance >= 0 ? "positive" : "negative"}
        emphasize
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

/* ---------- day table ---------- */
function DayTable({
  rows,
  onSelectDay,
}: {
  rows: DayRow[];
  onSelectDay: (date: string) => void;
}) {
  const today = todayIso();
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-[44px_1fr_1fr_1fr_1.2fr] border-b bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <div>Dia</div>
        <div className="text-right">Entrada</div>
        <div className="text-right">Saída</div>
        <div className="text-right">Diário</div>
        <div className="text-right">Saldo</div>
      </div>
      <ul className="divide-y">
        {rows.map((r) => {
          const isToday = r.date === today;
          const negative = r.saldo < 0;
          return (
            <li key={r.date}>
              <button
                onClick={() => onSelectDay(r.date)}
                className={cn(
                  "grid w-full grid-cols-[44px_1fr_1fr_1fr_1.2fr] items-center px-3 py-2.5 text-sm transition-colors hover:bg-muted/40",
                  isToday && "bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1 text-muted-foreground",
                    isToday && "font-semibold text-primary",
                  )}
                >
                  <span className="tabular-nums">{String(r.dayNumber).padStart(2, "0")}</span>
                </div>
                <div
                  className={cn(
                    "text-right tabular-nums",
                    r.entrada > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40",
                  )}
                >
                  {r.entrada > 0 ? formatCurrencyCompact(r.entrada) : "—"}
                </div>
                <div
                  className={cn(
                    "text-right tabular-nums",
                    r.saida > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground/40",
                  )}
                >
                  {r.saida > 0 ? formatCurrencyCompact(r.saida) : "—"}
                </div>
                <div className="text-right tabular-nums text-muted-foreground">
                  {formatCurrencyCompact(r.diario)}
                </div>
                <div
                  className={cn(
                    "text-right font-medium tabular-nums",
                    negative && "text-rose-600 dark:text-rose-400",
                    r.isProjected && !negative && "text-muted-foreground",
                  )}
                >
                  {formatCurrency(r.saldo)}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
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

/* ---------- day editor ---------- */
interface DayEditorProps {
  open: boolean;
  isMobile: boolean;
  row: DayRow | null;
  suggestedDaily: number;
  onClose: () => void;
  onSave: (input: {
    date: string;
    entrada: number;
    saida: number;
    diario_override: number | null;
    entrada_label: string | null;
    saida_label: string | null;
  }) => void;
  onClear: (date: string) => void;
}

function DayEditor(props: DayEditorProps) {
  const { open, isMobile, row, onClose } = props;
  if (!row) return null;
  const title = (
    <span className="capitalize">{dayLabel(row.date)}</span>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <DayEditorForm {...props} />
          </div>
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
        <div className="mt-6">
          <DayEditorForm {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DayEditorForm({ row, suggestedDaily, onSave, onClear, onClose }: DayEditorProps) {
  if (!row) return null;
  const [entrada, setEntrada] = useState(formatInput(row.entrada));
  const [saida, setSaida] = useState(formatInput(row.saida));
  const [diario, setDiario] = useState(
    row.diario === suggestedDaily ? "" : formatInput(row.diario),
  );

  useEffect(() => {
    setEntrada(formatInput(row.entrada));
    setSaida(formatInput(row.saida));
    setDiario(row.diario === suggestedDaily ? "" : formatInput(row.diario));
  }, [row.date, row.entrada, row.saida, row.diario, suggestedDaily]);

  const handleSave = () => {
    const diarioParsed = diario.trim() ? parseAmount(diario) : null;
    onSave({
      date: row.date,
      entrada: parseAmount(entrada),
      saida: parseAmount(saida),
      diario_override: diarioParsed,
      entrada_label: null,
      saida_label: null,
    });
  };

  return (
    <div className="space-y-5">
      <Field
        label="Entrada"
        value={entrada}
        onChange={setEntrada}
        accent="positive"
      />
      <Field label="Saída" value={saida} onChange={setSaida} accent="negative" />
      <Field
        label="Diário"
        value={diario}
        onChange={setDiario}
        placeholder={`Sugerido: ${formatCurrency(suggestedDaily)}`}
        helper="Deixe em branco para usar o diário sugerido do mês."
      />

      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onClear(row.date)}
        >
          <Trash2 className="h-4 w-4" />
          Limpar dia
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            <X />
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  accent,
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent?: "positive" | "negative";
  placeholder?: string;
  helper?: string;
}) {
  return (
    <label className="block">
      <span
        className={cn(
          "mb-1 block text-xs font-medium uppercase tracking-wide",
          accent === "positive" && "text-emerald-600 dark:text-emerald-400",
          accent === "negative" && "text-rose-600 dark:text-rose-400",
          !accent && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">R$</span>
        <Input
          inputMode="decimal"
          value={value}
          placeholder={placeholder ?? "0,00"}
          onChange={(e) => onChange(e.target.value)}
          className="text-base"
        />
      </div>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </label>
  );
}
