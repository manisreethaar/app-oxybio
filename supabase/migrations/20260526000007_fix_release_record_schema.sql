-- Ensure batch_flask_release_record exists and has ALL required columns.
-- ADD COLUMN IF NOT EXISTS is safe to re-run.

CREATE TABLE IF NOT EXISTS public.batch_flask_release_record (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flask_id  UUID NOT NULL REFERENCES public.batch_flasks(id) ON DELETE CASCADE,
  UNIQUE (flask_id)
);

ALTER TABLE public.batch_flask_release_record
  ADD COLUMN IF NOT EXISTS batch_id         UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS released_by      UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS release_date     TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS yield_volume_ml  NUMERIC,
  ADD COLUMN IF NOT EXISTS bottles_produced INTEGER,
  ADD COLUMN IF NOT EXISTS bottle_volume_ml NUMERIC,
  ADD COLUMN IF NOT EXISTS release_notes    TEXT,
  ADD COLUMN IF NOT EXISTS bmr_url          TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.batch_flask_release_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bfrel_auth_select  ON public.batch_flask_release_record;
DROP POLICY IF EXISTS bfrel_admin_insert ON public.batch_flask_release_record;
DROP POLICY IF EXISTS bfrel_admin_update ON public.batch_flask_release_record;
DROP POLICY IF EXISTS bfrel_admin_delete ON public.batch_flask_release_record;

CREATE POLICY bfrel_auth_select  ON public.batch_flask_release_record FOR SELECT USING ((SELECT auth.role()) = 'authenticated');
CREATE POLICY bfrel_admin_insert ON public.batch_flask_release_record FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY bfrel_admin_update ON public.batch_flask_release_record FOR UPDATE USING (public.is_admin());
CREATE POLICY bfrel_admin_delete ON public.batch_flask_release_record FOR DELETE USING (public.is_admin());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
