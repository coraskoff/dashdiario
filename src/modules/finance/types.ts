export interface FinanceMonth {
  id: string;
  month: string; // YYYY-MM
  variable_amount: number;
}

export interface FinanceDay {
  id: string;
  date: string; // YYYY-MM-DD
  entrada: number;
  saida: number;
  diario_override: number | null;
  entrada_label: string | null;
  saida_label: string | null;
}

export interface FinanceMonthInput {
  month: string;
  variable_amount: number;
}

export interface FinanceDayInput {
  date: string;
  entrada?: number;
  saida?: number;
  diario_override?: number | null;
  entrada_label?: string | null;
  saida_label?: string | null;
}
