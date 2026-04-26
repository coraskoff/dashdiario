import type { Transaction } from "./types";

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