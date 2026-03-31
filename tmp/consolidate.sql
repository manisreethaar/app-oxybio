DO $$ 
DECLARE 
    v_old_id UUID;
    v_new_id UUID;
BEGIN
    -- 1. Identify the New (Active) ID from the official email
    SELECT id INTO v_new_id FROM employees WHERE email = 'manisreethaar@gmail.com' LIMIT 1;
    
    -- 2. Identify the Old (Legacy) ID from the renamed email
    SELECT id INTO v_old_id FROM employees WHERE email LIKE 'legacy_profile_%' LIMIT 1;

    -- 3. Safety Check
    IF v_old_id IS NULL OR v_new_id IS NULL OR v_old_id = v_new_id THEN
        RAISE NOTICE 'Consolidation skipped: No old/new pair found or IDs already match.';
        RETURN;
    END IF;

    RAISE NOTICE 'Merging Legacy Profile (%) into Active Profile (%)', v_old_id, v_new_id;

    -- 4. Move all foreign key data
    -- Move Attendance
    UPDATE attendance_log SET employee_id = v_new_id WHERE employee_id = v_old_id;
    
    -- Move Tasks (Assigned & Created)
    UPDATE tasks SET assigned_to = v_new_id WHERE assigned_to = v_old_id;
    UPDATE tasks SET created_by = v_new_id WHERE created_by = v_old_id;
    
    -- Move Formulations (The one that blocked us earlier)
    UPDATE formulations SET approved_by = v_new_id WHERE approved_by = v_old_id;
    
    -- Move Lab Logs
    UPDATE lab_logs SET logged_by = v_new_id WHERE logged_by = v_old_id;
    
    -- Move Process Stage Transitions
    UPDATE stage_transitions SET changed_by = v_new_id WHERE changed_by = v_old_id;
    
    -- Move CAPA/Deviations
    UPDATE deviations SET reported_by = v_new_id WHERE reported_by = v_old_id;
    UPDATE investigations SET investigator_id = v_new_id WHERE investigator_id = v_old_id;
    UPDATE capa_actions SET verified_by = v_new_id WHERE verified_by = v_old_id;
    
    -- Move Inventory Usage
    UPDATE inventory_usage SET logged_by = v_new_id WHERE logged_by = v_old_id;
    
    -- Move Calibration Logs
    UPDATE calibration_logs SET logged_by = v_new_id WHERE logged_by = v_old_id;
    
    -- Move SOP Acknowledgements
    UPDATE sop_acknowledgements SET employee_id = v_new_id WHERE employee_id = v_old_id;

    -- 5. Copy any missing profile info from Old to New if New is blank
    UPDATE employees n
    SET 
        phone = COALESCE(n.phone, o.phone),
        address = COALESCE(n.address, o.address),
        date_of_birth = COALESCE(n.date_of_birth, o.date_of_birth),
        blood_group = COALESCE(n.blood_group, o.blood_group),
        joined_date = COALESCE(n.joined_date, o.joined_date),
        photo_url = COALESCE(n.photo_url, o.photo_url),
        designation = COALESCE(n.designation, o.designation),
        employee_code = COALESCE(n.employee_code, o.employee_code)
    FROM employees o
    WHERE n.id = v_new_id AND o.id = v_old_id;

    -- 6. Delete the legacy record
    DELETE FROM employees WHERE id = v_old_id;

    RAISE NOTICE 'SUCCESS: Profiles consolidated and legacy record removed.';
END $$;
