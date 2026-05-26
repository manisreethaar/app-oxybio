-- Cell Bank + automatic LNB workflow support.
-- This migration matches the existing /research/cell-bank module and LNB sync helpers.

ALTER TABLE public.lab_notebook_entries
  ADD COLUMN IF NOT EXISTS stage_snapshots JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cell_bank_preparation_id UUID;

CREATE INDEX IF NOT EXISTS idx_lnb_cell_bank_preparation_id
  ON public.lab_notebook_entries(cell_bank_preparation_id);

CREATE TABLE IF NOT EXISTS public.cell_bank_strains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'Other',
  accession_number TEXT,
  isolation_source TEXT,
  received_date DATE,
  taxonomy TEXT,
  strain_short_code TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cell_bank_preparations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strain_id UUID NOT NULL REFERENCES public.cell_bank_strains(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.cell_bank_preparations(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  prep_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'In Progress',
  passage_number INTEGER,
  step_data JSONB DEFAULT '{}',
  vial_count INTEGER DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES public.employees(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cell_bank_vials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id UUID NOT NULL REFERENCES public.cell_bank_preparations(id) ON DELETE CASCADE,
  vial_code TEXT NOT NULL UNIQUE,
  storage_temp TEXT,
  freezer_id TEXT,
  rack TEXT,
  box TEXT,
  position TEXT,
  status TEXT NOT NULL DEFAULT 'Available',
  used_in_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cell_bank_vial_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vial_id UUID NOT NULL REFERENCES public.cell_bank_vials(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  flask_id UUID REFERENCES public.batch_flasks(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES public.employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lab_notebook_entries
  DROP CONSTRAINT IF EXISTS lab_notebook_entries_cell_bank_preparation_id_fkey;

ALTER TABLE public.lab_notebook_entries
  ADD CONSTRAINT lab_notebook_entries_cell_bank_preparation_id_fkey
  FOREIGN KEY (cell_bank_preparation_id)
  REFERENCES public.cell_bank_preparations(id)
  ON DELETE SET NULL;

ALTER TABLE public.batch_flask_inoculations
  ADD COLUMN IF NOT EXISTS inoculum_source_type TEXT,
  ADD COLUMN IF NOT EXISTS cell_bank_vial_id UUID REFERENCES public.cell_bank_vials(id) ON DELETE SET NULL;

ALTER TABLE public.sample_incubation_records
  ADD COLUMN IF NOT EXISTS cell_bank_preparation_id UUID REFERENCES public.cell_bank_preparations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS colony_count NUMERIC,
  ADD COLUMN IF NOT EXISTS cfu_per_ml NUMERIC,
  ADD COLUMN IF NOT EXISTS media_used TEXT;

CREATE INDEX IF NOT EXISTS idx_cell_bank_preparations_strain_id
  ON public.cell_bank_preparations(strain_id);

CREATE INDEX IF NOT EXISTS idx_cell_bank_vials_preparation_status
  ON public.cell_bank_vials(preparation_id, status);

CREATE INDEX IF NOT EXISTS idx_cell_bank_vial_logs_vial_id
  ON public.cell_bank_vial_logs(vial_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sample_incubation_cell_bank_preparation_id
  ON public.sample_incubation_records(cell_bank_preparation_id);

ALTER TABLE public.cell_bank_strains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cell_bank_preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cell_bank_vials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cell_bank_vial_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cbs_auth_all ON public.cell_bank_strains;
CREATE POLICY cbs_auth_all ON public.cell_bank_strains
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS cbp_auth_all ON public.cell_bank_preparations;
CREATE POLICY cbp_auth_all ON public.cell_bank_preparations
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS cbv_auth_all ON public.cell_bank_vials;
CREATE POLICY cbv_auth_all ON public.cell_bank_vials
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS cbvl_auth_all ON public.cell_bank_vial_logs;
CREATE POLICY cbvl_auth_all ON public.cell_bank_vial_logs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
