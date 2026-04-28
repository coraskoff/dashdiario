import type { FinanceDay, FinanceMonth, FinanceTransaction } from "./types";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}k`;
  }
  return currencyFormatter.format(value);
}

const monthLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthLabelFormatter.format(new Date(y, m - 1, 1));
}

const dayLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return dayLabelFormatter.format(new Date(y, m - 1, d));
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function datesOfMonth(month: string): string[] {
  const days = daysInMonth(month);
  const [y, m] = month.split("-");
  return Array.from({ length: days }, (_, i) => `${y}-${m}-${String(i + 1).padStart(2, "0")}`);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function suggestedDaily(variable: number, month: string): number {
  return variable / daysInMonth(month);
}

export interface DayRow {
  date: string;
  dayNumber: number;
  weekday: number; // 0..6
  entrada: number;
  saida: number;
  diario: number;
  saldo: number;
  prevSaldo: number;
  hasOverride: boolean;
  isFuture: boolean;
  isToday: boolean;
  transactions: FinanceTransaction[];
}

export function buildDayRows(
  month: string,
  openingBalance: number,
  monthConfig: FinanceMonth | undefined,
  days: FinanceDay[],
  transactions: FinanceTransaction[],
  referenceDate: string = todayIso(),
): { rows: DayRow[]; closingBalance: number } {
  const dates = datesOfMonth(month);
  const variable = monthConfig?.variable_amount ?? 0;
  const suggested = suggestedDaily(variable, month);
  const dayMap = new Map(days.map((d) => [d.date, d]));
  const txByDate = new Map<string, FinanceTransaction[]>();
  for (const t of transactions) {
    if (!txByDate.has(t.date)) txByDate.set(t.date, []);
    txByDate.get(t.date)!.push(t);
  }

  let saldo = openingBalance;
  const rows: DayRow[] = dates.map((date) => {
    const d = dayMap.get(date);
    const txs = txByDate.get(date) ?? [];
    const entrada = txs.filter((t) => t.kind === "entrada").reduce((s, t) => s + t.amount, 0);
    const saida = txs.filter((t) => t.kind === "saida").reduce((s, t) => s + t.amount, 0);
    const diario = d?.diario_override != null ? Number(d.diario_override) : suggested;
    const prevSaldo = saldo;
    saldo = saldo + entrada - saida - diario;
    const [y, m, dd] = date.split("-").map(Number);
    return {
      date,
      dayNumber: dd,
      weekday: new Date(y, m - 1, dd).getDay(),
      entrada,
      saida,
      diario,
      saldo,
      prevSaldo,
      hasOverride: d?.diario_override != null,
      isFuture: date > referenceDate,
      isToday: date === referenceDate,
      transactions: txs,
    };
  });

  return { rows, closingBalance: saldo };
}

export interface MonthSummary {
  totalEntrada: number;
  totalSaida: number;
  totalDiario: number;
  performance: number;
  closingBalance: number;
}

export function summarizeMonth(rows: DayRow[], openingBalance: number): MonthSummary {
  let totalEntrada = 0;
  let totalSaida = 0;
  let totalDiario = 0;
  for (const r of rows) {
    totalEntrada += r.entrada;
    totalSaida += r.saida;
    totalDiario += r.diario;
  }
  return {
    totalEntrada,
    totalSaida,
    totalDiario,
    performance: totalEntrada - totalSaida - totalDiario,
    closingBalance: openingBalance + totalEntrada - totalSaida - totalDiario,
  };
}

export interface MonthProjection {
  month: string;
  label: string;
  closingBalance: number;
  variable: number;
}

export function buildYearProjection(
  startMonth: string,
  startOpeningBalance: number,
  monthsConfig: FinanceMonth[],
  allDays: FinanceDay[],
  allTransactions: FinanceTransaction[],
): MonthProjection[] {
  const [year] = startMonth.split("-").map(Number);
  const result: MonthProjection[] = [];
  let opening = startOpeningBalance;
  let cursor = startMonth;
  while (true) {
    const [cy, cm] = cursor.split("-").map(Number);
    if (cy > year) break;
    const cfg = monthsConfig.find((c) => c.month === cursor);
    const monthDays = allDays.filter((d) => d.date.startsWith(cursor));
    const monthTx = allTransactions.filter((t) => t.date.startsWith(cursor));
    const { closingBalance } = buildDayRows(cursor, opening, cfg, monthDays, monthTx);
    result.push({
      month: cursor,
      label: formatMonthLabel(cursor),
      closingBalance,
      variable: cfg?.variable_amount ?? 0,
    });
    opening = closingBalance;
    if (cm === 12) break;
    cursor = shiftMonth(cursor, 1);
  }
  return result;
}
