-- Add IQ/OQ/PQ docs to equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS iq_doc_url TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS oq_doc_url TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS pq_doc_url TEXT;
