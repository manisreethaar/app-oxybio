-- Phase 2: Electronic Signatures & Audit Logs (21 CFR Part 11)

-- 1. Enable pgcrypto for PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Add esignature_pin_hash to employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS esignature_pin_hash text;

-- 2a. RPC for verifying PIN
CREATE OR REPLACE FUNCTION verify_pin(user_id uuid, pin text)
RETURNS boolean AS $$
DECLARE
  hash text;
BEGIN
  SELECT esignature_pin_hash INTO hash FROM employees WHERE id = user_id;
  RETURN hash IS NOT NULL AND hash = crypt(pin, hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2b. RPC for setting PIN
CREATE OR REPLACE FUNCTION set_pin(user_id uuid, pin text)
RETURNS void AS $$
BEGIN
  UPDATE employees
  SET esignature_pin_hash = crypt(pin, gen_salt('bf', 8))
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create generic system_audit_logs table
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_name text NOT NULL,
    record_id text NOT NULL,
    action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_data jsonb,
    new_data jsonb,
    changed_by uuid REFERENCES employees(id),
    changed_at timestamptz DEFAULT now() NOT NULL,
    reason text -- optional, for e-signature justifications
);

-- Index for fast queries on audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON system_audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON system_audit_logs(changed_at);

-- Enable RLS on audit logs
ALTER TABLE system_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_audit_logs" ON system_audit_logs FOR ALL USING (is_admin());
CREATE POLICY "staff_read_audit_logs" ON system_audit_logs FOR SELECT USING (true);

-- 4. Generic Trigger Function for Audit Logging
CREATE OR REPLACE FUNCTION audit_log_trigger_func()
RETURNS trigger AS $$
DECLARE
    emp_id uuid;
BEGIN
    BEGIN
        IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
            -- Attempt to extract standard attribution columns
            BEGIN EXECUTE 'SELECT $1.updated_by' INTO emp_id USING NEW; EXCEPTION WHEN undefined_column THEN END;
            IF emp_id IS NULL THEN
                BEGIN EXECUTE 'SELECT $1.created_by' INTO emp_id USING NEW; EXCEPTION WHEN undefined_column THEN END;
            END IF;
            IF emp_id IS NULL THEN
                BEGIN EXECUTE 'SELECT $1.tested_by' INTO emp_id USING NEW; EXCEPTION WHEN undefined_column THEN END;
            END IF;
            IF emp_id IS NULL THEN
                BEGIN EXECUTE 'SELECT $1.registered_by' INTO emp_id USING NEW; EXCEPTION WHEN undefined_column THEN END;
            END IF;
        END IF;
    END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', row_to_json(NEW)::jsonb, emp_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, emp_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, old_data)
        VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', row_to_json(OLD)::jsonb);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach Triggers to Critical GMP Tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT unnest(ARRAY[
            'batch_flask_qc_tests',
            'equipment',
            'sop_library',
            'inventory_stock',
            'customer_complaints',
            'capa_actions',
            'deviations'
        ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I;', t, t);
        EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_func();', t, t);
    END LOOP;
END;
$$;
