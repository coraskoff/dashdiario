
CREATE TABLE public.monthly_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL,
  month TEXT NOT NULL, -- formato YYYY-MM
  planned_amount NUMERIC NOT NULL CHECK (planned_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, month)
);

ALTER TABLE public.monthly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read monthly_plans" ON public.monthly_plans FOR SELECT USING (true);
CREATE POLICY "Public can insert monthly_plans" ON public.monthly_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update monthly_plans" ON public.monthly_plans FOR UPDATE USING (true);
CREATE POLICY "Public can delete monthly_plans" ON public.monthly_plans FOR DELETE USING (true);

CREATE TRIGGER update_monthly_plans_updated_at
BEFORE UPDATE ON public.monthly_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.daily_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL,
  date DATE NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, date)
);

ALTER TABLE public.daily_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read daily_expenses" ON public.daily_expenses FOR SELECT USING (true);
CREATE POLICY "Public can insert daily_expenses" ON public.daily_expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update daily_expenses" ON public.daily_expenses FOR UPDATE USING (true);
CREATE POLICY "Public can delete daily_expenses" ON public.daily_expenses FOR DELETE USING (true);

CREATE TRIGGER update_daily_expenses_updated_at
BEFORE UPDATE ON public.daily_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_daily_expenses_date ON public.daily_expenses(date);
CREATE INDEX idx_monthly_plans_month ON public.monthly_plans(month);
