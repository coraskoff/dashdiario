import { supabase } from "@/integrations/supabase/client";
import type {
  FinanceDay,
  FinanceDayDiarioInput,
  FinanceMonth,
  FinanceMonthInput,
  FinanceTransaction,
  FinanceTransactionInput,
} from "./types";

export async function fetchAllMonths(): Promise<FinanceMonth[]> {
  const { data, error } = await supabase
    .from("finance_months")
    .select("id, month, variable_amount")
    .order("month");
  if (error) throw error;
  return (data ?? []) as FinanceMonth[];
}

export async function fetchAllDays(): Promise<FinanceDay[]> {
  const { data, error } = await supabase
    .from("finance_days")
    .select("id, date, diario_override")
    .order("date");
  if (error) throw error;
  return (data ?? []) as FinanceDay[];
}

export async function fetchAllTransactions(): Promise<FinanceTransaction[]> {
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("id, date, kind, amount, label, recurring_group_id")
    .order("date")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...d,
    amount: Number(d.amount),
    recurring_group_id: d.recurring_group_id ?? null,
  })) as FinanceTransaction[];
}

export async function upsertMonth(input: FinanceMonthInput): Promise<FinanceMonth> {
  if (!Number.isFinite(input.variable_amount) || input.variable_amount < 0) {
    throw new Error("Valor inválido.");
  }
  const { data, error } = await supabase
    .from("finance_months")
    .upsert(
      { month: input.month, variable_amount: input.variable_amount },
      { onConflict: "month" },
    )
    .select("id, month, variable_amount")
    .single();
  if (error) throw error;
  return data as FinanceMonth;
}

export async function upsertDayDiario(input: FinanceDayDiarioInput): Promise<FinanceDay> {
  const { data, error } = await supabase
    .from("finance_days")
    .upsert(
      { date: input.date, diario_override: input.diario_override, entrada: 0, saida: 0 },
      { onConflict: "date" },
    )
    .select("id, date, diario_override")
    .single();
  if (error) throw error;
  return data as FinanceDay;
}

export async function upsertTransaction(
  input: FinanceTransactionInput,
): Promise<FinanceTransaction> {
  if (!input.date) throw new Error("Data inválida.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Valor deve ser maior que zero.");
  }
  if (input.id) {
    const { data, error } = await supabase
      .from("finance_transactions")
      .update({
        date: input.date,
        kind: input.kind,
        amount: input.amount,
        label: input.label ?? null,
        recurring_group_id: input.recurring_group_id ?? null,
      })
      .eq("id", input.id)
      .select("id, date, kind, amount, label, recurring_group_id")
      .single();
    if (error) throw error;
    return { ...data, amount: Number(data.amount) } as FinanceTransaction;
  }
  const { data, error } = await supabase
    .from("finance_transactions")
    .insert({
      date: input.date,
      kind: input.kind,
      amount: input.amount,
      label: input.label ?? null,
      recurring_group_id: input.recurring_group_id ?? null,
    })
    .select("id, date, kind, amount, label, recurring_group_id")
    .single();
  if (error) throw error;
  return { ...data, amount: Number(data.amount) } as FinanceTransaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("finance_transactions").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteRecurringFromDate(
  groupId: string,
  fromDate: string,
): Promise<void> {
  const { error } = await supabase
    .from("finance_transactions")
    .delete()
    .eq("recurring_group_id", groupId)
    .gte("date", fromDate);
  if (error) throw error;
}

export async function deleteAllRecurring(groupId: string): Promise<void> {
  const { error } = await supabase
    .from("finance_transactions")
    .delete()
    .eq("recurring_group_id", groupId);
  if (error) throw error;
}

export async function updateRecurringFromDate(
  groupId: string,
  fromDate: string,
  patch: { amount?: number; label?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("finance_transactions")
    .update(patch)
    .eq("recurring_group_id", groupId)
    .gte("date", fromDate);
  if (error) throw error;
}

export async function updateAllRecurring(
  groupId: string,
  patch: { amount?: number; label?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("finance_transactions")
    .update(patch)
    .eq("recurring_group_id", groupId);
  if (error) throw error;
}
