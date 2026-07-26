-- Update the generic update_record_with_reason to optionally check the PIN using the existing verify_pin function
CREATE OR REPLACE FUNCTION update_record_with_reason(
  target_table text,
  record_id uuid,
  payload jsonb,
  reason_text text,
  esignature_pin text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  k text;
  v text;
  set_parts text[] := '{}';
  query text;
  is_valid boolean;
BEGIN
  -- If esignature_pin is provided, verify it against the hashed pin in employees
  IF esignature_pin IS NOT NULL THEN
    is_valid := verify_pin(auth.uid(), esignature_pin);
    IF NOT is_valid THEN
      RAISE EXCEPTION 'Invalid E-Signature PIN or PIN not set.';
    END IF;
  END IF;

  -- Set the transaction-scoped audit reason (read by audit_log_trigger_func)
  PERFORM set_config('app.audit_reason', reason_text, true);
  
  -- Dynamically build the UPDATE SET clause
  FOR k, v IN SELECT * FROM jsonb_each_text(payload) LOOP
    IF v IS NULL THEN
      set_parts := array_append(set_parts, format('%I = NULL', k));
    ELSE
      set_parts := array_append(set_parts, format('%I = %L', k, v));
    END IF;
  END LOOP;

  -- Execute dynamic update if there are fields to update
  IF array_length(set_parts, 1) > 0 THEN
    query := format('UPDATE %I SET %s WHERE id = %L', target_table, array_to_string(set_parts, ', '), record_id);
    EXECUTE query;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
