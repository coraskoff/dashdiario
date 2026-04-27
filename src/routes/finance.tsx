import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  createCategory,
  createTransaction,
  deleteCategory,
  deleteDailyExpense,
  deleteMonthlyPlan,
  deleteTransaction,
  fetchCategories,
  fetchDailyExpenses,
  fetchMonthlyPlans,
  fetchTransactions,
  upsertDailyExpense,
  upsertMonthlyPlan,
} from "@/modules/finance/api";
import type {
  Category,
  DailyExpense,
  FinancialType,
  MonthlyPlan,
  Transaction,
} from "@/modules/finance/types";
import {
  buildCategoryBreakdowns,
  buildMonthSummary,
  currentMonth,
  formatCurrency,
  formatDate,
  formatMonth,
  monthOf,
  shiftMonth,
  todayIso,
  type CategoryBreakdown,
} from "@/modules/finance/calculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Pulse } from "@/components/Pulse";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "Finanças — Dash" },
      {
        name: "description",
        content: "Planeje gastos mensais e acompanhe a execução real.",
      },
    ],
  }),
  component: FinancePage,
});

/* ============================================================
 * Page
 * ============================================================ */

function FinancePage() {
  const [month, setMonth] = useState<string>(currentMonth());
  const [tab, setTab] = useState<"overview" | "categories">("overview");
  const [quickAdd, setQuickAdd] = useState<null | "income" | "expense">(null);
  const [variablesOpen, setVariablesOpen] = useState(false);

  const qcRoot = useQueryClient();

  const createTx = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      qcRoot.invalidateQueries({ queryKey: ["fin", "transactions"] });
      setQuickAdd(null);
      toast.success("Lançamento adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cats = useQuery({ queryKey: ["fin", "categories"], queryFn: fetchCategories });
  const tx = useQuery({ queryKey: ["fin", "transactions"], queryFn: fetchTransactions });
  const plans = useQuery({
    queryKey: ["fin", "plans", month],
    queryFn: () => fetchMonthlyPlans(month),
  });
  const daily = useQuery({
    queryKey: ["fin", "daily", month],
    queryFn: () => fetchDailyExpenses(month),
  });

  const categories = cats.data ?? [];
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const transactions = tx.data ?? [];
  const monthPlans = plans.data ?? [];
  const monthExpenses = daily.data ?? [];

  const breakdowns = useMemo(
    () =>
      buildCategoryBreakdowns(
        month,
        monthPlans,
        monthExpenses,
        expenseCategories.map((c) => c.id),
      ),
    [month, monthPlans, monthExpenses, expenseCategories],
  );

  const monthTransactions = useMemo(
    () => transactions.filter((t) => monthOf(t.occurred_at) === month),
    [transactions, month],
  );

  const summary = buildMonthSummary(month, monthTransactions, breakdowns);

  const loading = cats.isLoading || plans.isLoading || daily.isLoading || tx.isLoading;

  // Swipe entre abas no mobile
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0 && tab === "overview") setTab("categories");
    if (dx > 0 && tab === "categories") setTab("overview");
  }

  return (
    <div className="space-y-12 pb-16">
      {/* ---------- Header ---------- */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Finanças
          </p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">
            {capitalize(formatMonth(month))}
          </h1>
        </div>
        <MonthSwitcher month={month} onChange={setMonth} />
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Pulse />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "overview" | "categories")}>
          <TabsList className="h-10 w-full justify-start gap-1 rounded-full bg-secondary/60 p-1 md:w-auto">
            <TabsTrigger value="overview" className="flex-1 rounded-full px-4 md:flex-none">
              Visão geral
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex-1 rounded-full px-4 md:flex-none">
              Por categoria
            </TabsTrigger>
          </TabsList>

          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <TabsContent value="overview" className="mt-8 space-y-12">
              <MetricsBar
                income={summary.income}
                expenseTotal={summary.expenseTotal}
                plannedVariables={summary.planned}
                currentVariables={summary.projected}
                plannedDaily={summary.plannedDailyTotal}
                currentDaily={summary.currentDailyTotal}
                onAddIncome={() => setQuickAdd("income")}
                onAddExpense={() => setQuickAdd("expense")}
                onAddVariable={() => setVariablesOpen(true)}
              />

              <DailyEntrySection
                month={month}
                categories={expenseCategories}
                expenses={monthExpenses}
              />

              <TransactionsSection
                month={month}
                categories={categories}
                transactions={monthTransactions}
              />
            </TabsContent>

            <TabsContent value="categories" className="mt-8">
              <PlanSection
                month={month}
                categories={expenseCategories}
                breakdowns={breakdowns}
                allCategories={categories}
              />
            </TabsContent>
          </div>

          {/* Quick add modals via "+" nas métricas */}
          <Dialog open={quickAdd !== null} onOpenChange={(o) => !o && setQuickAdd(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {quickAdd === "income" ? "Nova entrada" : "Nova saída"}
                </DialogTitle>
                <DialogDescription>
                  {quickAdd === "income"
                    ? "Salário, freela, reembolso — o que entrou."
                    : "Despesa pontual fora do plano mensal."}
                </DialogDescription>
              </DialogHeader>
              {quickAdd && (
                <QuickTransactionForm
                  month={month}
                  categories={categories}
                  initialType={quickAdd}
                  onSubmit={(input) => createTx.mutate(input)}
                  onCancel={() => setQuickAdd(null)}
                  pending={createTx.isPending}
                  hideTypeToggle
                />
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={variablesOpen} onOpenChange={setVariablesOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Definir teto de variáveis</DialogTitle>
                <DialogDescription>
                  Ajuste rápido por categoria. Mais detalhes na aba Por categoria.
                </DialogDescription>
              </DialogHeader>
              <VariablesQuickEdit
                month={month}
                categories={expenseCategories}
                breakdowns={breakdowns}
                onClose={() => setVariablesOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </Tabs>
      )}
    </div>
  );
}

/* ============================================================
 * Month switcher
 * ============================================================ */

function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const isCurrent = month === currentMonth();
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-sm">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Mês anterior"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onChange(currentMonth())}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          isCurrent
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Hoje
      </button>
      <button
        onClick={() => onChange(shiftMonth(month, +1))}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Próximo mês"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ============================================================
 * Metrics bar
 * Four blocks aligned in a single horizontal row:
 *   Entradas | Saídas | Variáveis (prévia ↔ atual) | Média diária (prévia ↔ atual)
 * The "atual" value is the headline; the "prévia" sits below as context with a
 * small delta. Subtractive design — no cards, just rhythm and dividers.
 * ============================================================ */

function MetricsBar({
  income,
  expenseTotal,
  plannedVariables,
  currentVariables,
  plannedDaily,
  currentDaily,
  onAddIncome,
  onAddExpense,
  onAddVariable,
}: {
  income: number;
  expenseTotal: number;
  plannedVariables: number;
  currentVariables: number;
  plannedDaily: number;
  currentDaily: number;
  onAddIncome: () => void;
  onAddExpense: () => void;
  onAddVariable: () => void;
}) {
  return (
    <section className="grid grid-cols-2 gap-x-2 gap-y-6 rounded-2xl border border-border bg-card p-6 md:grid-cols-4 md:gap-x-0 md:divide-x md:divide-border md:p-0">
      <Metric
        label="Entradas"
        value={income}
        tone="income"
        onAdd={onAddIncome}
        className="md:px-6 md:py-6"
      />
      <Metric
        label="Saídas"
        value={expenseTotal}
        tone="expense"
        prefix="−"
        onAdd={onAddExpense}
        className="md:px-6 md:py-6"
      />
      <PairedMetric
        label="Variáveis"
        previa={plannedVariables}
        atual={currentVariables}
        invert
        onAdd={onAddVariable}
        className="md:px-6 md:py-6"
      />
      <PairedMetric
        label="Média diária"
        previa={plannedDaily}
        atual={currentDaily}
        className="md:px-6 md:py-6"
      />
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
  prefix,
  onAdd,
  className,
}: {
  label: string;
  value: number;
  tone?: "income" | "expense";
  prefix?: string;
  onAdd?: () => void;
  className?: string;
}) {
  const color =
    tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "text-foreground";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        {onAdd && <AddButton onClick={onAdd} label={`Adicionar ${label.toLowerCase()}`} />}
      </div>
      <p className={cn("mt-2 truncate text-2xl font-semibold tabular-nums", color)}>
        {prefix}
        {formatCurrency(value)}
      </p>
      {/* keep vertical rhythm aligned with PairedMetric */}
      <p className="mt-1 h-4 text-[11px] text-muted-foreground" aria-hidden />
    </div>
  );
}

