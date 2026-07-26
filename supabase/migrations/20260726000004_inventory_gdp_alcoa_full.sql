-- Inventory Module — GDP / ALCOA++ Remediation
--
-- Most of the generic "Attributable"/"Contemporaneous"/"Original" gaps
-- (updated_by, updated_at, the system_audit_logs trigger) are already
-- covered app-wide by 20260726000000_global_alcoa_gdp_remediation.sql,
-- which loops over every public table including inventory_stock,
-- inventory_items and vendors. This migration only adds what that one
-- doesn't: a soft-delete column for vendors.
--
-- Enduring — vendors had no soft-delete column at all, so removing a
-- vendor was a hard, unrecoverable DELETE (see the new
-- /api/inventory/vendors route, which now archives instead of deleting).
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES employees(id);
