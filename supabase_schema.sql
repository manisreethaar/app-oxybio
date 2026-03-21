-- OxyOS Supabase Schema Definition
-- Run this entire script in the Supabase SQL Editor

-- 1. Enable pgcrypto for UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create Tables

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT CHECK (role IN ('admin', 'staff', 'intern')),
    department TEXT CHECK (department IN ('RnD', 'Production', 'Management')),
    phone TEXT,
    joined_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE leave_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    leave_type TEXT CHECK (leave_type IN ('Casual', 'Sick', 'Earned')),
    start_date DATE,
    end_date DATE,
    total_days INTEGER,
    reason TEXT,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_comment TEXT,
    reviewed_by UUID REFERENCES employees(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE attendance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    date DATE,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    total_hours NUMERIC,
    notes TEXT,
    manual_entry BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES employees(id),
    assigned_by UUID REFERENCES employees(id),
    due_date DATE,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT CHECK (status IN ('open', 'in-progress', 'done', 'cancelled')),
    completion_note TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT UNIQUE,
    variant TEXT CHECK (variant IN ('Sweetened', 'Unsweetened')),
    start_time TIMESTAMPTZ,
    volume_litres NUMERIC,
    probiotic_strain TEXT,
    status TEXT CHECK (status IN ('fermenting', 'qc-hold', 'released', 'rejected', 'deviation')),
    notes TEXT,
    released_by UUID REFERENCES employees(id),
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    log_date DATE,
    batch_id TEXT REFERENCES batches(batch_id),
    activity_description TEXT NOT NULL,
    start_time TIME,
    end_time TIME,
    issue_observed BOOLEAN DEFAULT false,
    issue_description TEXT,
    founder_comment TEXT,
    reviewed_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ph_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES batches(id),
    logged_by UUID REFERENCES employees(id),
    ph_value NUMERIC(4,2),
    time_elapsed_hours NUMERIC,
    is_deviation BOOLEAN DEFAULT false,
    deviation_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES employees(id),
    acknowledged_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE compliance_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT CHECK (category IN ('FSSAI', 'TIIC', 'PF', 'ESI', 'Patent', 'NABL', 'Equipment', 'Lease', 'Other')),
    due_date DATE,
    responsible_person UUID REFERENCES employees(id),
    status TEXT CHECK (status IN ('upcoming', 'in-progress', 'done', 'overdue')),
    document_link TEXT,
    notes TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence TEXT CHECK (recurrence IN ('monthly', 'annual', 'weekly', NULL)),
    reminder_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT CHECK (category IN ('Legal', 'HR', 'Regulatory', 'Finance', 'IP', 'QC', 'SOP')),
    file_url TEXT,
    file_name TEXT,
    uploaded_by UUID REFERENCES employees(id),
    version TEXT,
    effective_date DATE,
    expiry_date DATE,
    access_level TEXT CHECK (access_level IN ('all-staff', 'admin-only')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    month TEXT,
    year INTEGER,
    gross_salary NUMERIC,
    pf_deduction NUMERIC,
    esi_deduction NUMERIC,
    net_salary NUMERIC,
    payslip_url TEXT,
    uploaded_by UUID REFERENCES employees(id),
    uploaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sop_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sop_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT CHECK (category IN ('Fermentation', 'QC', 'Sanitation', 'ColdChain', 'Packaging', 'Safety')),
    version TEXT,
    effective_date DATE,
    approved_by UUID REFERENCES employees(id),
    document_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sop_acknowledgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sop_id UUID REFERENCES sop_library(id),
    employee_id UUID REFERENCES employees(id),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    title TEXT,
    message TEXT,
    type TEXT CHECK (type IN ('info', 'warning', 'alert', 'success')),
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ph_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper Function: Check if User is Admin
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM employees 
    WHERE employees.email = auth.jwt()->>'email' AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper Function: Check User's internal UUID
CREATE OR REPLACE FUNCTION auth_employee_id() RETURNS UUID AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT id INTO emp_id FROM employees WHERE email = auth.jwt()->>'email';
  RETURN emp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Admin Policy: Admins can do everything
CREATE POLICY admin_all_employees ON employees FOR ALL USING (is_admin());
CREATE POLICY admin_all_leaves ON leave_applications FOR ALL USING (is_admin());
CREATE POLICY admin_all_attendance ON attendance_log FOR ALL USING (is_admin());
CREATE POLICY admin_all_tasks ON tasks FOR ALL USING (is_admin());
CREATE POLICY admin_all_activity ON activity_log FOR ALL USING (is_admin());
CREATE POLICY admin_all_batches ON batches FOR ALL USING (is_admin());
CREATE POLICY admin_all_ph ON ph_readings FOR ALL USING (is_admin());
CREATE POLICY admin_all_compliance ON compliance_items FOR ALL USING (is_admin());
CREATE POLICY admin_all_documents ON documents FOR ALL USING (is_admin());
CREATE POLICY admin_all_payslips ON payslips FOR ALL USING (is_admin());
CREATE POLICY admin_all_sops ON sop_library FOR ALL USING (is_admin());
CREATE POLICY admin_all_sop_acks ON sop_acknowledgements FOR ALL USING (is_admin());
CREATE POLICY admin_all_notifications ON notifications FOR ALL USING (is_admin());

-- Employee Policy: Read own profile
CREATE POLICY emp_read_self ON employees FOR SELECT USING (id = auth_employee_id());

-- Staff Specific Policies
CREATE POLICY staff_select_leave ON leave_applications FOR SELECT USING (employee_id = auth_employee_id());
CREATE POLICY staff_insert_leave ON leave_applications FOR INSERT WITH CHECK (employee_id = auth_employee_id());

CREATE POLICY staff_select_attendance ON attendance_log FOR SELECT USING (employee_id = auth_employee_id());
CREATE POLICY staff_insert_attendance ON attendance_log FOR INSERT WITH CHECK (employee_id = auth_employee_id());
CREATE POLICY staff_update_attendance ON attendance_log FOR UPDATE USING (employee_id = auth_employee_id());

CREATE POLICY staff_select_tasks ON tasks FOR SELECT USING (assigned_to = auth_employee_id());
CREATE POLICY staff_update_tasks ON tasks FOR UPDATE USING (assigned_to = auth_employee_id());

CREATE POLICY staff_select_activity ON activity_log FOR SELECT USING (employee_id = auth_employee_id());
CREATE POLICY staff_insert_activity ON activity_log FOR INSERT WITH CHECK (employee_id = auth_employee_id());

CREATE POLICY staff_select_batches ON batches FOR SELECT USING (true); -- everyone sees batches

CREATE POLICY staff_insert_ph ON ph_readings FOR INSERT WITH CHECK (logged_by = auth_employee_id());
CREATE POLICY staff_select_ph ON ph_readings FOR SELECT USING (true);

CREATE POLICY staff_select_docs ON documents FOR SELECT USING (access_level = 'all-staff');
CREATE POLICY staff_select_sops ON sop_library FOR SELECT USING (true);
CREATE POLICY staff_insert_sop_acks ON sop_acknowledgements FOR INSERT WITH CHECK (employee_id = auth_employee_id());

CREATE POLICY staff_select_payslips ON payslips FOR SELECT USING (employee_id = auth_employee_id());
CREATE POLICY staff_select_notifications ON notifications FOR SELECT USING (employee_id = auth_employee_id());
CREATE POLICY staff_update_notifications ON notifications FOR UPDATE USING (employee_id = auth_employee_id());

-- 4. Triggers

-- Trigger 1: Auto-set is_deviation = true on ph_readings when ph_value < 4.2 OR ph_value > 4.5
CREATE OR REPLACE FUNCTION check_ph_deviation() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ph_value < 4.2 OR NEW.ph_value > 4.5 THEN
        NEW.is_deviation := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_ph_deviation
BEFORE INSERT OR UPDATE ON ph_readings
FOR EACH ROW EXECUTE FUNCTION check_ph_deviation();

-- Trigger 2: Auto-calculate total_hours in attendance_log when check_out_time is updated
CREATE OR REPLACE FUNCTION calc_total_hours() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_out_time IS NOT NULL AND NEW.check_in_time IS NOT NULL THEN
        NEW.total_hours := EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 3600;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_total_hours
BEFORE INSERT OR UPDATE ON attendance_log
FOR EACH ROW EXECUTE FUNCTION calc_total_hours();

-- Trigger 3: Auto-set status = overdue on compliance_items when due_date passes and status != done
-- Note: PostgreSQL triggers run on DML (insert/update), not time passage. 
-- For due_date passage, we'll need a cron job, but we'll add an update trigger here just in case.
CREATE OR REPLACE FUNCTION check_compliance_overdue() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != 'done' AND NEW.due_date < CURRENT_DATE THEN
        NEW.status := 'overdue';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_compliance_overdue
BEFORE INSERT OR UPDATE ON compliance_items
FOR EACH ROW EXECUTE FUNCTION check_compliance_overdue();
