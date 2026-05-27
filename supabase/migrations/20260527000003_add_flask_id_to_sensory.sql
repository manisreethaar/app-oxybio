-- Add flask_id to taste_panels
ALTER TABLE public.taste_panels
  ADD COLUMN IF NOT EXISTS flask_id TEXT;
