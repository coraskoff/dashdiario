import { supabase } from "@/integrations/supabase/client";
import type {
  Category,
  DailyExpense,
  DailyExpenseInput,
  MonthlyPlan,
  MonthlyPlanInput,
  Transaction,
  TransactionInput,
} from "./types";
import { isValidAmount } from "./calculations";

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

function assertValidTransaction(input: TransactionInput) {
  if (!isValidAmount(input.amount)) {
    throw new Error("Informe um valor maior que zero.");
  }
  if (input.type !== "income" && input.type !== "expense") {
    throw new Error("Tipo inválido.");
  }
  if (!input.occurred_at) {
    throw new Error("Informe uma data válida.");
  }
}

export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  assertValidTransaction(input);
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      type: input.type,
      amount: input.amount,
      category_id: input.category_id,
      occurred_at: input.occurred_at,
      description: input.description ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Transaction;
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<Transaction> {
  assertValidTransaction(input);
  const { data, error } = await supabase
    .from("transactions")
    .update({
      type: input.type,
      amount: input.amount,
      category_id: input.category_id,
      occurred_at: input.occurred_at,
      description: input.description ?? null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------- Categories ------------------------- */

export async function createCategory(
  input: { name: string; type: "income" | "expense" },
): Promise<Category> {
  const name = input.name.trim();
  if (!name) throw new Error("Informe um nome para a categoria.");
  const { data, error } = await supabase
    .from("categories")
    .insert({ name, type: input.type })
    .select()
    .single();
  if (error) throw error;
  return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------- Monthly plans ------------------------- */

export async function fetchMonthlyPlans(month?: string): Promise<MonthlyPlan[]> {
  let q = supabase.from("monthly_plans").select("*");
  if (month) q = q.eq("month", month);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MonthlyPlan[];
}

/** Upsert plan: one row per (category_id, month). */
export async function upsertMonthlyPlan(input: MonthlyPlanInput): Promise<MonthlyPlan> {
  if (!Number.isFinite(input.planned_amount) || input.planned_amount < 0) {
    throw new Error("Valor planejado inválido.");
  }
  if (!input.category_id) throw new Error("Selecione uma categoria.");
  const { data, error } = await supabase
    .from("monthly_plans")
    .upsert(
      {
        category_id: input.category_id,
        month: input.month,
        planned_amount: input.planned_amount,
      },
      { onConflict: "category_id,month" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as MonthlyPlan;
}

export async function deleteMonthlyPlan(id: string): Promise<void> {
  const { error } = await supabase.from("monthly_plans").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------- Daily expenses ------------------------- */

export async function fetchDailyExpenses(month?: string): Promise<DailyExpense[]> {
  let q = supabase.from("daily_expenses").select("*").order("date", { ascending: false });
  if (month) {
    q = q.gte("date", `${month}-01`).lte("date", `${month}-31`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DailyExpense[];
}

/** Upsert daily expense: one row per (category_id, date). */
export async function upsertDailyExpense(input: DailyExpenseInput): Promise<DailyExpense> {
  if (!isValidAmount(input.amount)) throw new Error("Informe um valor maior que zero.");
  if (!input.category_id) throw new Error("Selecione uma categoria.");
  if (!input.date) throw new Error("Informe uma data.");
  const { data, error } = await supabase
    .from("daily_expenses")
    .upsert(
      {
        category_id: input.category_id,
        date: input.date,
        amount: input.amount,
      },
      { onConflict: "category_id,date" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as DailyExpense;
}

export async function deleteDailyExpense(id: string): Promise<void> {
  const { error } = await supabase.from("daily_expenses").delete().eq("id", id);
  if (error) throw error;
}