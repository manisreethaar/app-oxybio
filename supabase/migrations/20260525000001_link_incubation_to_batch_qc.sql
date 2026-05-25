-- Link sample incubation records to batch monitoring evidence.
-- This lets QC/R&D incubation observations correlate with batch, flask, stage, and QC sample records.

ALTER TABLE sample_incubation_records
  ADD COLUMN IF NOT EXISTS flask_id UUID REFERENCES batch_flasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qc_sample_id UUID REFERENCES batch_flask_qc_samples(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_stage TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS sampled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sample_incubation_batch_id
  ON sample_incubation_records(batch_id);

CREATE INDEX IF NOT EXISTS idx_sample_incubation_flask_id
  ON sample_incubation_records(flask_id);

CREATE INDEX IF NOT EXISTS idx_sample_incubation_qc_sample_id
  ON sample_incubation_records(qc_sample_id);

CREATE INDEX IF NOT EXISTS idx_sample_incubation_source_stage
  ON sample_incubation_records(source_stage);
