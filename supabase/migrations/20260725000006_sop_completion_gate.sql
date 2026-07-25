-- SOP completion gate: link bioprocess experiments and lab notebook entries to sop_library
-- tasks.sop_id already exists (see 20260525000001_unified_data_model.sql)

ALTER TABLE public.bioprocess_experiments
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES public.sop_library(id);

-- Proper link array, replacing the free-text sop_references going forward.
-- sop_references is left in place for historical entries; new entries use sop_ids.
ALTER TABLE public.lab_notebook_entries
  ADD COLUMN IF NOT EXISTS sop_ids UUID[] DEFAULT '{}';
