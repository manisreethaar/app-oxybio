-- ============================================================
-- Seed Passages Tracking System
-- Creates seed_passages table and updates samples constraint
-- ============================================================

CREATE TABLE IF NOT EXISTS seed_passages (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type               TEXT        NOT NULL CHECK (target_type IN ('batch', 'growth_study')),
  target_batch_id           UUID        REFERENCES batches(id) ON DELETE SET NULL,
  target_growth_study_id    UUID        REFERENCES growth_studies(id) ON DELETE SET NULL,
  passage_number            INTEGER     NOT NULL, -- 1 = Seed 1, 2 = Seed 2, etc.
  vial_id                   UUID        REFERENCES inventory(id) ON DELETE SET NULL, -- usually populated for passage 1
  source_passage_id         UUID        REFERENCES seed_passages(id) ON DELETE SET NULL, -- for passages 2+
  media_name                TEXT,
  media_volume_ml           NUMERIC,
  inoculum_volume_ml        NUMERIC,
  incubation_temperature_c  NUMERIC,
  incubation_agitation_rpm  NUMERIC,
  start_time                TIMESTAMPTZ,
  target_od                 NUMERIC,
  target_ph                 NUMERIC,
  status                    TEXT        DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  completion_time           TIMESTAMPTZ,
  notes                     TEXT,
  created_by                UUID        REFERENCES employees(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- Add reference column to sample_incubation_records if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sample_incubation_records') THEN
        ALTER TABLE sample_incubation_records ADD COLUMN IF NOT EXISTS seed_passage_id UUID REFERENCES seed_passages(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_seed_passages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_seed_passages_updated_at_trig ON seed_passages;
CREATE TRIGGER update_seed_passages_updated_at_trig
BEFORE UPDATE ON seed_passages
FOR EACH ROW
EXECUTE PROCEDURE update_seed_passages_updated_at();

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_seed_passages_batch ON seed_passages(target_batch_id);
CREATE INDEX IF NOT EXISTS idx_seed_passages_study ON seed_passages(target_growth_study_id);
CREATE INDEX IF NOT EXISTS idx_seed_passages_source ON seed_passages(source_passage_id);

-- Enable RLS
ALTER TABLE seed_passages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_seed_passages ON seed_passages;
CREATE POLICY admin_all_seed_passages ON seed_passages FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_select_seed_passages ON seed_passages;
CREATE POLICY staff_select_seed_passages ON seed_passages FOR SELECT USING (true);

DROP POLICY IF EXISTS staff_insert_seed_passages ON seed_passages;
CREATE POLICY staff_insert_seed_passages ON seed_passages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS staff_update_seed_passages ON seed_passages;
CREATE POLICY staff_update_seed_passages ON seed_passages FOR UPDATE USING (true);

DROP POLICY IF EXISTS staff_delete_seed_passages ON seed_passages;
CREATE POLICY staff_delete_seed_passages ON seed_passages FOR DELETE USING (true);

-- Update samples constraint to include 'seed_passage'
-- We have to drop and recreate the constraint since it's a CHECK constraint.
DO $$
BEGIN
    ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_source_type_check;
EXCEPTION
    WHEN undefined_object THEN
        -- Do nothing if it doesn't exist
END $$;

ALTER TABLE samples ADD CONSTRAINT samples_source_type_check 
CHECK (source_type IN ('batch', 'growth_study', 'cell_bank', 'bioprocess', 'other', 'seed_passage'));
