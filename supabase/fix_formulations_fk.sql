-- ============================================================
-- FIX: Allow Deletion of Parent Recipes (Base Versions)
-- ============================================================

-- Drop the strict foreign key on base_version_id
ALTER TABLE formulations 
  DROP CONSTRAINT IF EXISTS formulations_base_version_id_fkey;

-- Re-add it with ON DELETE SET NULL, meaning if V1 is deleted,
-- V2's base_version_id just becomes null (it becomes a standalone recipe)
-- instead of blocking the deletion and crashing the UI.
ALTER TABLE formulations 
  ADD CONSTRAINT formulations_base_version_id_fkey 
  FOREIGN KEY (base_version_id) 
  REFERENCES formulations(id) 
  ON DELETE SET NULL;
