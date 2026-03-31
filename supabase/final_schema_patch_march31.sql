-- ============================================================
-- OxyOS FINAL SCHEMA PATCH (March 31, 2026)
-- Run this ONCE in your Supabase SQL Editor.
-- Safe to re-run (all statements use IF NOT EXISTS).
-- ============================================================

-- 1. Leave balance columns on employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS casual_leave_balance  INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS medical_leave_balance INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS earned_leave_balance  INTEGER DEFAULT 15;

-- 2. Push notification subscription
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS push_subscription JSONB DEFAULT NULL;

-- 3. Employee profile data
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS designation              TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth            DATE,
  ADD COLUMN IF NOT EXISTS address                  TEXT,
  ADD COLUMN IF NOT EXISTS blood_group              TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name   TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact        TEXT,
  ADD COLUMN IF NOT EXISTS photo_url                TEXT;

-- 4. Mispunch columns on attendance_log
ALTER TABLE attendance_log
  ADD COLUMN IF NOT EXISTS mispunch_status            TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mispunch_requested_hours   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mispunch_reason            TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mispunch_remark            TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes                      TEXT    DEFAULT NULL;

-- 5. Task management columns
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS progress_percentage   INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_logs         JSONB       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_acknowledged       BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS acknowledged_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS logged_minutes        INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_started_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_personal_reminder  BOOLEAN     DEFAULT FALSE;

-- 6. Leave applications — admin review columns
ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS admin_comment    TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by      UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS reviewed_at      TIMESTAMPTZ;

-- 7. Performance indexes for leave & attendance queries
CREATE INDEX IF NOT EXISTS idx_leave_emp_status_date
  ON leave_applications(employee_id, status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date
  ON attendance_log(employee_id, date);

-- 8. Activity log severity column
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'normal';

-- 9. SOP acknowledgement columns
ALTER TABLE sop_acknowledgements
  ADD COLUMN IF NOT EXISTS signature_text TEXT,
  ADD COLUMN IF NOT EXISTS ip_address     TEXT,
  ADD COLUMN IF NOT EXISTS user_agent     TEXT;

-- 10. Batch linkage columns
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'media_prep',
  ADD COLUMN IF NOT EXISTS process_flow  JSONB;

-- ============================================================
-- DONE. All OxyOS backend tables are now schema-complete.
-- ============================================================
