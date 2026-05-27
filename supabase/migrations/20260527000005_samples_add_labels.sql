-- Idempotent: adds source_label and timepoint_label to samples if not already present.
-- These columns are included in the CREATE TABLE in 20260527000004.
-- This migration is a safe catch-up for any environment that applied
-- 20260527000004 before the columns were added to it.

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS source_label    TEXT,
  ADD COLUMN IF NOT EXISTS timepoint_label TEXT;
