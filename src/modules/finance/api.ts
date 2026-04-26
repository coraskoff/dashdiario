import { supabase } from "@/integrations/supabase/client";
import type { Category, Transaction, TransactionInput } from "./types";
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