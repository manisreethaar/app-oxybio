-- SOP completion gate: link tasks, bioprocess experiments, and lab notebook entries to sop_library
-- NOTE: tasks.sop_id was expected to already exist (per 20260525000001_unified_data_model.sql)
-- but was found missing from the live database when this migration was written, hence included here too.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES public.sop_library(id);

ALTER TABLE public.bioprocess_experiments
  ADD COLUMN IF NOT EXISTS sop_id UUID REFERENCES public.sop_library(id);

-- Proper link array, replacing the free-text sop_references going forward.
-- sop_references is left in place for historical entries; new entries use sop_ids.
ALTER TABLE public.lab_notebook_entries
  ADD COLUMN IF NOT EXISTS sop_ids UUID[] DEFAULT '{}';
