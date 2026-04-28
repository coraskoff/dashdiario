export interface FinanceMonth {
  id: string;
  month: string; // YYYY-MM
  variable_amount: number;
}

export interface FinanceDay {
  id: string;
  date: string; // YYYY-MM-DD
  diario_override: number | null;
}

export interface FinanceTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "entrada" | "saida";
  amount: number;
  label: string | null;
}

export interface FinanceMonthInput {
  month: string;
  variable_amount: number;
}

export interface FinanceDayDiarioInput {
  date: string;
  diario_override: number | null;
}

export interface FinanceTransactionInput {
  id?: string;
  date: string;
  kind: "entrada" | "saida";
  amount: number;
  label?: string | null;
}
