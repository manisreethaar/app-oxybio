-- Link incubation records back to the unified Lab Bench sample/log event.
-- This makes many plates from the same batch/study/cell-bank preparation
-- groupable by source + flask + log hour, while still identifying each plate.

ALTER TABLE sample_incubation_records
  ADD COLUMN IF NOT EXISTS lab_bench_sample_id UUID REFERENCES samples(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS source_label TEXT,
  ADD COLUMN IF NOT EXISTS log_hour NUMERIC,
  ADD COLUMN IF NOT EXISTS timepoint_label TEXT,
  ADD COLUMN IF NOT EXISTS plate_label TEXT,
  ADD COLUMN IF NOT EXISTS plate_index INTEGER,
  ADD COLUMN IF NOT EXISTS plate_total INTEGER;

CREATE INDEX IF NOT EXISTS idx_sample_incubation_lab_bench_sample
  ON sample_incubation_records(lab_bench_sample_id);

CREATE INDEX IF NOT EXISTS idx_sample_incubation_source_group
  ON sample_incubation_records(source_type, source_id, flask_id, log_hour);

CREATE INDEX IF NOT EXISTS idx_sample_incubation_plate_group
  ON sample_incubation_records(lab_bench_sample_id, plate_index);
