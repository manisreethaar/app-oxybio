-- Link Cell Bank strains/preparations back to Recipe Management.
-- Run after 20260526000002_cell_bank_lnb_workflow.sql.

ALTER TABLE public.cell_bank_strains
  ADD COLUMN IF NOT EXISTS formulation_id UUID REFERENCES public.formulations(id) ON DELETE SET NULL;

ALTER TABLE public.cell_bank_preparations
  ADD COLUMN IF NOT EXISTS formulation_id UUID REFERENCES public.formulations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cell_bank_strains_formulation_id
  ON public.cell_bank_strains(formulation_id);

CREATE INDEX IF NOT EXISTS idx_cell_bank_preparations_formulation_id
  ON public.cell_bank_preparations(formulation_id);
