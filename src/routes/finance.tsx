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
  ChevronDown,
  Eye,
  EyeOff,
  Sparkles,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
  CalendarDays,
} from "lucide-react";

import {
  deleteTransaction,
  deleteRecurringFromDate,
  deleteAllRecurring,
  updateRecurringFromDate,
  updateAllRecurring,
  fetchAllDays,
  fetchAllMonths,
  fetchAllTransactions,
  upsertDayDiario,
  upsertMonth,
  upsertTransaction,
} from "@/modules/finance/api";
import { RecurringScopeDialog, type RecurringScope } from "@/modules/finance/RecurringScopeDialog";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useMobileFab } from "@/routes/__root";

export const Route = createFileRoute("/finance")({
  component: FinancePage,
});

/* ---------- helpers ---------- */
function parseAmount(input: string): number {
  if (!input) return 0;
  const normalized = input.replace(/\s/g, "").replace(/,/g, ".");
  const tokens = normalized.split(/([+\-*/])/);
  let result = 0;
  let operator = "+";
  for (const token of tokens) {
    if (["+", "-", "*", "/"].includes(token)) {
      operator = token;
    } else {
      const n = Number(token);
      if (!Number.isFinite(n)) return 0;
      if (operator === "+") result += n;
      else if (operator === "-") result -= n;
      else if (operator === "*") result *= n;
      else if (operator === "/") result = n !== 0 ? result / n : 0;
    }
  }
  return Number.isFinite(result) ? result : 0;
}

function formatInput(value: number): string {
  if (!value) return "";
  return value.toFixed(2).replace(".", ",");
}

