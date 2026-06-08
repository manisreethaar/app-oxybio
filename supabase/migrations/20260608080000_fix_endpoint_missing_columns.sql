-- ============================================================
-- Fix: Ensure all batch_flask_endpoints columns exist
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- Run this in Supabase SQL Editor if endpoint declaration fails.
-- ============================================================

-- From 20260526000009_fermentation_endpoint_audit.sql
ALTER TABLE public.batch_flask_endpoints
  ADD COLUMN IF NOT EXISTS end_time  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS edit_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_batch_flask_endpoints_end_time
  ON public.batch_flask_endpoints(end_time);

-- From fermentation_columns_migration.sql
ALTER TABLE public.batch_flask_endpoints
  ADD COLUMN IF NOT EXISTS gram_stain             TEXT,
  ADD COLUMN IF NOT EXISTS gram_stain_image_url   TEXT,
  ADD COLUMN IF NOT EXISTS titratable_acidity_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS colour_desc            TEXT,
  ADD COLUMN IF NOT EXISTS texture                TEXT,
  ADD COLUMN IF NOT EXISTS sensory_overall        TEXT,
  ADD COLUMN IF NOT EXISTS aroma                  TEXT,
  ADD COLUMN IF NOT EXISTS declared_by            UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS notes                  TEXT;

-- From 20260601130000_phase4_fermentation_analytics.sql
ALTER TABLE public.batch_flask_endpoints
  ADD COLUMN IF NOT EXISTS titratable_acidity_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS gram_stain_image_url   TEXT;

-- Ensure RLS policy covers all operations for authenticated users
ALTER TABLE public.batch_flask_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bfe_auth_all ON public.batch_flask_endpoints;
CREATE POLICY "bfe_auth_all" ON public.batch_flask_endpoints
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

SELECT 'batch_flask_endpoints columns and RLS verified.' AS status;
