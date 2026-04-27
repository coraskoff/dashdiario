-- Drop legacy finance tables
DROP TABLE IF EXISTS public.daily_expenses CASCADE;
DROP TABLE IF EXISTS public.monthly_plans CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TYPE IF EXISTS public.financial_type CASCADE;

-- Months config: one row per YYYY-MM
CREATE TABLE public.finance_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE, -- YYYY-MM
  variable_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read finance_months" ON public.finance_months FOR SELECT USING (true);
CREATE POLICY "Public can insert finance_months" ON public.finance_months FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update finance_months" ON public.finance_months FOR UPDATE USING (true);
CREATE POLICY "Public can delete finance_months" ON public.finance_months FOR DELETE USING (true);

CREATE TRIGGER update_finance_months_updated_at
BEFORE UPDATE ON public.finance_months
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Day entries: one row per date
CREATE TABLE public.finance_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  entrada numeric NOT NULL DEFAULT 0,
  saida numeric NOT NULL DEFAULT 0,
  diario_override numeric, -- if null, use month's suggested daily
  entrada_label text,
  saida_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_days_date ON public.finance_days(date);

ALTER TABLE public.finance_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read finance_days" ON public.finance_days FOR SELECT USING (true);
CREATE POLICY "Public can insert finance_days" ON public.finance_days FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update finance_days" ON public.finance_days FOR UPDATE USING (true);
CREATE POLICY "Public can delete finance_days" ON public.finance_days FOR DELETE USING (true);

CREATE TRIGGER update_finance_days_updated_at
BEFORE UPDATE ON public.finance_days
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();