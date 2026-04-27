export type FinancialType = "income" | "expense";

export interface Category {
  id: string;
  name: string;
  type: FinancialType;
  /** Para despesas: true = variável (dia-a-dia), false = fixa (recorrente). Ignorado para receitas. */
  is_variable: boolean;
}

export interface Transaction {
  id: string;
  type: FinancialType;
  amount: number;
  category_id: string | null;
  occurred_at: string; // ISO date (yyyy-mm-dd)
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionInput {
  type: FinancialType;
  amount: number;
  category_id: string | null;
  occurred_at: string;
  description?: string | null;
}

/** Planejamento mensal de uma categoria de despesa. */
export interface MonthlyPlan {
  id: string;
  category_id: string;
  month: string; // YYYY-MM
  planned_amount: number;
}

export interface MonthlyPlanInput {
  category_id: string;
  month: string;
  planned_amount: number;
}

/** Registro real de gasto por categoria em um dia específico. */
export interface DailyExpense {
  id: string;
  category_id: string;
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface DailyExpenseInput {
  category_id: string;
  date: string;
  amount: number;
}