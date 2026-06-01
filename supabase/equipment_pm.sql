ALTER TABLE equipment ADD COLUMN IF NOT EXISTS pm_frequency_days INTEGER;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS next_pm_date DATE;

ALTER TABLE calibration_logs ADD COLUMN IF NOT EXISTS log_type TEXT DEFAULT 'Calibration';