/**
 * Shows "atual" big with "prévia" small underneath.
 * If `invert` is true, going OVER the prévia is bad (red); otherwise UNDER is good
 * (less spending = green for "Média diária"; more leftover = green for "Variáveis").
 * For both metrics here, "atual < prévia" means under budget → green.
 */
function PairedMetric({
  label,
  previa,
  atual,
  invert,
  onAdd,
  className,
}: {
  label: string;
  previa: number;
  atual: number;
  /** present for API symmetry; both metrics treat atual<prévia as positive */
  invert?: boolean;
  onAdd?: () => void;
  className?: string;
}) {
  void invert;
  const delta = atual - previa;
  const hasPlan = previa > 0;
  const isOver = delta > 0.005;
  const isUnder = delta < -0.005;
  const color = !hasPlan
    ? "text-foreground"
    : isOver
      ? "text-expense"
      : isUnder
        ? "text-income"
        : "text-foreground";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        {onAdd && <AddButton onClick={onAdd} label={`Definir ${label.toLowerCase()}`} />}
      </div>
      <p className={cn("mt-2 truncate text-2xl font-semibold tabular-nums", color)}>
        {formatCurrency(atual)}
      </p>
      <p className="mt-1 h-4 truncate text-[11px] text-muted-foreground tabular-nums">
        {hasPlan ? (
          <>
            prévia {formatCurrency(previa)}
            {(isOver || isUnder) && (
              <span className={cn("ml-1.5", isOver ? "text-expense" : "text-income")}>
                {isOver ? "↑" : "↓"} {formatCurrency(Math.abs(delta))}
              </span>
            )}
          </>
        ) : (
          "sem planejamento"
        )}
      </p>
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground hover:bg-secondary hover:text-foreground"
    >
      <Plus className="h-3 w-3" />
    </button>
  );
}

