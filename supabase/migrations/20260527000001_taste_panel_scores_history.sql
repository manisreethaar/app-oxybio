-- Add scores_history to taste_panels so score updates are never lost.
-- Each PATCH appends the previous scores snapshot (with a timestamp) before overwriting.
ALTER TABLE taste_panels
  ADD COLUMN IF NOT EXISTS scores_history jsonb NOT NULL DEFAULT '[]'::jsonb;
