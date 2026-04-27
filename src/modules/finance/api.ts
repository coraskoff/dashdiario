import { supabase } from "@/integrations/supabase/client";
import type {
  FinanceDay,
  FinanceDayInput,
  FinanceMonth,
  FinanceMonthInput,
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
    .select("id, date, entrada, saida, diario_override, entrada_label, saida_label")
    .order("date");
  if (error) throw error;
  return (data ?? []) as FinanceDay[];
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

export async function upsertDay(input: FinanceDayInput): Promise<FinanceDay> {
  if (!input.date) throw new Error("Data inválida.");
  // Read existing first so partial updates preserve unset fields.
  const { data: existing } = await supabase
    .from("finance_days")
    .select("id, date, entrada, saida, diario_override, entrada_label, saida_label")
    .eq("date", input.date)
    .maybeSingle();

  const merged = {
    date: input.date,
    entrada: input.entrada ?? existing?.entrada ?? 0,
    saida: input.saida ?? existing?.saida ?? 0,
    diario_override:
      input.diario_override !== undefined
        ? input.diario_override
        : existing?.diario_override ?? null,
    entrada_label:
      input.entrada_label !== undefined ? input.entrada_label : existing?.entrada_label ?? null,
    saida_label:
      input.saida_label !== undefined ? input.saida_label : existing?.saida_label ?? null,
  };

  const { data, error } = await supabase
    .from("finance_days")
    .upsert(merged, { onConflict: "date" })
    .select("id, date, entrada, saida, diario_override, entrada_label, saida_label")
    .single();
  if (error) throw error;
  return data as FinanceDay;
}

export async function deleteDay(date: string): Promise<void> {
  const { error } = await supabase.from("finance_days").delete().eq("date", date);
  if (error) throw error;
}
