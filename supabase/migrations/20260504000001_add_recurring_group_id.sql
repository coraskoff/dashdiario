ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS recurring_group_id uuid DEFAULT NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_recurring_group_id_idx
  ON public.finance_transactions (recurring_group_id)
  WHERE recurring_group_id IS NOT NULL;
