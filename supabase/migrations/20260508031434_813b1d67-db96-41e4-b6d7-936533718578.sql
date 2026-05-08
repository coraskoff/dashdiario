
CREATE TABLE public.timer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NULL,
  tag text NULL,
  mode text NOT NULL DEFAULT 'count_up',
  planned_seconds int NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  duration_seconds int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_timer_sessions_started_at ON public.timer_sessions(started_at DESC);
CREATE INDEX idx_timer_sessions_project ON public.timer_sessions(project_id);
ALTER TABLE public.timer_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read timer_sessions" ON public.timer_sessions FOR SELECT USING (true);
CREATE POLICY "Public can insert timer_sessions" ON public.timer_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update timer_sessions" ON public.timer_sessions FOR UPDATE USING (true);
CREATE POLICY "Public can delete timer_sessions" ON public.timer_sessions FOR DELETE USING (true);
CREATE TRIGGER trg_timer_sessions_updated BEFORE UPDATE ON public.timer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.timer_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timer_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read timer_goals" ON public.timer_goals FOR SELECT USING (true);
CREATE POLICY "Public can insert timer_goals" ON public.timer_goals FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update timer_goals" ON public.timer_goals FOR UPDATE USING (true);
CREATE POLICY "Public can delete timer_goals" ON public.timer_goals FOR DELETE USING (true);
CREATE TRIGGER trg_timer_goals_updated BEFORE UPDATE ON public.timer_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.timer_project_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE,
  weekly_seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timer_project_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read timer_project_goals" ON public.timer_project_goals FOR SELECT USING (true);
CREATE POLICY "Public can insert timer_project_goals" ON public.timer_project_goals FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update timer_project_goals" ON public.timer_project_goals FOR UPDATE USING (true);
CREATE POLICY "Public can delete timer_project_goals" ON public.timer_project_goals FOR DELETE USING (true);
CREATE TRIGGER trg_timer_project_goals_updated BEFORE UPDATE ON public.timer_project_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
