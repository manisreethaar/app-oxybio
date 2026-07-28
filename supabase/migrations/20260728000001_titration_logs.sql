-- ============================================================
-- Dedicated Titratable Acidity (TA) / Titration Logs
-- Allows logging TA for batch samples, R&D experiments, or standalone
-- Formula: TA(%) = (V_titrant × N_titrant × Eq_wt) / (V_sample × 10)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.titration_logs (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Source linkage (flexible: batch, R&D experiment, standalone)
  source_type          TEXT        NOT NULL DEFAULT 'standalone'
                                   CHECK (source_type IN ('batch', 'bioprocess_experiment', 'raw_material', 'standalone')),
  source_id            UUID,                          -- FK to batches.id or bioprocess_experiments.id (nullable for raw_material/standalone)
  source_label         TEXT,                          -- Human-readable label (e.g. batch_id string, experiment title)

  -- Sample details
  sample_name          TEXT        NOT NULL,
  sample_description   TEXT,
  sampled_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  elapsed_hours        NUMERIC,                       -- T+h for batch samples (optional)

  -- Titration inputs
  acid_type            TEXT        NOT NULL DEFAULT 'Lactic Acid'
                                   CHECK (acid_type IN ('Lactic Acid', 'Citric Acid', 'Acetic Acid')),
  equivalent_weight    NUMERIC     NOT NULL DEFAULT 90.08,   -- g/mol (auto-set by acid_type)
  titrant_normality    NUMERIC     NOT NULL DEFAULT 0.1,     -- N (e.g. 0.1N NaOH)
  sample_volume_ml     NUMERIC     NOT NULL,                 -- mL of sample taken
  initial_burette_ml   NUMERIC     NOT NULL DEFAULT 0,       -- mL before titration
  final_burette_ml     NUMERIC     NOT NULL,                 -- mL at endpoint

  -- Calculated (also stored for fast querying)
  titrant_volume_ml    NUMERIC     GENERATED ALWAYS AS (final_burette_ml - initial_burette_ml) STORED,
  ta_percent           NUMERIC     GENERATED ALWAYS AS (
                         ROUND(
                           ((final_burette_ml - initial_burette_ml) * titrant_normality * equivalent_weight)
                           / (sample_volume_ml * 10),
                           4
                         )
                       ) STORED,

  -- Meta
  notes                TEXT,
  logged_by            UUID        REFERENCES public.employees(id),
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_titration_logs_source ON public.titration_logs(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_titration_logs_logged_by ON public.titration_logs(logged_by);
CREATE INDEX IF NOT EXISTS idx_titration_logs_created_at ON public.titration_logs(created_at DESC);

-- RLS
ALTER TABLE public.titration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "titration_logs_select" ON public.titration_logs
  FOR SELECT USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "titration_logs_insert" ON public.titration_logs
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "titration_logs_update" ON public.titration_logs
  FOR UPDATE USING (
    logged_by IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR public.is_admin()
  );

CREATE POLICY "titration_logs_delete" ON public.titration_logs
  FOR DELETE USING (
    logged_by IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR public.is_admin()
  );

NOTIFY pgrst, 'reload schema';
