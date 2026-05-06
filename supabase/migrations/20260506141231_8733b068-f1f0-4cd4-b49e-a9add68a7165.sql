-- Ensure recurring_group_id exists (idempotent) so generated types stay in sync
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS recurring_group_id uuid DEFAULT NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_recurring_group_id_idx
  ON public.finance_transactions (recurring_group_id)
  WHERE recurring_group_id IS NOT NULL;

-- Notes feature
CREATE TABLE IF NOT EXISTS public.note_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES public.note_folders(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_folder_id_idx ON public.notes (folder_id);
CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON public.notes (updated_at DESC);

ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read note_folders" ON public.note_folders FOR SELECT USING (true);
CREATE POLICY "Public can insert note_folders" ON public.note_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update note_folders" ON public.note_folders FOR UPDATE USING (true);
CREATE POLICY "Public can delete note_folders" ON public.note_folders FOR DELETE USING (true);

CREATE POLICY "Public can read notes" ON public.notes FOR SELECT USING (true);
CREATE POLICY "Public can insert notes" ON public.notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update notes" ON public.notes FOR UPDATE USING (true);
CREATE POLICY "Public can delete notes" ON public.notes FOR DELETE USING (true);

CREATE TRIGGER trg_note_folders_updated_at
  BEFORE UPDATE ON public.note_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();