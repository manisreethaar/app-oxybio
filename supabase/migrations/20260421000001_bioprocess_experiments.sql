-- ============================================================
-- Bioprocess Optimization Module
-- Tables: experiments, factors, responses, kinetics_data
-- ============================================================

-- Parent experiment record
CREATE TABLE public.bioprocess_experiments (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT        NOT NULL,
  description   TEXT,
  type          TEXT        NOT NULL CHECK (type IN ('pbd', 'rsm', 'kinetics')),
  status        TEXT        NOT NULL DEFAULT 'setup'
                            CHECK (status IN ('setup', 'collecting', 'complete')),
  response_variable  TEXT   DEFAULT 'OD600 at 24h',
  response_unit      TEXT   DEFAULT '',
  created_by    UUID        REFERENCES public.employees(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  analysis_result  JSONB   DEFAULT '{}',
  config           JSONB   DEFAULT '{}'
);

-- Factor definitions (for PBD: X1-X11; for RSM: A/B/C; unused for kinetics)
CREATE TABLE public.bioprocess_factors (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id  UUID    REFERENCES public.bioprocess_experiments(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  code           TEXT    NOT NULL,
  variable       TEXT    NOT NULL,
  unit           TEXT,
  low_value      NUMERIC NOT NULL,
  center_value   NUMERIC,
  high_value     NUMERIC NOT NULL
);

-- Run responses (12 rows for PBD, 15 rows for RSM)
CREATE TABLE public.bioprocess_responses (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id  UUID    REFERENCES public.bioprocess_experiments(id) ON DELETE CASCADE,
  run_number     INTEGER NOT NULL,
  response       NUMERIC,
  notes          TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(experiment_id, run_number)
);

-- Kinetics data points (Monod/MM pairs or full-batch time-course)
CREATE TABLE public.bioprocess_kinetics_data (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id  UUID    REFERENCES public.bioprocess_experiments(id) ON DELETE CASCADE,
  series_label   TEXT,
  substrate      NUMERIC,
  rate           NUMERIC,
  time_h         NUMERIC,
  biomass        NUMERIC,
  product        NUMERIC,
  sort_order     INTEGER DEFAULT 0
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX idx_bioprocess_factors_exp   ON public.bioprocess_factors(experiment_id);
CREATE INDEX idx_bioprocess_responses_exp ON public.bioprocess_responses(experiment_id);
CREATE INDEX idx_bioprocess_kinetics_exp  ON public.bioprocess_kinetics_data(experiment_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.bioprocess_experiments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bioprocess_factors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bioprocess_responses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bioprocess_kinetics_data  ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "bioprocess_experiments_select" ON public.bioprocess_experiments
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_factors_select" ON public.bioprocess_factors
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_responses_select" ON public.bioprocess_responses
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_kinetics_select" ON public.bioprocess_kinetics_data
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

-- All authenticated users can insert (interns create their own experiments)
CREATE POLICY "bioprocess_experiments_insert" ON public.bioprocess_experiments
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_factors_insert" ON public.bioprocess_factors
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_responses_insert" ON public.bioprocess_responses
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_kinetics_insert" ON public.bioprocess_kinetics_data
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'authenticated');

-- Creator or admin can update
CREATE POLICY "bioprocess_experiments_update" ON public.bioprocess_experiments
  FOR UPDATE USING (
    created_by IN (
      SELECT id FROM public.employees WHERE email = auth.jwt()->>'email'
    )
    OR public.is_admin()
  );

CREATE POLICY "bioprocess_factors_update" ON public.bioprocess_factors
  FOR UPDATE USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_responses_update" ON public.bioprocess_responses
  FOR UPDATE USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_kinetics_update" ON public.bioprocess_kinetics_data
  FOR UPDATE USING ((SELECT auth.role()) = 'authenticated');

-- Creator or admin can delete
CREATE POLICY "bioprocess_experiments_delete" ON public.bioprocess_experiments
  FOR DELETE USING (
    created_by IN (
      SELECT id FROM public.employees WHERE email = auth.jwt()->>'email'
    )
    OR public.is_admin()
  );

CREATE POLICY "bioprocess_factors_delete" ON public.bioprocess_factors
  FOR DELETE USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_responses_delete" ON public.bioprocess_responses
  FOR DELETE USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "bioprocess_kinetics_delete" ON public.bioprocess_kinetics_data
  FOR DELETE USING ((SELECT auth.role()) = 'authenticated');
