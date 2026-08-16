-- ALOCA++ Tier 1 Compliance for Incubation Module
ALTER TABLE sample_incubation_records 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS reason_for_change TEXT;
