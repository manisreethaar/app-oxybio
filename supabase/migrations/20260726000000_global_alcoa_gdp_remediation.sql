-- Phase 6: Global ALCOA++ and GDP Remediation
-- This script dynamically adds missing ALCOA++ fields and audit triggers to all public tables.

-- 1. Create generic trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update the audit_log_trigger_func to fallback to auth.uid()
CREATE OR REPLACE FUNCTION audit_log_trigger_func()
RETURNS trigger AS $$
DECLARE
    emp_id uuid;
    audit_reason text;
BEGIN
    -- Read the transaction-scoped audit reason (returns NULL if not set)
    BEGIN
        audit_reason := current_setting('app.audit_reason', true);
    EXCEPTION WHEN OTHERS THEN
        audit_reason := NULL;
    END;

    -- Extract employee ID
    BEGIN
        IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
            IF row_to_json(NEW) ? 'updated_by' THEN
                emp_id := (row_to_json(NEW)->>'updated_by')::uuid;
            ELSIF row_to_json(NEW) ? 'created_by' THEN
                emp_id := (row_to_json(NEW)->>'created_by')::uuid;
            ELSIF row_to_json(NEW) ? 'operator_id' THEN
                emp_id := (row_to_json(NEW)->>'operator_id')::uuid;
            ELSIF row_to_json(NEW) ? 'logged_by' THEN
                emp_id := (row_to_json(NEW)->>'logged_by')::uuid;
            ELSIF row_to_json(NEW) ? 'tested_by' THEN
                emp_id := (row_to_json(NEW)->>'tested_by')::uuid;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        emp_id := NULL;
    END;

    -- Fallback to auth.uid() if no attribution column was found or it was null
    IF emp_id IS NULL THEN
        BEGIN
            emp_id := auth.uid();
        EXCEPTION WHEN OTHERS THEN
            emp_id := NULL;
        END;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, new_data, changed_by, reason)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', row_to_json(NEW)::jsonb, emp_id, audit_reason);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, old_data, new_data, changed_by, reason)
        VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, emp_id, audit_reason);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO system_audit_logs (table_name, record_id, action, old_data, reason)
        VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', row_to_json(OLD)::jsonb, audit_reason);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Dynamically add missing columns and triggers to all public tables
DO $$
DECLARE
    t_name text;
    has_col boolean;
    has_attr boolean;
BEGIN
    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('system_audit_logs', 'schema_migrations', 'spatial_ref_sys')
    LOOP
        -- A. Check and Add created_at
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = t_name AND column_name = 'created_at'
        ) INTO has_col;
        
        IF NOT has_col THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();', t_name);
        END IF;

        -- B. Check and Add updated_at
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = t_name AND (column_name = 'updated_at' OR column_name = 'modified_at')
        ) INTO has_col;
        
        IF NOT has_col THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();', t_name);
        END IF;
        
        -- C. Attach update_updated_at_column trigger
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at_%I ON %I;', t_name, t_name);
        EXECUTE format('CREATE TRIGGER trg_set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t_name, t_name);

        -- D. Check for Attribution columns (created_by, logged_by, etc.)
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = t_name AND column_name IN (
                'created_by', 'author_id', 'employee_id', 'user_id', 'assigned_to', 
                'auditor_id', 'sampled_by', 'logged_by', 'recorded_by', 'released_by', 
                'rejected_by', 'verified_by', 'supervisor_id', 'operator_id', 'owner_id'
            )
        ) INTO has_attr;
        
        IF NOT has_attr THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN created_by UUID;', t_name);
        END IF;
        
        -- E. Check and Add updated_by
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = t_name AND column_name IN (
                'updated_by', 'modified_by', 'edited_by'
            )
        ) INTO has_attr;
        
        IF NOT has_attr THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN updated_by UUID;', t_name);
        END IF;

        -- F. Attach ALCOA Audit Trigger
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I;', t_name, t_name);
        -- Only attach if table has an 'id' column for record_id since our trigger assumes NEW.id::text exists.
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = t_name AND column_name = 'id'
        ) INTO has_col;
        
        IF has_col THEN
            EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_func();', t_name, t_name);
        END IF;

    END LOOP;
END;
$$;
