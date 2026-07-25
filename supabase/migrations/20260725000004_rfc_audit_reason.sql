-- 1. Create an RPC function to safely set the audit reason for the current transaction
CREATE OR REPLACE FUNCTION set_audit_reason(reason_text text)
RETURNS void AS $$
BEGIN
  -- set_config(setting_name, new_value, is_local_to_transaction)
  PERFORM set_config('app.audit_reason', reason_text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update the audit_log_trigger_func to read this setting and inject it into the reason column
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
            -- Attempt to extract standard attribution columns
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

-- 3. Create specific RPCs for frontend to update locked records with a reason
CREATE OR REPLACE FUNCTION update_qc_test_with_reason(test_id uuid, payload jsonb, reason_text text)
RETURNS void AS $$
BEGIN
  -- Set transaction-level variable
  PERFORM set_config('app.audit_reason', reason_text, true);
  
  UPDATE batch_flask_qc_tests 
  SET 
    result_value = COALESCE(payload->>'result_value', result_value),
    pass_fail = COALESCE(payload->>'pass_fail', pass_fail),
    tested_by = COALESCE((payload->>'tested_by')::uuid, tested_by),
    tested_at = COALESCE((payload->>'tested_at')::timestamptz, tested_at)
  WHERE id = test_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
