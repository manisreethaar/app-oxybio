-- ============================================
-- STEP 1: Create released_employee_codes table
-- ============================================
CREATE TABLE IF NOT EXISTS released_employee_codes (
  id SERIAL PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  released_at TIMESTAMPTZ DEFAULT NOW(),
  released_by UUID,
  reason TEXT DEFAULT 'designation_change'
);

CREATE INDEX IF NOT EXISTS idx_released_codes_code ON released_employee_codes(employee_code);

-- ============================================
-- STEP 2: Release all existing intern codes (blocks them from reuse)
-- ============================================
INSERT INTO released_employee_codes (employee_code, reason)
SELECT employee_code, 'manual_reassignment'
FROM employees
WHERE role IN ('intern', 'research_intern') 
  AND is_active = true 
  AND employee_code IS NOT NULL
ON CONFLICT (employee_code) DO NOTHING;

-- ============================================
-- STEP 3: Clear old codes and assign fresh 001-004 to all interns
-- ============================================
DO $$
DECLARE
    intern_record RECORD;
    counter INT := 1;
BEGIN
    FOR intern_record IN 
        SELECT id FROM employees 
        WHERE role IN ('intern', 'research_intern') 
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 4
    LOOP
        UPDATE employees 
        SET employee_code = 'O2B-IN-' || LPAD(counter::TEXT, 3, '0')
        WHERE id = intern_record.id;
        counter := counter + 1;
    END LOOP;
END $$;

-- ============================================
-- STEP 4: Verify the changes
-- ============================================
SELECT full_name, role, employee_code 
FROM employees 
WHERE role IN ('intern', 'research_intern') 
  AND is_active = true
ORDER BY employee_code;
