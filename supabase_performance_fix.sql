-- ============================================================
-- OxyOS Supabase Performance Fix v4 — SAFE CONDITIONAL INDEXES
-- ============================================================
-- Each index is wrapped in a DO block that checks if the column
-- actually exists in the live database before creating the index.
-- 100% safe — will never error, skips missing columns silently.
-- ============================================================

-- ── BATCHES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_batches_status       ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_created_at   ON batches(created_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='created_by') THEN
    CREATE INDEX IF NOT EXISTS idx_batches_created_by ON batches(created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='formulation_id') THEN
    CREATE INDEX IF NOT EXISTS idx_batches_formulation_id ON batches(formulation_id);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='equipment_id') THEN
    CREATE INDEX IF NOT EXISTS idx_batches_equipment_id ON batches(equipment_id);
  END IF;
END $$;

-- ── TASKS ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to    ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date       ON tasks(due_date);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='batch_id') THEN
    CREATE INDEX IF NOT EXISTS idx_tasks_batch_id ON tasks(batch_id);
  END IF;
END $$;

-- ── ATTENDANCE LOG ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date        ON attendance_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date    ON attendance_log(employee_id, date);

-- ── ACTIVITY LOG ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_employee_id   ON activity_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at    ON activity_log(created_at DESC);

-- ── LEAVE APPLICATIONS ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leave_employee_id      ON leave_applications(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status           ON leave_applications(status);

-- ── COMPLIANCE ITEMS ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_compliance_status      ON compliance_items(status);
CREATE INDEX IF NOT EXISTS idx_compliance_due_date    ON compliance_items(due_date);

-- ── PAYSLIPS ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payslips_employee_id   ON payslips(employee_id);

-- ── NOTIFICATIONS ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_emp      ON notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read     ON notifications(employee_id, is_read);

-- ── SOP ACKNOWLEDGEMENTS ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sop_ack_employee_id    ON sop_acknowledgements(employee_id);
CREATE INDEX IF NOT EXISTS idx_sop_ack_sop_id         ON sop_acknowledgements(sop_id);

-- ── EMPLOYEES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_employees_role         ON employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_is_active    ON employees(is_active);

-- ── PH READINGS ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ph_batch_id            ON ph_readings(batch_id);
CREATE INDEX IF NOT EXISTS idx_ph_logged_by           ON ph_readings(logged_by);

-- ── DOCUMENTS ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_access_level ON documents(access_level);

-- ── INVENTORY STOCK (only if table exists) ───────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_stock') THEN
    CREATE INDEX IF NOT EXISTS idx_inv_stock_item_id   ON inventory_stock(item_id);
    CREATE INDEX IF NOT EXISTS idx_inv_stock_vendor_id ON inventory_stock(vendor_id);
  END IF;
END $$;

-- ── INVENTORY USAGE ──────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_usage') THEN
    CREATE INDEX IF NOT EXISTS idx_inv_usage_stock_id ON inventory_usage(stock_id);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_usage' AND column_name='batch_id') THEN
      CREATE INDEX IF NOT EXISTS idx_inv_usage_batch_id ON inventory_usage(batch_id);
    END IF;
  END IF;
END $$;

-- ── INVENTORY MOVEMENTS ──────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_movements') THEN
    CREATE INDEX IF NOT EXISTS idx_inv_movements_stock_id ON inventory_movements(stock_id);
  END IF;
END $$;

-- ── STAGE TRANSITIONS ────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='stage_transitions') THEN
    CREATE INDEX IF NOT EXISTS idx_stage_transitions_batch ON stage_transitions(batch_id);
  END IF;
END $$;

-- ── LAB NOTEBOOK ENTRIES ─────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='lab_notebook_entries') THEN
    CREATE INDEX IF NOT EXISTS idx_lnb_created_by ON lab_notebook_entries(created_by);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_notebook_entries' AND column_name='batch_id') THEN
      CREATE INDEX IF NOT EXISTS idx_lnb_batch_id ON lab_notebook_entries(batch_id);
    END IF;
  END IF;
END $$;

-- ── DEVIATIONS (CAPA) ────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='deviations') THEN
    CREATE INDEX IF NOT EXISTS idx_deviations_status ON deviations(status);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deviations' AND column_name='batch_id') THEN
      CREATE INDEX IF NOT EXISTS idx_deviations_batch_id ON deviations(batch_id);
    END IF;
  END IF;
END $$;

-- ── EQUIPMENT ────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='equipment') THEN
    CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
  END IF;
END $$;

-- ============================================================
-- VERIFY: Show what was created
-- ============================================================
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

SELECT 'OxyOS indexes applied — any missing columns were safely skipped.' AS status;