/* ============================================================
 * Plan section — categories with planned vs realized
 * Each row is a horizontal "ledger line": progress bar + numbers.
 * ============================================================ */

function PlanSection({
  month,
  categories,
  breakdowns,
  allCategories,
}: {
  month: string;
  categories: Category[];
  breakdowns: CategoryBreakdown[];
  allCategories: Category[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);

  const setPlan = useMutation({
    mutationFn: upsertMonthlyPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin", "plans", month] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Planejamento"
        title="Categorias do mês"
        description="Defina o teto de cada categoria. A média diária é calculada automaticamente."
        action={
          <NewCategoryButton type="expense" allCategories={allCategories} />
        }
      />

      {categories.length === 0 ? (
        <EmptyHint
          message="Nenhuma categoria de despesa ainda."
          hint="Crie uma para começar a planejar."
        />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {categories.map((cat, i) => {
            const b = breakdowns.find((x) => x.category_id === cat.id);
            return (
              <li
                key={cat.id}
                className={cn(
                  "px-5 py-4 transition-colors hover:bg-secondary/30",
                  i > 0 && "border-t border-border",
                )}
              >
                <PlanRow
                  category={cat}
                  breakdown={b}
                  editing={editing === cat.id}
                  onEdit={() => setEditing(cat.id)}
                  onCancel={() => setEditing(null)}
                  onSave={(planned_amount) =>
                    setPlan.mutate({ category_id: cat.id, month, planned_amount })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PlanRow({
  category,
  breakdown,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  category: Category;
  breakdown: CategoryBreakdown | undefined;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (amount: number) => void;
}) {
  const planned = breakdown?.planned ?? 0;
  const realized = breakdown?.realized ?? 0;
  const ratio = planned > 0 ? Math.min(realized / planned, 1.5) : 0;
  const overshoot = ratio > 1;

  const [draft, setDraft] = useState<string>(planned > 0 ? String(planned) : "");

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center">
      {/* Left: name + daily averages (prévia ↔ agora) */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{category.name}</p>
        {planned > 0 && breakdown ? (
          (() => {
            const previa = breakdown.plannedDaily;
            const agora = breakdown.currentDaily;
            const diff = agora - previa;
            const isOver = diff > 0.005;
            const isUnder = diff < -0.005;
            return (
              <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                prévia {formatCurrency(previa)}/dia
                <span
                  className={cn(
                    "ml-1.5",
                    isOver ? "text-expense" : isUnder ? "text-income" : "",
                  )}
                >
                  · agora {formatCurrency(agora)}/dia
                </span>
              </p>
            );
          })()
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground">sem planejamento</p>
        )}
      </div>

      {/* Middle: progress bar with values */}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between text-xs tabular-nums">
          <span className={cn("font-semibold", overshoot ? "text-expense" : "text-foreground")}>
            {formatCurrency(realized)}
          </span>
          <span className="text-muted-foreground">
            de {planned > 0 ? formatCurrency(planned) : "—"}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full transition-[width] duration-500",
              overshoot ? "bg-expense" : "bg-foreground",
            )}
            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
          />
          {overshoot && (
            <div
              className="-mt-1.5 h-1.5 bg-expense/40"
              style={{ width: `${Math.min((ratio - 1) * 100, 50)}%` }}
            />
          )}
        </div>
      </div>

      {/* Right: action */}
      <div className="flex justify-end">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(draft.replace(",", "."));
              if (!Number.isFinite(v) || v < 0) {
                toast.error("Valor inválido.");
                return;
              }
              onSave(v);
            }}
            className="flex items-center gap-1"
          >
            <Input
              autoFocus
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 w-28 text-right text-sm"
              placeholder="0,00"
            />
            <button
              type="submit"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Salvar"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        ) : (
          <button
            onClick={onEdit}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {planned > 0 ? "Ajustar" : "Definir teto"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Daily entry — record real expenses for a day
 * ============================================================ */

function DailyEntrySection({
  month,
  categories,
  expenses,
}: {
  month: string;
  categories: Category[];
  expenses: DailyExpense[];
}) {
  const qc = useQueryClient();
  const today = todayIso();
  const defaultDate = monthOf(today) === month ? today : `${month}-01`;

  const [date, setDate] = useState<string>(defaultDate);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const save = useMutation({
    mutationFn: upsertDailyExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin", "daily", month] });
      setAmount("");
      toast.success("Gasto registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteDailyExpense,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin", "daily", month] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(amount.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!categoryId) {
      toast.error("Selecione uma categoria.");
      return;
    }
    save.mutate({ category_id: categoryId, date, amount: v });
  }

  // Group expenses by date desc
  const grouped = useMemo(() => {
    const map = new Map<string, DailyExpense[]>();
    for (const e of expenses) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [expenses]);

  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Execução"
        title="Gastos do dia"
        description="Registre o valor real de cada categoria. Dias sem registro usam a média planejada."
      />

      <form
        onSubmit={submit}
        className="grid gap-2 rounded-2xl border border-border bg-card p-4 md:grid-cols-[140px_minmax(0,1fr)_140px_auto]"
      >
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10"
        />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-10 text-right tabular-nums"
        />
        <Button type="submit" disabled={save.isPending} className="h-10">
          <Plus className="mr-1 h-4 w-4" /> Registrar
        </Button>
      </form>

      {grouped.length === 0 ? (
        <EmptyHint
          message="Nenhum gasto registrado neste mês."
          hint="Adicione um para começar a substituir a previsão."
        />
      ) : (
        <ul className="space-y-3">
          {grouped.map(([day, items]) => {
            const total = items.reduce((a, e) => a + Number(e.amount), 0);
            return (
              <li key={day} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-baseline justify-between border-b border-border px-4 py-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {formatDate(day)}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-expense">
                    {formatCurrency(total)}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {items.map((e) => {
                    const cat = categories.find((c) => c.id === e.category_id);
                    return (
                      <li
                        key={e.id}
                        className="group flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30"
                      >
                        <span className="text-sm">{cat?.name ?? "—"}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm tabular-nums">
                            {formatCurrency(Number(e.amount))}
                          </span>
                          <button
                            onClick={() => remove.mutate(e.id)}
                            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ============================================================
 * Transactions section — entradas e saídas avulsas (one-off)
 * Useful for income (salário) and lump-sum expenses.
 * ============================================================ */

function TransactionsSection({
  month,
  categories,
  transactions,
}: {
  month: string;
  categories: Category[];
  transactions: Transaction[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin", "transactions"] });
      setOpen(false);
      toast.success("Lançamento adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin", "transactions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Movimentações"
        title="Entradas e saídas avulsas"
        description="Registre salários, recebimentos e despesas pontuais que não entram no plano."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="h-8 rounded-full"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Novo lançamento
          </Button>
        }
      />

      {open && (
        <QuickTransactionForm
          month={month}
          categories={categories}
          onSubmit={(input) => create.mutate(input)}
          onCancel={() => setOpen(false)}
          pending={create.isPending}
        />
      )}

      {transactions.length === 0 ? (
        <EmptyHint
          message="Sem lançamentos avulsos neste mês."
          hint="Use para salário, freelas e despesas únicas."
        />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {transactions.map((t, i) => {
            const isIncome = t.type === "income";
            const cat = categories.find((c) => c.id === t.category_id);
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/30",
                  i > 0 && "border-t border-border",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    isIncome ? "bg-income/10 text-income" : "bg-expense/10 text-expense",
                  )}
                >
                  {isIncome ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.description || cat?.name || (isIncome ? "Receita" : "Despesa")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cat?.name ?? "Sem categoria"} · {formatDate(t.occurred_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    isIncome ? "text-income" : "text-expense",
                  )}
                >
                  {isIncome ? "+" : "−"} {formatCurrency(Number(t.amount))}
                </span>
                <button
                  onClick={() => remove.mutate(t.id)}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function QuickTransactionForm({
  month,
  categories,
  onSubmit,
  onCancel,
  pending,
}: {
  month: string;
  categories: Category[];
  onSubmit: (input: {
    type: FinancialType;
    amount: number;
    category_id: string | null;
    occurred_at: string;
    description?: string | null;
  }) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [type, setType] = useState<FinancialType>("income");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const today = todayIso();
  const [date, setDate] = useState(monthOf(today) === month ? today : `${month}-01`);
  const [description, setDescription] = useState("");

  const filtered = categories.filter((c) => c.type === type);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(amount.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      toast.error("Valor inválido.");
      return;
    }
    onSubmit({
      type,
      amount: v,
      category_id: categoryId || null,
      occurred_at: date,
      description: description.trim() || null,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-border bg-secondary/40 p-0.5 text-xs">
          {(["income", "expense"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setCategoryId("");
              }}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                type === t
                  ? t === "income"
                    ? "bg-card text-income shadow-sm"
                    : "bg-card text-expense shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "income" ? "Entrada" : "Saída"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            Adicionar
          </Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_140px]">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10"
        />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Categoria (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {filtered.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-10 text-right tabular-nums"
        />
      </div>
      <Input
        placeholder="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="h-10"
      />
    </form>
  );
}

/* ============================================================
 * New category popover
 * ============================================================ */

function NewCategoryButton({
  type,
  allCategories,
}: {
  type: FinancialType;
  allCategories: Category[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin", "categories"] });
      setName("");
      setOpen(false);
      toast.success("Categoria criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin", "categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = allCategories.filter((c) => c.type === type);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-full">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Categoria
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate({ name, type });
          }}
          className="flex gap-2"
        >
          <Input
            autoFocus
            placeholder="Nova categoria"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={create.isPending}>
            <Check className="h-4 w-4" />
          </Button>
        </form>
        {filtered.length > 0 && (
          <ul className="mt-3 space-y-1">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
              >
                <span>{c.name}</span>
                <button
                  onClick={() => remove.mutate(c.id)}
                  className="rounded-md p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  aria-label="Remover"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
 * Shared bits
 * ============================================================ */

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyHint({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      <p className="text-sm text-foreground">{message}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}