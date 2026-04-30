ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS position numeric;

CREATE INDEX IF NOT EXISTS tasks_position_idx ON public.tasks (position);

-- Backfill: assign sequential positions per (status, due_date) bucket based on created_at
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) * 10 AS new_pos
  FROM public.tasks
  WHERE position IS NULL
)
UPDATE public.tasks t
SET position = r.new_pos
FROM ranked r
WHERE t.id = r.id;