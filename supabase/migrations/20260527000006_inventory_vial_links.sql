-- ── inventory_movements: add batch_id FK ──────────────────────────────────
-- Previous code used non-existent 'batch_reference' / 'movement_type' columns;
-- those writes failed silently. This adds the proper FK and correct column names
-- are now used in code (type, batch_id).
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;

-- ── inventory_usage: add missing columns that were silently dropped ─────────
ALTER TABLE inventory_usage
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS cell_bank_prep_id UUID REFERENCES cell_bank_preparations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vial_id UUID REFERENCES cell_bank_vials(id) ON DELETE SET NULL;

-- ── cell_bank_vials: optional volume tracking per vial ─────────────────────
ALTER TABLE cell_bank_vials
  ADD COLUMN IF NOT EXISTS volume_ml NUMERIC;

-- ── cell_bank_vial_logs: enrich with study/prep/volume context ─────────────
ALTER TABLE cell_bank_vial_logs
  ADD COLUMN IF NOT EXISTS study_id UUID REFERENCES growth_studies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cell_bank_prep_id UUID REFERENCES cell_bank_preparations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS volume_used_ml NUMERIC;

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch_id ON inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_usage_vial_id      ON inventory_usage(vial_id);
CREATE INDEX IF NOT EXISTS idx_inventory_usage_cb_prep_id   ON inventory_usage(cell_bank_prep_id);
CREATE INDEX IF NOT EXISTS idx_vial_logs_study_id           ON cell_bank_vial_logs(study_id);
CREATE INDEX IF NOT EXISTS idx_vial_logs_cb_prep_id         ON cell_bank_vial_logs(cell_bank_prep_id);
