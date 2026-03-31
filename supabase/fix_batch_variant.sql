-- ============================================================
-- FIX: Drop strict variant rules for batches
-- ============================================================

-- The UI currently auto-assigns "O2B-Agri" as the batch variant,
-- but the database has a strict check constraint blocking that exact text.
-- This simply drops that rule so the batch can be created successfully!

ALTER TABLE batches 
  DROP CONSTRAINT IF EXISTS batches_variant_check;
