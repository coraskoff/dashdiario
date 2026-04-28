-- Multiple transactions per day for finance module
CREATE TABLE public.finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('entrada', 'saida')),
  amount NUMERIC NOT NULL DEFAULT 0,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_transactions_date ON public.finance_transactions(date);
CREATE INDEX idx_finance_transactions_kind ON public.finance_transactions(kind);

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read finance_transactions"
  ON public.finance_transactions FOR SELECT USING (true);
CREATE POLICY "Public can insert finance_transactions"
  ON public.finance_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update finance_transactions"
  ON public.finance_transactions FOR UPDATE USING (true);
CREATE POLICY "Public can delete finance_transactions"
  ON public.finance_transactions FOR DELETE USING (true);

CREATE TRIGGER update_finance_transactions_updated_at
  BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from existing aggregated finance_days
INSERT INTO public.finance_transactions (date, kind, amount, label)
SELECT date, 'entrada', entrada, entrada_label
FROM public.finance_days WHERE entrada > 0;

INSERT INTO public.finance_transactions (date, kind, amount, label)
SELECT date, 'saida', saida, saida_label
FROM public.finance_days WHERE saida > 0;