-- Add missing columns to sample_incubation_records
ALTER TABLE sample_incubation_records
  ADD COLUMN IF NOT EXISTS dilution_factor      NUMERIC,
  ADD COLUMN IF NOT EXISTS volume_plated_ml     NUMERIC,
  ADD COLUMN IF NOT EXISTS replicate_label      TEXT,
  ADD COLUMN IF NOT EXISTS media_lot            TEXT,
  ADD COLUMN IF NOT EXISTS media_inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS media_volume_used_ml NUMERIC;

-- Index for replicate grouping queries
CREATE INDEX IF NOT EXISTS idx_sir_replicate
  ON sample_incubation_records (batch_id, replicate_label)
  WHERE replicate_label IS NOT NULL;