function shiftDate(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(d, maxDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function remainingMonthsInYear(dateStr: string): number {
  const m = Number(dateStr.split("-")[1]);
  return 12 - m + 1;
}

type PanelKind = "entrada" | "saida" | null;

/* ---------- page ---------- */
function FinancePage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(currentMonth());
  const [panel, setPanel] = useState<PanelKind>(null);
  const [diarioQuickOpen, setDiarioQuickOpen] = useState(false);
  const [panelEditId, setPanelEditId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem("finance-hidden") === "1"; } catch { return false; }
  });
  const toggleHidden = () =>
    setHidden((v) => {
      const next = !v;
      try { localStorage.setItem("finance-hidden", next ? "1" : "0"); } catch {}
      return next;
    });

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

  const deleteFromDateMutation = useMutation({
    mutationFn: ({ groupId, fromDate }: { groupId: string; fromDate: string }) =>
      deleteRecurringFromDate(groupId, fromDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: (groupId: string) => deleteAllRecurring(groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateFromDateMutation = useMutation({
    mutationFn: ({
      groupId,
      fromDate,
      patch,
    }: {
      groupId: string;
      fromDate: string;
      patch: { amount?: number; label?: string | null };
    }) => updateRecurringFromDate(groupId, fromDate, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAllMutation = useMutation({
    mutationFn: ({
      groupId,
      patch,
    }: {
      groupId: string;
      patch: { amount?: number; label?: string | null };
    }) => updateAllRecurring(groupId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "transactions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const suggested = suggestedDaily(monthConfig?.variable_amount ?? 0, month);

  const [mobileFabOpen, setMobileFabOpen] = useState(false);

  const openNew = (k: "entrada" | "saida" | "diario") => {
    if (k === "diario") setDiarioQuickOpen(true);
    else setPanel(k);
  };

  useMobileFab(() => setMobileFabOpen(true));

  const todayRow = rows.find((r) => r.isToday) ?? rows[rows.length - 1];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-5 sm:px-4 md:space-y-6 md:px-8 md:py-6">
      <Header
        month={month}
        hidden={hidden}
        onToggleHidden={toggleHidden}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
        onToday={() => setMonth(currentMonth())}
        onNew={openNew}
      />

      <HeroCard
        month={month}
        config={monthConfig}
        summary={summary}
        openingBalance={openingBalance}
        hidden={hidden}
        rows={rows}
        onSaveVariable={(variable) =>
          updateMonthMutation.mutate({ month, variable_amount: variable })
        }
        onOpenKind={(k, editId) => { setPanel(k); setPanelEditId(editId ?? null); }}
        onUpdateDiario={(date, value) =>
          updateDiarioMutation.mutate({ date, diario_override: value })
        }
      />

      <SecondaryStats
        summary={summary}
        openingBalance={openingBalance}
        hidden={hidden}
        onOpenEntradas={() => setPanel("entrada")}
        onOpenSaidas={() => setPanel("saida")}
      />

      <Pulse
        rows={rows}
        suggestedDaily={suggested}
        onUpdateDiario={(date, value) =>
          updateDiarioMutation.mutate({ date, diario_override: value })
        }
        onOpenKind={(k, editId) => { setPanel(k); setPanelEditId(editId ?? null); }}
      />

      <ProjectionCard projection={projection} highlightMonth={month} />

      <TransactionsPanel
        kind={panel}
        month={month}
        transactions={monthTx}
        editId={panelEditId}
        onClose={() => { setPanel(null); setPanelEditId(null); }}
        onSave={(input) => upsertTxMutation.mutate(input)}
        onDelete={(id) => deleteTxMutation.mutate(id)}
        onDeleteFromDate={(groupId, fromDate) => deleteFromDateMutation.mutate({ groupId, fromDate })}
        onDeleteAll={(groupId) => deleteAllMutation.mutate(groupId)}
        onUpdateFromDate={(groupId, fromDate, patch) => updateFromDateMutation.mutate({ groupId, fromDate, patch })}
        onUpdateAll={(groupId, patch) => updateAllMutation.mutate({ groupId, patch })}
      />

      <DiarioQuickEdit
        open={diarioQuickOpen}
        onClose={() => setDiarioQuickOpen(false)}
        date={todayRow?.date ?? todayIso()}
        currentValue={todayRow?.diario ?? suggested}
        suggested={suggested}
        hasOverride={todayRow?.hasOverride ?? false}
        onSave={(value) => {
          updateDiarioMutation.mutate({
            date: todayRow?.date ?? todayIso(),
            diario_override: value,
          });
          setDiarioQuickOpen(false);
        }}
      />

      <Drawer open={mobileFabOpen} onOpenChange={setMobileFabOpen}>
        <DrawerContent>
          <DrawerHeader className="px-4 pt-4">
            <DrawerTitle className="text-left text-base">Novo lançamento</DrawerTitle>
          </DrawerHeader>
          <div className="px-3 pb-6">
            <NewActionList
              size="lg"
              onPick={(k) => {
                setMobileFabOpen(false);
                openNew(k);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/* ---------- header ---------- */
function Header({
  month,
  hidden,
  onToggleHidden,
  onPrev,
  onNext,
  onToday,
  onNew,
}: {
  month: string;
  hidden: boolean;
  onToggleHidden: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew: (k: "entrada" | "saida" | "diario") => void;
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
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleHidden}
          aria-label={hidden ? "Exibir valores" : "Ocultar valores"}
        >
          {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
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
        <DesktopNewButton onNew={onNew} />
      </div>
    </header>
  );
}

/* ---------- new action menu (desktop popover) ---------- */
function DesktopNewButton({
  onNew,
}: {
  onNew: (k: "entrada" | "saida" | "diario") => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="ml-1 hidden h-9 gap-1.5 px-3 md:inline-flex"
        >
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <NewActionList
          onPick={(k) => {
            setOpen(false);
            onNew(k);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ---------- new action FAB (mobile) ---------- */
function NewActionList({
  onPick,
  size = "md",
}: {
  onPick: (k: "entrada" | "saida" | "diario") => void;
  size?: "md" | "lg";
}) {
  const items: Array<{
    kind: "entrada" | "saida" | "diario";
    label: string;
    desc: string;
    glyph: string;
    accent: string;
    hint: string;
  }> = [
    {
      kind: "entrada",
      label: "Entrada",
      desc: "Recebimento ou crédito",
      glyph: "+",
      accent: "bg-emerald-500",
      hint: "E",
    },
    {
      kind: "saida",
      label: "Saída",
      desc: "Pagamento ou despesa",
      glyph: "−",
      accent: "bg-rose-500",
      hint: "S",
    },
    {
      kind: "diario",
      label: "Gasto diário",
      desc: "Ajustar diário de hoje",
      glyph: "·",
      accent: "bg-foreground/40",
      hint: "D",
    },
  ];
  return (
    <ul className="flex flex-col">
      {items.map(({ kind, label, desc, glyph, accent, hint }, i) => (
        <li key={kind} className={i > 0 ? "border-t border-border/60" : ""}>
          <button
            type="button"
            onClick={() => onPick(kind)}
            className={cn(
              "group relative flex w-full items-center gap-3 rounded-sm pl-3 pr-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none",
              size === "lg" ? "py-3.5" : "py-2.5",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100",
                accent,
              )}
            />
            <span
              aria-hidden
              className={cn(
                "flex shrink-0 items-center justify-center font-mono text-foreground/70 tabular-nums leading-none",
                size === "lg" ? "h-6 w-5 text-xl" : "h-5 w-4 text-base",
              )}
            >
              {glyph}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium tracking-tight">{label}</span>
              <span className="block text-[11px] text-muted-foreground">{desc}</span>
            </span>
            <kbd className="hidden md:inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/70 px-1 font-mono text-[10px] text-muted-foreground/70">
              {hint}
            </kbd>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- diário quick edit ---------- */
function DiarioQuickEdit({
  open,
  onClose,
  date,
  currentValue,
  suggested,
  hasOverride,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  currentValue: number;
  suggested: number;
  hasOverride: boolean;
  onSave: (value: number | null) => void;
}) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft(formatInput(currentValue));
  }, [open, currentValue]);

  const submit = () => {
    const v = parseAmount(draft);
    if (v < 0) {
      toast.error("Valor inválido.");
      return;
    }
    onSave(v);
  };

  const body = (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {formatDayLabel(date)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sugerido: <span className="tabular-nums">{formatCurrency(suggested)}</span>
          {hasOverride && <span className="ml-2 text-amber-600">· ajustado</span>}
        </p>
      </div>
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Gasto diário
        </label>
        <Input
          autoFocus
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="0,00"
          className="mt-1 h-11 text-right text-base tabular-nums"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {hasOverride && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSave(null)}
          >
            Usar sugerido
          </Button>
        )}
        <Button size="sm" onClick={submit}>
          Salvar
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
        <DrawerContent>
          <DrawerHeader className="px-4 pt-4">
            <DrawerTitle className="text-left text-base">Gasto diário</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Gasto diário</SheetTitle>
        </SheetHeader>
        <div className="mt-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- hero card: projeção + ritmo ---------- */
function HeroCard({
  month,
  config,
  summary,
  openingBalance,
  hidden,
  rows,
  onSaveVariable,
  onOpenKind,
  onUpdateDiario,
}: {
  month: string;
  config: FinanceMonth | undefined;
  summary: ReturnType<typeof summarizeMonth>;
  openingBalance: number;
  hidden: boolean;
  rows: DayRow[];
  onSaveVariable: (variable: number) => void;
  onOpenKind: (kind: "entrada" | "saida", editId?: string | null) => void;
  onUpdateDiario: (date: string, value: number | null) => void;
}) {
  const mask = "R$ ••••";
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
        <div className="min-w-0 bg-card p-4 md:p-6">
          <p
            className={cn(
              "break-words text-3xl font-semibold leading-tight tracking-tight tabular-nums sm:text-4xl md:text-5xl",
              hidden
                ? "text-muted-foreground"
                : isProjPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
            )}
          >
            {hidden ? mask : formatCurrency(projected)}
          </p>
          {/* Contexto: variável (editável) + diário sugerido */}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
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
                  {hidden ? mask : formatCurrency(variable)}
                  <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                </button>
              )}
            </div>
            <span className="hidden text-border sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <span className="uppercase tracking-wide">Diário</span>
              <span className="font-medium text-foreground tabular-nums">
                {hidden ? mask : formatCurrency(daily)}
              </span>
            </div>
          </div>
        </div>

        {/* Bloco direito: gasto vs tempo */}
        <div className="min-w-0 bg-card p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            {variable > 0 && (
              <p className="ml-auto text-[11px] tabular-nums text-muted-foreground sm:text-xs">
                <span className="font-medium text-foreground">{hidden ? "••%" : `${pctMonth}%`}</span> do mês /{" "}
                <span
                  className={cn(
                    "font-medium",
                    hidden
                      ? "text-foreground"
                      : overPace
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {hidden ? "••%" : `${pctVar}%`}
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
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
              <span>R$ 0</span>
              <span className="truncate text-foreground/80">
                {hidden ? "Meta ••••" : `Meta ${formatCurrencyCompact(targetProportional)}`}
              </span>
              <span>{hidden ? "••••" : formatCurrencyCompact(variable)}</span>
            </div>
          </div>

          {/* Legenda */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-sm",
                  overPace ? "bg-rose-500" : "bg-emerald-500",
                )}
              />
              {hidden ? "Gasto" : `Gasto (${formatCurrencyCompact(spentReal)})`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-px bg-foreground/70" />
              Meta
            </span>
          </div>

          <SpendingHeatmap rows={rows} suggested={daily} month={month} />
        </div>
      </div>
    </section>
  );
}

/* ---------- secondary stats row ---------- */
function SecondaryStats({
  summary,
  openingBalance,
  hidden,
  onOpenEntradas,
  onOpenSaidas,
}: {
  summary: ReturnType<typeof summarizeMonth>;
  openingBalance: number;
  hidden: boolean;
  onOpenEntradas: () => void;
  onOpenSaidas: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
      <Stat label="Saldo inicial" value={openingBalance} hidden={hidden} />
      <StatButton
        label="Entradas"
        value={summary.totalEntrada}
        tone="positive"
        hidden={hidden}
        onClick={onOpenEntradas}
      />
      <StatButton
        label="Saídas"
        value={summary.totalSaida}
        tone="negative"
        hidden={hidden}
        onClick={onOpenSaidas}
      />
      <Stat
        label="Performance"
        value={summary.performance}
        tone={summary.performance >= 0 ? "positive" : "negative"}
        hidden={hidden}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  emphasize,
  hidden,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
  emphasize?: boolean;
  hidden?: boolean;
}) {
  return (
    <div className="min-w-0 bg-card p-3 sm:p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-semibold tabular-nums tracking-tight",
          emphasize ? "text-xl" : "text-base",
          !hidden && tone === "positive" && value > 0 && "text-emerald-600 dark:text-emerald-400",
          !hidden && tone === "negative" && value > 0 && "text-rose-600 dark:text-rose-400",
          !hidden && tone === "positive" && value < 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        {hidden ? "R$ ••••" : formatCurrency(value)}
      </p>
    </div>
  );
}

function StatButton({
  label,
  value,
  tone,
  hidden,
  onClick,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
  hidden?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group min-w-0 bg-card p-3 text-left transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Plus className="h-3 w-3 text-muted-foreground/50 transition-colors group-hover:text-primary" />
      </div>
      <p
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums tracking-tight",
          !hidden && tone === "positive" && value > 0 && "text-emerald-600 dark:text-emerald-400",
          !hidden && tone === "negative" && value > 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        {hidden ? "R$ ••••" : formatCurrency(value)}
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
  onOpenKind: (k: PanelKind, editId?: string) => void;
}) {
  const todayRef = useRef<HTMLLIElement>(null);

  // Insight: comparar gasto diário acumulado vs meta acumulada (apenas dias passados + hoje)
  const elapsed = rows.filter((r) => !r.isFuture);
  const spentSoFar = elapsed.reduce((s, r) => s + r.diario, 0);
  const targetSoFar = elapsed.reduce((s, r) => s + suggestedDaily, 0);
  const insightDelta = spentSoFar - targetSoFar; // > 0 = acima da meta
  const futureDays = rows.filter((r) => r.isFuture);
  const committedFuture = futureDays
    .filter((r) => r.hasOverride)
    .reduce((s, r) => s + r.diario, 0);
  const freeFutureDays = futureDays.filter((r) => !r.hasOverride);
  const totalTarget = rows.reduce((s, r) => s + suggestedDaily, 0);
  const remainingBudget = totalTarget - spentSoFar - committedFuture;
  const recalibrated = freeFutureDays.length > 0 ? remainingBudget / freeFutureDays.length : 0;
  const remainingDays = freeFutureDays.length;
  const isOver = insightDelta > 0.5;

  const pastRows = rows.filter((r) => !r.isFuture && !r.isToday);
  const currentRows = rows.filter((r) => r.isToday || r.isFuture);
  const pastDiario = pastRows.reduce((s, r) => s + r.diario, 0);
  const pastEntrada = pastRows.reduce((s, r) => s + r.entrada, 0);
  const pastSaida = pastRows.reduce((s, r) => s + r.saida, 0);

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pulso diário</p>
          <h2 className="text-sm font-semibold">Saldo correndo</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
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
            "flex items-start gap-3 border-b px-3 py-3 sm:px-4",
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
        {/* ── Dias anteriores (colapsável) ── */}
        {pastRows.length > 0 && (
          <li className="border-b border-border/40">
            <details className="group">
              <summary className="flex cursor-pointer list-none select-none items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:px-4">
                <ChevronDown className="h-3 w-3 shrink-0 -rotate-90 transition-transform duration-200 group-open:rotate-0" />
                <span className="font-medium">Dias anteriores</span>
                <span className="tabular-nums">
                  {" "}· Diário {formatCurrencyCompact(pastDiario)}
                </span>
                {pastEntrada > 0 && (
                  <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                    · Entradas {formatCurrencyCompact(pastEntrada)}
                  </span>
                )}
                {pastSaida > 0 && (
                  <span className="tabular-nums text-rose-700 dark:text-rose-400">
                    · Saídas {formatCurrencyCompact(pastSaida)}
                  </span>
                )}
              </summary>
              <ul>
                {pastRows.map((r, i) => {
                  const negative = r.saldo < 0;
                  const hasActivity = r.transactions.length > 0;
                  const isLast = i === pastRows.length - 1;
                  const dayDelta = r.diario - suggestedDaily;
                  const deltaTone: "over" | "under" | "neutral" =
                    Math.abs(dayDelta) < 0.005 ? "neutral" : dayDelta > 0 ? "over" : "under";
                  return (
                    <li
                      key={r.date}
                      className={cn(
                        "relative grid grid-cols-[44px_1fr] gap-2 px-3 py-3 opacity-60 transition-colors sm:grid-cols-[56px_1fr] sm:gap-3 sm:px-4",
                        !isLast && "border-b border-border/40",
                      )}
                    >
                      <div className="relative flex flex-col items-center">
                        <span
                          aria-hidden
                          className={cn(
                            "absolute left-1/2 top-0 h-full w-px -translate-x-1/2",
                            "bg-border/60",
                          )}
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "relative z-10 mt-1.5 h-2 w-2 rounded-full ring-4 ring-card",
                            negative ? "bg-rose-500" : hasActivity ? "bg-foreground/60" : "bg-border",
                          )}
                        />
                        <div className="relative z-10 mt-1 flex flex-col items-center">
                          <span className="text-xs font-semibold tabular-nums">
                            {String(r.dayNumber).padStart(2, "0")}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][r.weekday]}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-stretch gap-3 sm:gap-4">
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <DiarioInline
                              value={r.diario}
                              isOverride={r.hasOverride}
                              suggested={suggestedDaily}
                              onCommit={(v) => onUpdateDiario(r.date, v)}
                            />
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                          <div className="w-px shrink-0 self-stretch bg-border/60" aria-hidden />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span
                              className={cn(
                                "truncate text-lg font-semibold tabular-nums tracking-tight",
                                negative
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-foreground/90",
                              )}
                              title="Saldo correndo"
                            >
                              {formatCurrency(r.saldo)}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              saldo
                            </span>
                          </div>
                        </div>
                        {hasActivity && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {r.transactions.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => onOpenKind(t.kind, t.id)}
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
            </details>
          </li>
        )}

        {/* ── Hoje e dias futuros ── */}
        {currentRows.map((r, i) => {
          const negative = r.saldo < 0;
          const hasActivity = r.transactions.length > 0;
          const isLast = i === currentRows.length - 1;
          const dayDelta = r.diario - suggestedDaily;
          const deltaTone: "over" | "under" | "neutral" =
            Math.abs(dayDelta) < 0.005 ? "neutral" : dayDelta > 0 ? "over" : "under";
          return (
            <li
              key={r.date}
              ref={r.isToday ? todayRef : undefined}
              className={cn(
                "relative grid grid-cols-[44px_1fr] gap-2 px-3 py-3 transition-colors sm:grid-cols-[56px_1fr] sm:gap-3 sm:px-4",
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
                <div className="flex items-stretch gap-3 sm:gap-4">
                  {/* Bloco esquerdo: gasto + delta vs meta */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <DiarioInline
                      value={r.diario}
                      isOverride={r.hasOverride}
                      suggested={suggestedDaily}
                      onCommit={(v) => onUpdateDiario(r.date, v)}
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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

                  {/* Bloco direito: saldo do dia — sempre visível, mesma escala */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className={cn(
                        "truncate text-lg font-semibold tabular-nums tracking-tight",
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
                  </div>
                </div>

                {/* Transactions row */}
                {hasActivity && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {r.transactions.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onOpenKind(t.kind, t.id)}
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
  onCommit: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commitDraft() {
    const trimmed = draft.trim();
    onCommit(trimmed === "" ? null : parseAmount(trimmed));
  }

  useEffect(() => {
    if (editing) {
      // Se há override (inclusive zero), mostra o valor atual; senão abre em branco
      setDraft(isOverride ? formatInput(value) : "");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value, isOverride]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        inputMode="text"
        value={draft}
        placeholder={formatInput(suggested)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          commitDraft();
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
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
  editId,
  onClose,
  onSave,
  onDelete,
  onDeleteFromDate,
  onDeleteAll,
  onUpdateFromDate,
  onUpdateAll,
}: {
  kind: PanelKind;
  month: string;
  transactions: FinanceTransaction[];
  editId?: string | null;
  onClose: () => void;
  onSave: (input: Parameters<typeof upsertTransaction>[0]) => void;
  onDelete: (id: string) => void;
  onDeleteFromDate: (groupId: string, fromDate: string) => void;
  onDeleteAll: (groupId: string) => void;
  onUpdateFromDate: (groupId: string, fromDate: string, patch: { amount?: number; label?: string | null }) => void;
  onUpdateAll: (groupId: string, patch: { amount?: number; label?: string | null }) => void;
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
      editId={editId}
      onSave={onSave}
      onDelete={onDelete}
      onDeleteFromDate={onDeleteFromDate}
      onDeleteAll={onDeleteAll}
      onUpdateFromDate={onUpdateFromDate}
      onUpdateAll={onUpdateAll}
    />
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
        <DrawerContent className="flex max-h-[88vh] flex-col">
          <DrawerHeader className="shrink-0 px-4 pt-4">
            <DrawerTitle className="text-left text-base">{title}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="shrink-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="-mx-6 mt-4 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {body}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  kind,
  month,
  list,
  total,
  editId,
  onSave,
  onDelete,
  onDeleteFromDate,
  onDeleteAll,
  onUpdateFromDate,
  onUpdateAll,
}: {
  kind: "entrada" | "saida";
  month: string;
  list: FinanceTransaction[];
  total: number;
  editId?: string | null;
  onSave: (input: Parameters<typeof upsertTransaction>[0]) => void;
  onDelete: (id: string) => void;
  onDeleteFromDate: (groupId: string, fromDate: string) => void;
  onDeleteAll: (groupId: string) => void;
  onUpdateFromDate: (groupId: string, fromDate: string, patch: { amount?: number; label?: string | null }) => void;
  onUpdateAll: (groupId: string, patch: { amount?: number; label?: string | null }) => void;
}) {
  const isCurrentMonth = month === currentMonth();
  const defaultDate = isCurrentMonth ? todayIso() : `${month}-01`;

  const [amountStr, setAmountStr] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [recurringCount, setRecurringCount] = useState(3);
  const [unlimited, setUnlimited] = useState(false);

  type PendingAction =
    | { type: "edit"; tx: FinanceTransaction; amount: number; label: string | null }
    | { type: "delete"; tx: FinanceTransaction };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);

  useEffect(() => {
    setDate(defaultDate);
  }, [defaultDate, kind]);

  useEffect(() => {
    if (!editId) return;
    const t = list.find((tx) => tx.id === editId);
    if (!t) return;
    setEditingId(t.id);
    setAmountStr(formatInput(t.amount));
    setLabel(t.label ?? "");
    setDate(t.date);
  }, [editId]);

  const tone =
    kind === "entrada"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  const activeTone =
    kind === "entrada"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
      : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800";

  function reset() {
    setAmountStr("");
    setLabel("");
    setDate(defaultDate);
    setEditingId(null);
    setRecurring(false);
    setRecurringCount(3);
    setUnlimited(false);
  }

  function submit() {
    const amount = parseAmount(amountStr);
    if (amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }

    if (editingId) {
      const tx = list.find((t) => t.id === editingId);
      if (tx?.recurring_group_id) {
        setPendingAction({ type: "edit", tx, amount, label: label.trim() || null });
        setScopeDialogOpen(true);
        return;
      }
      onSave({ id: editingId, date, kind, amount, label: label.trim() || null });
      reset();
      return;
    }

    const occurrences = !recurring
      ? 1
      : unlimited
        ? remainingMonthsInYear(date)
        : recurringCount;
    const groupId = occurrences > 1 ? crypto.randomUUID() : null;
    for (let i = 0; i < occurrences; i++) {
      onSave({
        id: undefined,
        date: i === 0 ? date : shiftDate(date, i),
        kind,
        amount,
        label: label.trim() || null,
        recurring_group_id: groupId,
      });
    }
    reset();
  }

  function handleScopeConfirm(scope: RecurringScope) {
    setScopeDialogOpen(false);
    if (!pendingAction) return;

    if (pendingAction.type === "delete") {
      const { tx } = pendingAction;
      if (scope === "only_this") onDelete(tx.id);
      else if (scope === "this_and_next") onDeleteFromDate(tx.recurring_group_id!, tx.date);
      else onDeleteAll(tx.recurring_group_id!);
    }

    if (pendingAction.type === "edit") {
      const { tx, amount, label: pendingLabel } = pendingAction;
      const patch = { amount, label: pendingLabel };
      onSave({ id: tx.id, date, kind, amount, label: pendingLabel });
      if (scope === "this_and_next") onUpdateFromDate(tx.recurring_group_id!, tx.date, patch);
      else if (scope === "all") onUpdateAll(tx.recurring_group_id!, patch);
    }

    reset();
    setPendingAction(null);
  }

  const submitLabel = (() => {
    if (editingId) return "Salvar";
    if (!recurring) return "Adicionar";
    if (unlimited) return `Adicionar ∞`;
    return `Adicionar ×${recurringCount}`;
  })();

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
        {!editingId && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setRecurring((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                recurring
                  ? activeTone
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Repeat2 className="h-3 w-3" />
              Recorrente
            </button>

            {recurring && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Repetir por</span>
                <input
                  type="number"
                  min={2}
                  max={60}
                  value={unlimited ? "" : recurringCount}
                  disabled={unlimited}
                  onChange={(e) => {
                    const v = Math.max(2, Math.min(60, Number(e.target.value) || 2));
                    setRecurringCount(v);
                  }}
                  className={cn(
                    "h-7 w-14 rounded border bg-background text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring",
                    unlimited && "opacity-30",
                  )}
                  placeholder="—"
                />
                <span className="text-[11px] text-muted-foreground">meses</span>
                <button
                  type="button"
                  onClick={() => setUnlimited((v) => !v)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    unlimited
                      ? activeTone
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  ∞ Ilimitado
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {editingId && (
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={submit}>
            <Plus className="mr-1 h-4 w-4" />
            {submitLabel}
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
                        onClick={() => {
                          if (t.recurring_group_id) {
                            setPendingAction({ type: "delete", tx: t });
                            setScopeDialogOpen(true);
                          } else {
                            onDelete(t.id);
                          }
                        }}
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

      <RecurringScopeDialog
        open={scopeDialogOpen}
        action={pendingAction?.type ?? "delete"}
        onConfirm={handleScopeConfirm}
        onCancel={() => {
          setScopeDialogOpen(false);
          setPendingAction(null);
        }}
      />
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

  const currentBalance = projection.find((p) => p.month === highlightMonth)?.closingBalance ?? 0;
  const decemberBalance = projection[projection.length - 1]?.closingBalance ?? 0;
  const negativeCount = projection.filter((p) => p.closingBalance < 0).length;

  const W = 540, H = 180, PL = 66, PR = 12, PT = 16, PB = 26;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const n = projection.length;

  const allVals = projection.map((p) => p.closingBalance);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const vPad = ((rawMax - rawMin) || 200) * 0.15;
  const minVal = Math.min(0, rawMin) - vPad;
  const maxVal = rawMax + vPad;
  const valRange = maxVal - minVal || 1;

  const toX = (i: number) => PL + (i / Math.max(n - 1, 1)) * plotW;
  const toY = (v: number) => PT + (1 - (v - minVal) / valRange) * plotH;

  const pts = projection.map((p, i) => ({ ...p, x: toX(i), y: toY(p.closingBalance) }));
  const zeroY = toY(0);

  const pastPts = pts.filter((p) => p.month <= highlightMonth);
  const futurePts = pts.filter((p) => p.month >= highlightMonth);

  // Smooth cubic-bezier path (horizontal tangents)
  function smoothD(points: typeof pts) {
    if (points.length < 2) return "";
    let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const px = points[i - 1].x, py = points[i - 1].y;
      const cx = points[i].x, cy = points[i].y;
      const mx = ((px + cx) / 2).toFixed(1);
      d += ` C${mx},${py.toFixed(1)} ${mx},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
    }
    return d;
  }

  // Area path: curve + close to bottom of plot
  function areaD(points: typeof pts) {
    if (points.length < 2) return "";
    const bot = (PT + plotH).toFixed(1);
    return `${smoothD(points)} L${points[points.length - 1].x.toFixed(1)},${bot} L${points[0].x.toFixed(1)},${bot} Z`;
  }

  const yTicks = Array.from({ length: 4 }, (_, i) => minVal + (i / 3) * valRange);
  const curPt = pts.find((p) => p.month === highlightMonth);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Projeção anual</p>
        <h2 className="text-base font-semibold">Saldo até dezembro</h2>
      </div>

      {/* 3 summary cards */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className={cn("rounded-lg border p-3",
          currentBalance >= 0 ? "border-l-[3px] border-l-emerald-500" : "border-l-[3px] border-l-rose-500")}>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo atual</p>
          <p className={cn("mt-1 text-lg font-semibold tabular-nums tracking-tight",
            currentBalance < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
            {formatCurrencyCompact(currentBalance)}
          </p>
        </div>
        <div className={cn("rounded-lg border p-3",
          decemberBalance >= 0 ? "border-l-[3px] border-l-emerald-500" : "border-l-[3px] border-l-rose-500")}>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Dezembro</p>
          <p className={cn("mt-1 text-lg font-semibold tabular-nums tracking-tight",
            decemberBalance < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
            {formatCurrencyCompact(decemberBalance)}
          </p>
        </div>
        <div className={cn("rounded-lg border p-3",
          negativeCount === 0 ? "border-l-[3px] border-l-emerald-500" : "border-l-[3px] border-l-rose-500")}>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meses negativos</p>
          <p className={cn("mt-1 text-lg font-semibold tabular-nums tracking-tight",
            negativeCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
            {negativeCount} / {projection.length}
          </p>
        </div>
      </div>

      {/* SVG line chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="proj-g-past" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.12" />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="proj-g-future" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.12" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
          <style>{`
            @keyframes _proj-draw { from { stroke-dashoffset: 2000 } to { stroke-dashoffset: 0 } }
            @keyframes _proj-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes _proj-dot  { from { opacity: 0 } to { opacity: 1 } }
            @keyframes _proj-ring {
              0%,100% { opacity: .55; transform: scale(1); }
              50%      { opacity: 0;  transform: scale(2.6); }
            }
            ._proj-past  { stroke-dasharray:2000; animation:_proj-draw 1.3s cubic-bezier(.4,0,.2,1) forwards; }
            ._proj-fut   { animation:_proj-fade .6s ease .85s both; }
            ._proj-area  { animation:_proj-fade .9s ease both; }
            ._proj-ring  { transform-box:fill-box; transform-origin:center; animation:_proj-ring 2.2s ease-in-out 1.5s infinite; }
            ._tt-bg      { fill:#ffffff; stroke:#e2e8f0; }
            ._tt-title   { fill:#0f172a; }
            ._tt-label   { fill:#64748b; }
            ._tt-val-pos { fill:#0f172a; font-weight:700; }
            ._tt-val-neg { fill:#ef4444; font-weight:700; }
            @media (prefers-color-scheme:dark) {
              ._tt-bg    { fill:#1e293b; stroke:#334155; }
              ._tt-title { fill:#f1f5f9; }
              ._tt-label { fill:#94a3b8; }
              ._tt-val-pos { fill:#f1f5f9; }
            }
          `}</style>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const y = toY(v);
          if (y < PT - 2 || y > PT + plotH + 2) return null;
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y}
                strokeWidth={0.5} strokeDasharray={i > 0 ? "3 3" : undefined}
                style={{ stroke: "hsl(var(--border))", opacity: 0.5 }} />
              <text x={PL - 7} y={y} dy="0.35em" textAnchor="end" fontSize={9}
                style={{ fill: "hsl(var(--muted-foreground))", opacity: 0.75 }}>
                {formatCurrencyCompact(v)}
              </text>
            </g>
          );
        })}

        {/* Zero reference line */}
        {zeroY >= PT && zeroY <= PT + plotH && (
          <line x1={PL} y1={zeroY} x2={W - PR} y2={zeroY}
            strokeWidth={1} strokeDasharray="4 3"
            style={{ stroke: "hsl(var(--destructive))", opacity: 0.45 }} />
        )}

        {/* Area fills */}
        {pastPts.length > 1 && (
          <path className="_proj-area" d={areaD(pastPts)} fill="url(#proj-g-past)" />
        )}
        {futurePts.length > 1 && (
          <path className="_proj-area" d={areaD(futurePts)} fill="url(#proj-g-future)"
            style={{ animationDelay: "0.85s" }} />
        )}

        {/* Realized path — animated draw-in */}
        {pastPts.length > 1 && (
          <path className="_proj-past" d={smoothD(pastPts)} fill="none" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round"
            style={{ stroke: "hsl(var(--foreground))" }} />
        )}

        {/* Projected path — dashed, fade in */}
        {futurePts.length > 1 && (
          <path className="_proj-fut" d={smoothD(futurePts)} fill="none" strokeWidth={2}
            strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round"
            style={{ stroke: "hsl(var(--primary))" }} />
        )}

        {/* X-axis labels */}
        {pts.map((p, i) => {
          const isHigh = p.month === highlightMonth;
          const show = n <= 6 || i % 2 === 0 || isHigh || i === n - 1;
          if (!show) return null;
          return (
            <text key={`x-${p.month}`} x={p.x} y={H - 5} textAnchor="middle" fontSize={9}
              fontWeight={isHigh ? "700" : "400"}
              style={{ fill: isHigh ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
              {p.label.split(" ")[0].slice(0, 3)}
            </text>
          );
        })}

        {/* Pulsing ring on current month */}
        {curPt && (
          <circle className="_proj-ring" cx={curPt.x} cy={curPt.y} r={5.5}
            fill="none" strokeWidth={1.5}
            style={{ stroke: "hsl(var(--primary))" }} />
        )}

        {/* Dots — staggered fade-in */}
        {pts.map((p, i) => {
          const isHigh = p.month === highlightMonth;
          const isPast = p.month <= highlightMonth;
          return (
            <circle key={`dot-${p.month}`} cx={p.x} cy={p.y}
              r={isHigh ? 5 : 3.5} strokeWidth={isHigh ? 2.5 : 1.5}
              style={{
                fill: "hsl(var(--card))",
                stroke: isPast ? "hsl(var(--foreground))" : "hsl(var(--primary))",
                animation: `_proj-dot .3s ease ${0.95 + i * 0.06}s both`,
              }} />
          );
        })}

        {/* Hit areas + tooltips */}
        {pts.map((p) => {
          const bal = p.closingBalance;
          const isNeg = bal < 0;
          const ttW = 180, ttH = 60;
          const ttX = Math.min(Math.max(p.x - ttW / 2, PL), W - PR - ttW);
          const ttY = p.y - ttH - 16 < PT ? p.y + 16 : p.y - ttH - 16;
          return (
            <g key={`hit-${p.month}`} className="group/pt">
              <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
              <g className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover/pt:opacity-100">
                <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={8}
                  strokeWidth={1} className="_tt-bg"
                  style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.13))" }} />
                <text x={ttX + 12} y={ttY + 20} fontSize={10} className="_tt-title">
                  {p.label}
                </text>
                <text x={ttX + 12} y={ttY + 39} fontSize={9} className="_tt-label">
                  Saldo acumulado
                </text>
                <text x={ttX + ttW - 12} y={ttY + 39} fontSize={11}
                  textAnchor="end" className={isNeg ? "_tt-val-neg" : "_tt-val-pos"}>
                  {formatCurrency(bal)}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="block h-0.5 w-5 rounded-full bg-foreground" />
          Realizado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="block h-0.5 w-5 shrink-0 rounded-full" style={{
            backgroundImage: "repeating-linear-gradient(to right,hsl(var(--primary)) 0,hsl(var(--primary)) 5px,transparent 5px,transparent 9px)",
          }} />
          Projetado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="block h-0.5 w-5 rounded-full" style={{ background: "hsl(var(--destructive)/0.45)" }} />
          Zero
        </span>
      </div>
    </div>
  );
}

function SpendingHeatmap({ rows, suggested }: { rows: DayRow[]; suggested: number; month: string }) {
  const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  if (!rows?.length) return null;
  const firstWeekday = rows[0].weekday;
  const cells: (DayRow | null)[] = [...Array(firstWeekday).fill(null), ...rows];
  while (cells.length % 7 !== 0) cells.push(null);

  // Which dates are "active" for the detail strip
  const activeSet = selectedDates.size > 0 ? selectedDates : hoverDate ? new Set([hoverDate]) : new Set<string>();
  const activeRows = rows.filter((r) => activeSet.has(r.date));
  const isMulti = selectedDates.size > 1;

  const totalEntrada = activeRows.reduce((s, r) => s + r.entrada, 0);
  const totalSaida = activeRows.reduce((s, r) => s + r.saida, 0);
  const totalDiario = activeRows.reduce((s, r) => s + r.diario, 0);
  const allFuture = activeRows.length > 0 && activeRows.every((r) => r.isFuture);

  function cellColor(row: DayRow): string {
    if (row.isFuture || suggested <= 0) return "";
    const ratio = row.diario / suggested;
    if (ratio === 0) return "#14532d";
    if (ratio <= 0.25) return "#15803d";
    if (ratio <= 0.5) return "#16a34a";
    if (ratio <= 0.85) return "#22c55e";
    if (ratio <= 1) return "#86efac";
    if (ratio <= 1.15) return "#fca5a5";
    if (ratio <= 1.5) return "#dc2626";
    if (ratio <= 2) return "#b91c1c";
    if (ratio <= 3) return "#7f1d1d";
    return "#450a0a";
  }

  function handleClick(row: DayRow, e: React.MouseEvent) {
    const date = row.date;
    if (e.ctrlKey || e.metaKey) {
      setSelectedDates((prev) => {
        const next = new Set(prev);
        if (next.has(date)) next.delete(date);
        else next.add(date);
        return next;
      });
    } else {
      setSelectedDates((prev) => {
        if (prev.size === 1 && prev.has(date)) return new Set();
        return new Set([date]);
      });
    }
  }

  const stripVisible = activeRows.length > 0;

  return (
    <div
      className="mt-4 border-t pt-3"
      onMouseLeave={() => setHoverDate(null)}
    >
      <div
        className="mx-auto grid w-fit"
        style={{ gridTemplateColumns: "repeat(7, 1rem)", gap: "2px" }}
      >
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={`hd-${i}`} className="text-center text-[8px] leading-3 text-muted-foreground/50">
            {label}
          </div>
        ))}
        {cells.map((row, i) => {
          if (!row) return <div key={i} className="h-4 rounded-[3px]" />;
          const color = cellColor(row);
          const isNeutral = row.isFuture || suggested <= 0;
          const isActive = activeSet.has(row.date);
          const isSelected = selectedDates.has(row.date);
          const dimmed = activeSet.size > 0 && !isActive;
          return (
            <div
              key={i}
              className={cn(
                "h-4 rounded-[3px] cursor-pointer transition-opacity",
                row.isToday && "ring-1 ring-offset-[1px] ring-foreground/50",
                isNeutral && "bg-muted/50",
                isSelected && "ring-1 ring-white/70",
                dimmed && "opacity-40",
              )}
              style={!isNeutral ? { backgroundColor: color } : undefined}
              onMouseEnter={() => { if (selectedDates.size === 0) setHoverDate(row.date); }}
              onClick={(e) => handleClick(row, e)}
            />
          );
        })}
      </div>

      {/* Detail strip */}
      <div className={cn(
        "overflow-hidden transition-all",
        stripVisible ? "mt-2 max-h-40" : "max-h-0",
      )}>
        {stripVisible && (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-[11px] font-semibold">
              {isMulti
                ? `${selectedDates.size} dias selecionados`
                : formatDayLabel(activeRows[0].date)}
              {allFuture && !isMulti && (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">Previsão</span>
              )}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-x-3 text-[10px] text-muted-foreground">
              <div className="flex flex-col gap-0.5">
                <span>Entradas</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatCurrencyCompact(totalEntrada)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span>Saídas</span>
                <span className="font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                  -{formatCurrencyCompact(totalSaida)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span>Diário</span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatCurrencyCompact(totalDiario)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
