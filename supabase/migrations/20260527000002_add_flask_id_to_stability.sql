-- Add flask_id to shelf_life_studies
ALTER TABLE public.shelf_life_studies
  ADD COLUMN IF NOT EXISTS flask_id TEXT;
