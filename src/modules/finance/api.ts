import { all, one, run, uid, nowIso } from "@/lib/db";
import type {
  FinanceDay,
  FinanceDayDiarioInput,
  FinanceMonth,
  FinanceMonthInput,
  FinanceTransaction,
  FinanceTransactionInput,
} from "./types";

export async function fetchAllMonths(): Promise<FinanceMonth[]> {
  const rows = await all<FinanceMonth>(
    `SELECT id, month, variable_amount FROM finance_months ORDER BY month`,
  );
  return rows.map((r) => ({ ...r, variable_amount: Number(r.variable_amount) }));
}

export async function fetchAllDays(): Promise<FinanceDay[]> {
  return all<FinanceDay>(
    `SELECT id, date, diario_override FROM finance_days ORDER BY date`,
  );
}

export async function fetchAllTransactions(): Promise<FinanceTransaction[]> {
  const rows = await all<FinanceTransaction>(
    `SELECT id, date, kind, amount, label, recurring_group_id
     FROM finance_transactions ORDER BY date, created_at`,
  );
  return rows.map((d) => ({
    ...d,
    amount: Number(d.amount),
    recurring_group_id: d.recurring_group_id ?? null,
  }));
}

export async function upsertMonth(input: FinanceMonthInput): Promise<FinanceMonth> {
  if (!Number.isFinite(input.variable_amount) || input.variable_amount < 0) {
    throw new Error("Valor inválido.");
  }
  const now = nowIso();
  await run(
    `INSERT INTO finance_months (id, month, variable_amount, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(month) DO UPDATE SET variable_amount = excluded.variable_amount, updated_at = excluded.updated_at`,
    [uid(), input.month, input.variable_amount, now, now],
  );
  const row = await one<FinanceMonth>(
    `SELECT id, month, variable_amount FROM finance_months WHERE month = $1`,
    [input.month],
  );
  return { ...row!, variable_amount: Number(row!.variable_amount) };
}

export async function upsertDayDiario(input: FinanceDayDiarioInput): Promise<FinanceDay> {
  const now = nowIso();
  await run(
    `INSERT INTO finance_days (id, date, diario_override, entrada, saida, created_at, updated_at)
     VALUES ($1, $2, $3, 0, 0, $4, $5)
     ON CONFLICT(date) DO UPDATE SET diario_override = excluded.diario_override, updated_at = excluded.updated_at`,
    [uid(), input.date, input.diario_override, now, now],
  );
  const row = await one<FinanceDay>(
    `SELECT id, date, diario_override FROM finance_days WHERE date = $1`,
    [input.date],
  );
  return row!;
}

export async function upsertTransaction(
  input: FinanceTransactionInput,
): Promise<FinanceTransaction> {
  if (!input.date) throw new Error("Data inválida.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Valor deve ser maior que zero.");
  }
  const now = nowIso();
  const id = input.id ?? uid();
  if (input.id) {
    await run(
      `UPDATE finance_transactions
       SET date = $1, kind = $2, amount = $3, label = $4, recurring_group_id = $5, updated_at = $6
       WHERE id = $7`,
      [
        input.date,
        input.kind,
        input.amount,
        input.label ?? null,
        input.recurring_group_id ?? null,
        now,
        input.id,
      ],
    );
  } else {
    await run(
      `INSERT INTO finance_transactions
         (id, date, kind, amount, label, recurring_group_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        input.date,
        input.kind,
        input.amount,
        input.label ?? null,
        input.recurring_group_id ?? null,
        now,
        now,
      ],
    );
  }
  return {
    id,
    date: input.date,
    kind: input.kind,
    amount: Number(input.amount),
    label: input.label ?? null,
    recurring_group_id: input.recurring_group_id ?? null,
  };
}

export async function deleteTransaction(id: string): Promise<void> {
  await run(`DELETE FROM finance_transactions WHERE id = $1`, [id]);
}

export async function deleteRecurringFromDate(
  groupId: string,
  fromDate: string,
): Promise<void> {
  await run(
    `DELETE FROM finance_transactions WHERE recurring_group_id = $1 AND date >= $2`,
    [groupId, fromDate],
  );
}

export async function deleteAllRecurring(groupId: string): Promise<void> {
  await run(`DELETE FROM finance_transactions WHERE recurring_group_id = $1`, [groupId]);
}

export async function updateRecurringFromDate(
  groupId: string,
  fromDate: string,
  patch: { amount?: number; label?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.amount !== undefined) {
    sets.push(`amount = $${i++}`);
    vals.push(patch.amount);
  }
  if (patch.label !== undefined) {
    sets.push(`label = $${i++}`);
    vals.push(patch.label);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = $${i++}`);
  vals.push(nowIso());
  vals.push(groupId);
  vals.push(fromDate);
  await run(
    `UPDATE finance_transactions SET ${sets.join(", ")}
     WHERE recurring_group_id = $${i++} AND date >= $${i}`,
    vals,
  );
}

export async function updateAllRecurring(
  groupId: string,
  patch: { amount?: number; label?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.amount !== undefined) {
    sets.push(`amount = $${i++}`);
    vals.push(patch.amount);
  }
  if (patch.label !== undefined) {
    sets.push(`label = $${i++}`);
    vals.push(patch.label);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = $${i++}`);
  vals.push(nowIso());
  vals.push(groupId);
  await run(
    `UPDATE finance_transactions SET ${sets.join(", ")} WHERE recurring_group_id = $${i}`,
    vals,
  );
}
