-- 🛠️ Run this script in your Supabase SQL Editor to enable Archiving
ALTER TABLE public.formulations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

COMMENT ON COLUMN public.formulations.status IS 'Active vs Archived status for filtering deprecated recipes';
