-- cell_bank_preparations gained several columns directly on the live
-- project (formulation_id, source_vial_id, the qc_released* trio, the
-- stability-test-schedule fields, updated_by) that were never captured as
-- a tracked ALTER migration — 20260526000002_cell_bank_lnb_workflow.sql
-- only created the original, smaller column set. A from-scratch replay
-- then fails at 20260805000001_add_missing_fk_indexes.sql, which indexes
-- qc_released_by expecting it to already exist. All additive and
-- IF NOT EXISTS, harmless on the already-migrated live project.
ALTER TABLE public.cell_bank_preparations
  ADD COLUMN IF NOT EXISTS formulation_id UUID,
  ADD COLUMN IF NOT EXISTS source_vial_id UUID,
  ADD COLUMN IF NOT EXISTS qc_released BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS qc_released_by UUID,
  ADD COLUMN IF NOT EXISTS qc_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stability_test_interval_months INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS last_stability_test_date DATE,
  ADD COLUMN IF NOT EXISTS next_stability_test_date DATE,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Same situation, same table family: cell_bank_vials also gained columns
-- directly on the live project that 20260526000002_cell_bank_lnb_workflow.sql
-- never captured.
ALTER TABLE public.cell_bank_vials
  ADD COLUMN IF NOT EXISTS used_in_study_id UUID,
  ADD COLUMN IF NOT EXISTS volume_ml NUMERIC,
  ADD COLUMN IF NOT EXISTS expires_at DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

NOTIFY pgrst, 'reload schema';
