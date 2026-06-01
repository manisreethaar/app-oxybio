ALTER TABLE public.deviations ADD COLUMN IF NOT EXISTS affected_sops JSONB DEFAULT '[]'::jsonb;
