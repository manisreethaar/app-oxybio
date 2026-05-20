-- ============================================================
-- OxyOS — Lab Metrics & Calibration Upgrade
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add fields to batch_fermentation_readings
ALTER TABLE batch_fermentation_readings ADD COLUMN IF NOT EXISTS brix NUMERIC(5,2);
ALTER TABLE batch_fermentation_readings ADD COLUMN IF NOT EXISTS optical_density NUMERIC(5,3);
ALTER TABLE batch_fermentation_readings ADD COLUMN IF NOT EXISTS plating_result TEXT;

-- 2. Add fields to calibration_logs
ALTER TABLE calibration_logs ADD COLUMN IF NOT EXISTS buffer_values_used TEXT;

SELECT 'Lab Metrics & Calibration Upgrade Complete.' AS status;
