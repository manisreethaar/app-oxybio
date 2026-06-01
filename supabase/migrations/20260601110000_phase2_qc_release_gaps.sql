-- Phase 2: QC completion, COA, re-test, Release e-sig, SKU linkage
-- G-10: re-test linkage
ALTER TABLE batch_flask_qc_tests
  ADD COLUMN IF NOT EXISTS retest_of uuid REFERENCES batch_flask_qc_tests(id) ON DELETE SET NULL;

-- G-14/G-16: e-sig timestamp + SKU/formulation on release
ALTER TABLE batch_flask_release_record
  ADD COLUMN IF NOT EXISTS formulation_id     uuid REFERENCES formulations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku_name           text,
  ADD COLUMN IF NOT EXISTS esig_confirmed_at  timestamptz;
