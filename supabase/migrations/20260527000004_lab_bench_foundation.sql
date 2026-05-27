-- ============================================================
-- OxyOS — Lab Bench Foundation
-- Creates the unified samples + test_results layer.
-- Existing module tables (batch_fermentation_readings,
-- growth_measurements, sample_incubation_records) are
-- untouched. Quick Log writes here AND bridges to them.
-- ============================================================

-- ── 1. SAMPLES ───────────────────────────────────────────────
-- Represents a physical sample collection event at a timepoint.
-- source_type + source_id link back to the originating module.

CREATE TABLE IF NOT EXISTS samples (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type      TEXT        NOT NULL
                     CHECK (source_type IN ('batch','growth_study','cell_bank','bioprocess','other')),
  source_id        TEXT        NOT NULL,   -- UUID of batch/growth_study/etc stored as text
  source_label     TEXT,                  -- "Batch OXY-B-001", "Growth Study GS-007"
  flask_id         UUID        REFERENCES batch_flasks(id) ON DELETE SET NULL,
  flask_label      TEXT,                  -- denormalised for display speed
  log_hour         NUMERIC,              -- elapsed hours at collection
  timepoint_label  TEXT,                 -- "T+24h", "Day 3", "Passage P2"
  sample_label     TEXT        NOT NULL,  -- full label: "Batch OXY-B-001 · Flask A T+24h"
  collected_by     UUID        REFERENCES employees(id) ON DELETE SET NULL,
  collected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','partial','complete')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_samples_source        ON samples(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_samples_flask         ON samples(flask_id);
CREATE INDEX IF NOT EXISTS idx_samples_collected_at  ON samples(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_status        ON samples(status);

ALTER TABLE samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_samples ON samples;
CREATE POLICY admin_all_samples ON samples FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_select_samples ON samples;
CREATE POLICY staff_select_samples ON samples FOR SELECT USING (true);

DROP POLICY IF EXISTS staff_insert_samples ON samples;
CREATE POLICY staff_insert_samples ON samples FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS staff_update_samples ON samples;
CREATE POLICY staff_update_samples ON samples FOR UPDATE USING (true);

-- ── 2. TEST RESULTS ──────────────────────────────────────────
-- One row per test per sample. Common fields for all types;
-- test-specific detail stored in JSONB to keep the table clean.
-- Bridge FK columns record which existing module row this synced to.

CREATE TABLE IF NOT EXISTS test_results (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id                       UUID        NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  test_type                       TEXT        NOT NULL
                                    CHECK (test_type IN ('ph','od','sterility','plate_analysis','custom')),
  numeric_value                   NUMERIC,
  text_value                      TEXT,
  unit                            TEXT,
  skipped                         BOOLEAN     NOT NULL DEFAULT false,
  skip_reason                     TEXT,
  -- test-specific fields: wavelength, dilution, media_type, colony_count,
  --   incubation_temp_c, expected_hours, culture_turbidity, culture_color, etc.
  detail                          JSONB       DEFAULT '{}',
  -- Bridge FKs — point to the synced record in the existing module table
  synced_fermentation_reading_id  UUID        REFERENCES batch_fermentation_readings(id) ON DELETE SET NULL,
  synced_growth_measurement_id    UUID,       -- UUID only, avoids hard dep on growth_measurements PK type
  synced_incubation_record_id     UUID        REFERENCES sample_incubation_records(id) ON DELETE SET NULL,
  entered_by                      UUID        REFERENCES employees(id) ON DELETE SET NULL,
  entered_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_results_sample       ON test_results(sample_id);
CREATE INDEX IF NOT EXISTS idx_test_results_type         ON test_results(test_type);
CREATE INDEX IF NOT EXISTS idx_test_results_fermentation ON test_results(synced_fermentation_reading_id)
  WHERE synced_fermentation_reading_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_results_growth       ON test_results(synced_growth_measurement_id)
  WHERE synced_growth_measurement_id IS NOT NULL;

ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_test_results ON test_results;
CREATE POLICY admin_all_test_results ON test_results FOR ALL USING (is_admin());

DROP POLICY IF EXISTS staff_select_test_results ON test_results;
CREATE POLICY staff_select_test_results ON test_results FOR SELECT USING (true);

DROP POLICY IF EXISTS staff_insert_test_results ON test_results;
CREATE POLICY staff_insert_test_results ON test_results FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS staff_update_test_results ON test_results;
CREATE POLICY staff_update_test_results ON test_results FOR UPDATE USING (true);

SELECT 'Lab Bench Foundation tables created.' AS status;
