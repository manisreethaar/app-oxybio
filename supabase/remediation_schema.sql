-- Remediation Script: Restore Missing Formulations Table
-- Run this in the Supabase SQL Editor

-- 1. Create formulations table
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

-- 2. Ensure batches has the linking column
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='formulation_id') THEN
        ALTER TABLE public.batches ADD COLUMN formulation_id UUID REFERENCES public.formulations(id);
    END IF;
END $$;

-- 3. Enable RLS
ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Allow read formulations" ON public.formulations 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid()));

CREATE POLICY "Allow insert formulations" ON public.formulations 
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- 5. Comments for Documentation
COMMENT ON TABLE public.formulations IS 'Scientific recipe registry for product versioning and batch linkage.';
