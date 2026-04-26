ALTER TABLE public.tasks ADD COLUMN due_date DATE;
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);