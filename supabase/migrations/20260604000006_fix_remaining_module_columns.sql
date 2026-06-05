-- Fix remaining module column gaps found in full cross-module audit

-- Fix 1: batch_stage_downstream missing columns that DownstreamPanel saves
ALTER TABLE batch_stage_downstream
  ADD COLUMN IF NOT EXISTS fill_weight_g   numeric,
  ADD COLUMN IF NOT EXISTS units_produced  integer;

-- Fix 2: equipment table missing IQ/OQ/PQ validation document URLs (A-48)
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS iq_doc_url text,
  ADD COLUMN IF NOT EXISTS oq_doc_url text,
  ADD COLUMN IF NOT EXISTS pq_doc_url text;

-- Fix 3: batch_flask_rejection_record missing batch_id FK
-- RejectionPanel always sent batch_id but it wasn't in the table schema
ALTER TABLE batch_flask_rejection_record
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES batches(id) ON DELETE CASCADE;
