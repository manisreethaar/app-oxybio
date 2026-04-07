-- ============================================================
-- Security Fix: Enable RLS on 3 public tables flagged by linter
-- ============================================================

-- ── 1. app_settings ─────────────────────────────────────────
-- Stores operational thresholds (pH, temp). All authenticated
-- users read; only admin/ceo/cto can write.

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON app_settings;

CREATE POLICY "app_settings_select" ON app_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "app_settings_admin_write" ON app_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.email = auth.jwt()->>'email'
        AND employees.role IN ('admin', 'ceo', 'cto')
    )
  );

-- ── 2. released_employee_codes ───────────────────────────────
-- Internal table: tracks recycled employee codes after
-- designation changes. Only admins/ceo/cto should touch it.
-- No direct client-side access needed.

ALTER TABLE released_employee_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "released_codes_admin_only" ON released_employee_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.email = auth.jwt()->>'email'
        AND employees.role IN ('admin', 'ceo', 'cto')
    )
  );

-- ── 3. regulatory_milestones ─────────────────────────────────
-- Regulatory calendar items. All authenticated users can view;
-- only admin/ceo/cto can create, update, delete.

ALTER TABLE regulatory_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_milestones_select" ON regulatory_milestones
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "regulatory_milestones_admin_write" ON regulatory_milestones
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.email = auth.jwt()->>'email'
        AND employees.role IN ('admin', 'ceo', 'cto')
    )
  );

CREATE POLICY "regulatory_milestones_admin_update" ON regulatory_milestones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.email = auth.jwt()->>'email'
        AND employees.role IN ('admin', 'ceo', 'cto')
    )
  );

CREATE POLICY "regulatory_milestones_admin_delete" ON regulatory_milestones
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.email = auth.jwt()->>'email'
        AND employees.role IN ('admin', 'ceo', 'cto')
    )
  );
