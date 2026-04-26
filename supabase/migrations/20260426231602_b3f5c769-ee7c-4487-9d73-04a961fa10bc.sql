-- Função compartilhada para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Enum para tipo financeiro
CREATE TYPE public.financial_type AS ENUM ('income', 'expense');
CREATE TYPE public.task_status AS ENUM ('pending', 'completed');

-- Categorias financeiras
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type public.financial_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, type)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Public can insert categories" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update categories" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Public can delete categories" ON public.categories FOR DELETE USING (true);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tarefas
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Public can insert tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update tasks" ON public.tasks FOR UPDATE USING (true);
CREATE POLICY "Public can delete tasks" ON public.tasks FOR DELETE USING (true);

CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_created_at ON public.tasks(created_at DESC);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Transações financeiras
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type public.financial_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Public can insert transactions" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update transactions" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "Public can delete transactions" ON public.transactions FOR DELETE USING (true);

CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);
CREATE INDEX idx_transactions_occurred_at ON public.transactions(occurred_at DESC);

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Categorias iniciais
INSERT INTO public.categories (name, type) VALUES
  ('Salário', 'income'),
  ('Freelance', 'income'),
  ('Investimentos', 'income'),
  ('Outros', 'income'),
  ('Alimentação', 'expense'),
  ('Moradia', 'expense'),
  ('Transporte', 'expense'),
  ('Lazer', 'expense'),
  ('Saúde', 'expense'),
  ('Educação', 'expense'),
  ('Outros', 'expense');