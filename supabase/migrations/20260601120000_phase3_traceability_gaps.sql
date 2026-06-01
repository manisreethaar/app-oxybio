-- Phase 3: Traceability & Batch Audit gaps
-- G-19: pre-inoculation pH
ALTER TABLE batch_flask_inoculations
  ADD COLUMN IF NOT EXISTS pre_inocu_ph numeric;

-- G-20, G-21: LAF + contamination on lab bench samples
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS laf_cabinet_used      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contamination_incident boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contamination_details  text;

-- G-25, G-26: LNB version history + SOP references
ALTER TABLE lab_notebook_entries
  ADD COLUMN IF NOT EXISTS entry_version        integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_version_id  uuid REFERENCES lab_notebook_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sop_references       text[] DEFAULT '{}';
