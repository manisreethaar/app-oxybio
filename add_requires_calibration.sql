-- Migration: Add requires_calibration flag to equipment table
-- Run this in your Supabase SQL editor

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS requires_calibration BOOLEAN NOT NULL DEFAULT FALSE;

-- Optional: mark any existing equipment that already has a calibration_due_date
-- as requiring calibration (so they don't lose their status):
UPDATE equipment
  SET requires_calibration = TRUE
  WHERE calibration_due_date IS NOT NULL;
