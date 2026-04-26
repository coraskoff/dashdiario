export type FinancialType = "income" | "expense";

export interface Category {
  id: string;
  name: string;
  type: FinancialType;
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