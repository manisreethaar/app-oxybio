-- Add archived_at / archived_by to all tables that participate in the
-- edit-request approval flow but previously hard-deleted on approval.
-- This makes every approved delete request a soft-delete, recoverable
-- from /archive.

-- ── Parent record tables ────────────────────────────────────────────────────

ALTER TABLE public.shelf_life_studies
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.deviations
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.capa_actions
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.growth_studies
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.taste_panels
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

-- ── Sub-record / measurement tables ────────────────────────────────────────

ALTER TABLE public.batch_fermentation_readings
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.growth_measurements
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.shelf_life_logs
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.ph_readings
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.employees(id);

-- ── Indexes for performance ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shelf_life_studies_archived_at  ON public.shelf_life_studies (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deviations_archived_at          ON public.deviations          (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capa_actions_archived_at        ON public.capa_actions        (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_growth_studies_archived_at      ON public.growth_studies      (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_taste_panels_archived_at        ON public.taste_panels        (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_samples_archived_at             ON public.samples             (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batch_fermentation_archived_at  ON public.batch_fermentation_readings (archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_growth_measurements_archived_at ON public.growth_measurements (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shelf_life_logs_archived_at     ON public.shelf_life_logs     (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ph_readings_archived_at         ON public.ph_readings         (archived_at)  WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_results_archived_at        ON public.test_results        (archived_at)  WHERE archived_at IS NOT NULL;
