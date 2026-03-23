-- OxyOS Master Synchronization Script
-- This script synchronizes your Supabase database with the latest application features.
-- Run this in the Supabase SQL Editor.

-----------------------------------------------------------
-- 1. NEW TABLES: SCIENTIFIC & LOGISTICS ENGINES
-----------------------------------------------------------

-- Formulations (Scientific Version Control)
CREATE TABLE IF NOT EXISTS public.formulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    ingredients TEXT,
    notes TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES public.employees(id),
    base_version_id UUID REFERENCES public.formulations(id)
);

-- Lab Notebook (Digital LNB)
CREATE TABLE IF NOT EXISTS public.lab_notebook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    objective TEXT,
    methodology TEXT,
    observations TEXT,
    conclusions TEXT,
    status TEXT DEFAULT 'Draft', -- Draft, Submitted, Countersigned
    batch_id UUID REFERENCES public.batches(id),
    created_by UUID REFERENCES public.employees(id),
    countersigned_by UUID REFERENCES public.employees(id),
    countersigned_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Shelf Life Studies (Stability Testing)
CREATE TABLE IF NOT EXISTS public.shelf_life_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
    storage_condition TEXT,
    test_parameters JSONB, -- Array of strings
    status TEXT DEFAULT 'In Progress',
    created_by UUID REFERENCES public.employees(id),
    start_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Taste Panels (Research & Development)
CREATE TABLE IF NOT EXISTS public.taste_panels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_title TEXT NOT NULL,
    panelist_count INTEGER DEFAULT 0,
    sample_ids TEXT,
    test_criteria JSONB, 
    avg_score NUMERIC DEFAULT 0,
    scores JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-----------------------------------------------------------
-- 2. COLUMN UPGRADES: MISSING METADATA & INNOVATIONS
-----------------------------------------------------------

-- Employees: High-Fidelity Profile Data
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS push_subscription JSONB;

-- Batches: Core Linkage & Process Flows
DO $$ BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='formulation_id') THEN
        ALTER TABLE public.batches ADD COLUMN formulation_id UUID REFERENCES public.formulations(id);
    END IF;
END $$;
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'media_prep';
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS process_flow JSONB;

-- Activity Logs: Smart-Alerting
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'normal';

-- Tasks: Behavioral Automation
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_personal_reminder BOOLEAN DEFAULT FALSE;

-- SOPs: Clinical Signatures
ALTER TABLE public.sop_acknowledgements ADD COLUMN IF NOT EXISTS signature_text TEXT;
ALTER TABLE public.sop_acknowledgements ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.sop_acknowledgements ADD COLUMN IF NOT EXISTS user_agent TEXT;

-----------------------------------------------------------
-- 3. SECURITY: ENABLE RLS & POLICIES
-----------------------------------------------------------

ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_notebook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelf_life_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taste_panels ENABLE ROW LEVEL SECURITY;

-- Shared READ Policy for all employees
DROP POLICY IF EXISTS "Allow read formulations" ON public.formulations;
CREATE POLICY "Allow read formulations" ON public.formulations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow read lab_notebook" ON public.lab_notebook_entries;
CREATE POLICY "Allow read lab_notebook" ON public.lab_notebook_entries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow read shelf_life" ON public.shelf_life_studies;
CREATE POLICY "Allow read shelf_life" ON public.shelf_life_studies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow read taste_panels" ON public.taste_panels;
CREATE POLICY "Allow read taste_panels" ON public.taste_panels FOR SELECT USING (true);

-- Insert policies
DROP POLICY IF EXISTS "Allow insert formulations" ON public.formulations;
CREATE POLICY "Allow insert formulations" ON public.formulations FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Allow insert lab_notebook" ON public.lab_notebook_entries;
CREATE POLICY "Allow insert lab_notebook" ON public.lab_notebook_entries FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Allow insert shelf_life" ON public.shelf_life_studies;
CREATE POLICY "Allow insert shelf_life" ON public.shelf_life_studies FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Update policies
DROP POLICY IF EXISTS "Allow owner update lab_notebook" ON public.lab_notebook_entries;
CREATE POLICY "Allow owner update lab_notebook" ON public.lab_notebook_entries FOR UPDATE 
    USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);


-----------------------------------------------------------
-- 4. CLEANUP: TRIGGERS (Optional based on business logic)
-----------------------------------------------------------
-- (No specific triggers missing from audit, but can be added here if needed)

COMMENT ON TABLE public.formulations IS 'OxyOS Formula Engine: Scientific recipe versions.';
COMMENT ON TABLE public.lab_notebook_entries IS 'Clinical Lab Notebooks: Experiment tracking and signing.';
