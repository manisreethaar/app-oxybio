-- ============================================================
-- OxyOS — Batch Monitoring v4 Patch
-- Run this AFTER batch_monitoring_v4_flask_level.sql
-- Fixes: batch_flask_qc_samples missing batch_id column
-- (BMR route queries this table with .eq('batch_id', batchId))
-- ============================================================

ALTER TABLE batch_flask_qc_samples
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_flask_qcs_batch ON batch_flask_qc_samples (batch_id);

SELECT 'v4 patch applied — batch_id added to batch_flask_qc_samples.' AS status;
