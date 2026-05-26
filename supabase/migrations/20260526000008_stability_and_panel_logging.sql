-- Stability and sensory panel logging support.
-- Safe to re-run: all structural changes use IF NOT EXISTS.

ALTER TABLE public.taste_panels
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS test_criteria JSONB DEFAULT '["Taste","Texture","Smell","Appearance"]'::jsonb,
  ADD COLUMN IF NOT EXISTS avg_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scores JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_taste_panels_batch_id ON public.taste_panels(batch_id);
CREATE INDEX IF NOT EXISTS idx_taste_panels_created_at ON public.taste_panels(created_at DESC);

CREATE TABLE IF NOT EXISTS public.shelf_life_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_life_id UUID NOT NULL REFERENCES public.shelf_life_studies(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number >= 0),
  test_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  logged_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (shelf_life_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_shelf_life_logs_study_day ON public.shelf_life_logs(shelf_life_id, day_number);
CREATE INDEX IF NOT EXISTS idx_shelf_life_logs_logged_by ON public.shelf_life_logs(logged_by);

ALTER TABLE public.shelf_life_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shelf_life_logs_auth_select ON public.shelf_life_logs;
DROP POLICY IF EXISTS shelf_life_logs_auth_insert ON public.shelf_life_logs;
DROP POLICY IF EXISTS shelf_life_logs_auth_update ON public.shelf_life_logs;

CREATE POLICY shelf_life_logs_auth_select
  ON public.shelf_life_logs
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY shelf_life_logs_auth_insert
  ON public.shelf_life_logs
  FOR INSERT
  WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY shelf_life_logs_auth_update
  ON public.shelf_life_logs
  FOR UPDATE
  USING ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');

NOTIFY pgrst, 'reload schema';
