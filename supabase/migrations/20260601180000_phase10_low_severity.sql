-- Phase 10: Low severity gaps
ALTER TABLE batch_stage_media_prep
  ADD COLUMN IF NOT EXISTS substrate_photo_url text;

ALTER TABLE lab_notebook_entries
  ADD COLUMN IF NOT EXISTS sketch_url text;
