-- FINAL OXYOS SCHEMA UNIFICATION
-- Run this in the Supabase SQL Editor to fix Digital ID Verification and Profile saves.

-- 1. Add ALL missing columns to employees table (Safe for existing ones)
ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS employee_code TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS push_subscription JSONB,
  ADD COLUMN IF NOT EXISTS verification_token TEXT DEFAULT gen_random_uuid()::text;

-- 2. Populate verification_token for anyone who doesn't have it
UPDATE employees 
SET verification_token = encode(digest(id::text || now()::text, 'sha256'), 'hex')
WHERE verification_token IS NULL;

-- 3. Ensure columns are readable by the public identifier logic (for verify page)
-- (Assumes you have already run the RLS remediation)
CREATE POLICY "Allow public verify read" ON employees 
FOR SELECT USING (true);

-- 4. Audit Log Fix for Batch IDs (Text vs UUID mismatch)
-- Ensures the activity log doesn't fail when referencing batches
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_batch_id_fkey;
