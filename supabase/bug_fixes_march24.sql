-- ============================================================
-- BUG FIX MIGRATION — March 24, 2026
-- Run this in your Supabase SQL Editor to fix live errors
-- ============================================================

-- FIX 1: Vendor address column missing in schema cache error
-- The vendors table was created with contact_info JSONB, but the
-- UI sends individual fields. This adds separate flat columns.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS lead_time TEXT;

-- FIX 2: Tasks table — ensure assigned_by references employees not auth.users
-- This prevents the FK constraint key error when assigning tasks.
-- If your tasks table currently has assigned_by referencing auth.users:
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assigned_by_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_by_fkey 
  FOREIGN KEY (assigned_by) REFERENCES employees(id) ON DELETE SET NULL;

-- FIX 3: Ensure proof_url column exists on tasks table (for task completion upload)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- FIX 4: Ensure photo_url column exists on attendance_log (for selfie storage)
ALTER TABLE attendance_log ADD COLUMN IF NOT EXISTS photo_url TEXT;
