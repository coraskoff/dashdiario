import type { DailyExpense, MonthlyPlan, Transaction } from "./types";

export interface FinanceSummary {
  income: number;
  expense: number;
  balance: number;
}

/** Calculate totals from a list of transactions. Pure, easy to test. */
export function calculateSummary(transactions: Transaction[]): FinanceSummary {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === "income") income += Number(t.amount);
    else expense += Number(t.amount);
  }
  return { income, expense, balance: income - expense };
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string): string {
  // Treat yyyy-mm-dd as local date
  const [y, m, d] = iso.split("-").map(Number);
  return dateFormatter.format(new Date(y, (m ?? 1) - 1, d ?? 1));
}

/** Validate amount: positive finite number with up to 2 decimals. */
export function isValidAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/* ----------------------- Month helpers ----------------------- */

/** Current month in YYYY-MM. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Number of days in a YYYY-MM month. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** All ISO dates (YYYY-MM-DD) inside a YYYY-MM month. */
export function datesOfMonth(month: string): string[] {
  const days = daysInMonth(month);
  const [y, m] = month.split("-");
  return Array.from({ length: days }, (_, i) => `${y}-${m}-${String(i + 1).padStart(2, "0")}`);
}

/** Month label like "abril 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/* ----------------------- Aggregations ----------------------- */

/** Per-category breakdown for a given month: planned vs realized. */
export interface CategoryBreakdown {
  category_id: string;
  planned: number;
  realized: number;
  /** planned daily average (planned / days_in_month). 0 if no plan. */
  plannedDaily: number;
  /** realized daily average over elapsed days in the period. */
  realizedDaily: number;
  /** dynamic remaining daily average — redistributes leftover budget across remaining days. */
  currentDaily: number;
  /** hybrid effective spend up to (but not including) referenceDate: real where recorded, planned daily otherwise. */
  hybridSpentBeforeToday: number;
  /** projected total: realized so far + plannedDaily * remaining days. */
  projected: number;
}

/**
 * Hybrid value for a single day in a category:
 *   - if a real expense is recorded for that day -> real value
 *   - otherwise -> planned daily average
 */
export function hybridDailyValue(
  date: string,
  categoryId: string,
  expenses: DailyExpense[],
  plannedDaily: number,
): number {
  const real = expenses.find((e) => e.date === date && e.category_id === categoryId);
  return real ? Number(real.amount) : plannedDaily;
}

/** Sum of real expenses in [from, to] inclusive for one category. */
function sumRealized(expenses: DailyExpense[], categoryId: string, month: string): number {
  return expenses
    .filter((e) => e.category_id === categoryId && monthOf(e.date) === month)
    .reduce((acc, e) => acc + Number(e.amount), 0);
}

/** Today's ISO date (local). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Compute breakdown per category for a given month.
 * `referenceDate` is the "today" used to split elapsed vs remaining days
 * (defaults to actual today; clamped to the month).
 */
export function buildCategoryBreakdowns(
  month: string,
  plans: MonthlyPlan[],
  expenses: DailyExpense[],
  categoryIds: string[],
  referenceDate: string = todayIso(),
): CategoryBreakdown[] {
  const totalDays = daysInMonth(month);
  const refMonth = monthOf(referenceDate);
  let elapsedDays: number;
  if (refMonth < month) elapsedDays = 0;
  else if (refMonth > month) elapsedDays = totalDays;
  else elapsedDays = Math.min(totalDays, Number(referenceDate.slice(8, 10)));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  // Days remaining INCLUDING today (today's budget is still re-allocatable).
  const remainingIncludingToday = refMonth === month ? remainingDays + 1 : remainingDays;
  // Days strictly before today.
  const daysBeforeToday = Math.max(0, elapsedDays - (refMonth === month ? 1 : 0));

  return categoryIds.map((category_id) => {
    const plan = plans.find((p) => p.category_id === category_id && p.month === month);
    const planned = plan ? Number(plan.planned_amount) : 0;
    const plannedDaily = planned / totalDays;
    const realized = sumRealized(expenses, category_id, month);
    const realizedDaily = elapsedDays > 0 ? realized / elapsedDays : 0;

    // Hybrid: for each day strictly before today, use real value if recorded, else plannedDaily.
    let hybridSpentBeforeToday = 0;
    if (refMonth === month) {
      const refDay = Number(referenceDate.slice(8, 10));
      const [y, m] = month.split("-");
      for (let d = 1; d < refDay; d++) {
        const iso = `${y}-${m}-${String(d).padStart(2, "0")}`;
        const real = expenses.find((e) => e.date === iso && e.category_id === category_id);
        hybridSpentBeforeToday += real ? Number(real.amount) : plannedDaily;
      }
    } else if (refMonth > month) {
      hybridSpentBeforeToday = realized; // closed month
    }

    let currentDaily: number;
    if (refMonth < month) {
      currentDaily = plannedDaily;
    } else if (refMonth > month || remainingIncludingToday === 0) {
      currentDaily = 0;
    } else {
      currentDaily = Math.max(0, (planned - hybridSpentBeforeToday) / remainingIncludingToday);
    }

    // Projected total (= "Variáveis atual"): hybrid spend so far + currentDaily across remaining days inc. today.
    const projected =
      refMonth < month
        ? planned
        : refMonth > month
          ? realized
          : hybridSpentBeforeToday + currentDaily * remainingIncludingToday;

    return {
      category_id,
      planned,
      realized,
      plannedDaily,
      realizedDaily,
      currentDaily,
      hybridSpentBeforeToday,
      projected,
    };
  });
}

export interface MonthSummary {
  income: number;
  expense: number;
  balance: number;
  planned: number;
  realized: number;
  projected: number;
  /** Sum of plannedDaily across all categories. */
  plannedDailyTotal: number;
  /** Sum of currentDaily across all categories — the dynamic redistributed daily budget. */
  currentDailyTotal: number;
  /** Total expense outflow: variable realized + one-off expense transactions. */
  expenseTotal: number;
}

/** Consolidated month summary using transactions + plans + daily expenses. */
export function buildMonthSummary(
  month: string,
  transactions: Transaction[],
  breakdowns: CategoryBreakdown[],
): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (monthOf(t.occurred_at) !== month) continue;
    if (t.type === "income") income += Number(t.amount);
    else expense += Number(t.amount);
  }
  const planned = breakdowns.reduce((a, b) => a + b.planned, 0);
  const realized = breakdowns.reduce((a, b) => a + b.realized, 0);
  const projected = breakdowns.reduce((a, b) => a + b.projected, 0);
  const plannedDailyTotal = breakdowns.reduce((a, b) => a + b.plannedDaily, 0);
  const currentDailyTotal = breakdowns.reduce((a, b) => a + b.currentDaily, 0);
  const expenseTotal = realized + expense;
  return {
    income,
    expense,
    balance: income - expense,
    planned,
    realized,
    projected,
    plannedDailyTotal,
    currentDailyTotal,
    expenseTotal,
  };
}