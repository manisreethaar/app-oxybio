-- Baseline: the `employees` table has never been captured as a tracked
-- migration — it (and several other foundational tables) were created
-- directly against the live Supabase project outside supabase/migrations/,
-- so replaying this folder from an empty database fails immediately on the
-- first migration that references employees(id)
-- (20260402000001_add_released_employee_codes.sql).
--
-- This reconstructs employees from how the application actually reads and
-- writes it today (see context/AuthContext.js's PROFILE_SELECT plus the
-- admin invite/update/profile/payroll/push-notification/e-signature
-- routes), not from the original, long-superseded supabase_schema.sql
-- (whose role/department CHECK constraints no longer match the roles
-- actually in use — ceo/cto/admin/research_fellow/scientist/
-- research_intern/intern). No CHECK constraints are added here for the
-- same reason: guessing an exact allow-list wrong would be worse than
-- leaving it open.
--
-- CREATE TABLE IF NOT EXISTS makes this a no-op against the real project,
-- where the table already exists with whatever its true, evolved shape is.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  initials TEXT,
  role TEXT,
  department TEXT,
  designation TEXT,
  is_active BOOLEAN DEFAULT true,
  photo_url TEXT,
  employee_code TEXT,
  phone TEXT,
  address TEXT,
  blood_group TEXT,
  emergency_contact TEXT,
  emergency_contact_name TEXT,
  joined_date DATE,
  date_of_birth DATE,
  casual_leave_balance NUMERIC DEFAULT 0,
  medical_leave_balance NUMERIC DEFAULT 0,
  earned_leave_balance NUMERIC DEFAULT 0,
  comp_off_balance NUMERIC DEFAULT 0,
  base_salary NUMERIC,
  custom_permissions JSONB,
  push_subscription JSONB,
  esignature_pin_hash TEXT,
  verification_token TEXT,
  shift_id UUID,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employees' AND policyname = 'employees_auth_all'
  ) THEN
    CREATE POLICY employees_auth_all ON public.employees
      FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
