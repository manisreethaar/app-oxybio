-- Mispunch & Rejection Engine Migration

-- 1. Update attendance_log for Mispunch Workflow
ALTER TABLE attendance_log 
ADD COLUMN IF NOT EXISTS mispunch_status TEXT DEFAULT NULL, 
ADD COLUMN IF NOT EXISTS mispunch_requested_hours NUMERIC DEFAULT 0, 
ADD COLUMN IF NOT EXISTS mispunch_reason TEXT DEFAULT NULL, 
ADD COLUMN IF NOT EXISTS mispunch_remark TEXT DEFAULT NULL;

-- 2. Update leave_applications for Mandatory Rejection Remarks
ALTER TABLE leave_applications 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;

-- 3. Update formulations for Mandatory Rejection Remarks
ALTER TABLE formulations 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;

-- Add a comment to the attendance_log policies to ensure mispunch_status is readable
-- No changes needed to RLS as we already have admin_all policies.
