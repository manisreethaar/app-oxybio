-- Tier-1 Architecture Upgrade: Equipment & Documents (ALOCA++ & WebSockets)

-- 1. EQUIPMENT CALIBRATION LOGS
ALTER TABLE public.calibration_logs
  -- ALOCA++ Audit Fields
  ADD COLUMN IF NOT EXISTS logged_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS logged_by_name text,
  ADD COLUMN IF NOT EXISTS logged_by_role text,
  -- Soft Delete Fields
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.employees(id);

-- 2. EQUIPMENT TICKETS
ALTER TABLE public.equipment_tickets
  -- ALOCA++ Audit Fields
  ADD COLUMN IF NOT EXISTS logged_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS logged_by_name text,
  ADD COLUMN IF NOT EXISTS logged_by_role text,
  -- Soft Delete Fields
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.employees(id);

-- 3. DOCUMENTS / SOPS
ALTER TABLE public.documents
  -- Approval System
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending_review', -- pending_review, approved, rejected
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS version_history jsonb DEFAULT '[]'::jsonb,
  
  -- Soft Delete Fields
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.employees(id);


-- 4. ENABLE SUPABASE REALTIME (WebSockets)
-- Ensure these tables broadcast changes to the clients instantly

ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calibration_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;

-- Notify postgREST to reload the schema cache so the API picks up the new columns
NOTIFY pgrst, 'reload schema';
