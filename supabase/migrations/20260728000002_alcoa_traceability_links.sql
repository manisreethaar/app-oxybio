-- ============================================================
-- ALCOA++ Traceability Links
-- Adds reference columns to inventory_usage for traceability 
-- across non-batch modules (Titration, R&D, Lab Bench)
-- ============================================================

ALTER TABLE public.inventory_usage
  ADD COLUMN IF NOT EXISTS titration_id UUID REFERENCES public.titration_logs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sample_id UUID REFERENCES public.samples(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES public.bioprocess_experiments(id) ON DELETE CASCADE;

-- Add indices for new FKs
CREATE INDEX IF NOT EXISTS idx_inv_usage_titration_id ON public.inventory_usage(titration_id);
CREATE INDEX IF NOT EXISTS idx_inv_usage_sample_id ON public.inventory_usage(sample_id);
CREATE INDEX IF NOT EXISTS idx_inv_usage_experiment_id ON public.inventory_usage(experiment_id);

NOTIFY pgrst, 'reload schema';
