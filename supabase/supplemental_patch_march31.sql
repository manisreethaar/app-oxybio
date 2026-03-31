-- ============================================================
-- OxyOS SUPPLEMENTAL PATCH (March 31, 2026)
-- Run this in your Supabase SQL Editor AFTER final_schema_patch_march31.sql
-- Safe to re-run (all statements use IF NOT EXISTS / DO blocks).
-- ============================================================

-- 1. FORMULATIONS TABLE — Missing workflow columns
--    The API uses status, approved_by, approved_at, rejection_reason.
--    Only 'status' and 'rejection_reason' were previously added via other scripts.
--    approved_by and approved_at were NEVER added — this will break the Approve button
--    and the "Approved by {name}" display on recipe cards.

ALTER TABLE formulations
  ADD COLUMN IF NOT EXISTS status          TEXT    DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS approved_by     UUID    REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT   DEFAULT NULL;

-- Update legacy 'active' status values to 'Draft' for consistency
UPDATE formulations SET status = 'Draft' WHERE status = 'active';

-- Allow formulations UPDATE (needed for approve/reject/status changes).
-- Without this, PATCH calls will silently fail even for admins.
DROP POLICY IF EXISTS "Staff can update formulations" ON public.formulations;
CREATE POLICY "Staff can update formulations"
  ON public.formulations FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow formulations DELETE (needed for trash icon).
DROP POLICY IF EXISTS "Staff can delete own formulations" ON public.formulations;
CREATE POLICY "Staff can delete own formulations"
  ON public.formulations FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 2. INVENTORY ITEMS — preferred_supplier FK column
--    The vendor delete fix relies on this column existing.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS preferred_supplier  UUID  REFERENCES vendors(id),
  ADD COLUMN IF NOT EXISTS sub_category        TEXT,
  ADD COLUMN IF NOT EXISTS storage_condition   TEXT  DEFAULT 'Room Temperature',
  ADD COLUMN IF NOT EXISTS hazardous           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cold_chain_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coa_required        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allergen            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS organic_certified   TEXT,
  ADD COLUMN IF NOT EXISTS item_code           TEXT;

-- 3. INVENTORY STOCK — extra tracking columns used by the UI
ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS purchase_order_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_ref           TEXT,
  ADD COLUMN IF NOT EXISTS condition_on_arrival  TEXT DEFAULT 'Good Condition',
  ADD COLUMN IF NOT EXISTS notes                 TEXT,
  ADD COLUMN IF NOT EXISTS sds_url               TEXT,
  ADD COLUMN IF NOT EXISTS coa_url               TEXT,
  ADD COLUMN IF NOT EXISTS mispunch_status        TEXT;

-- Allow inventory_stock UPDATE (needed for quantity updates when stock is issued)
DROP POLICY IF EXISTS "Staff can update stock" ON public.inventory_stock;
CREATE POLICY "Staff can update stock"
  ON public.inventory_stock FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Allow inventory_items INSERT for all staff
DROP POLICY IF EXISTS "Staff can insert items" ON public.inventory_items;
CREATE POLICY "Staff can insert items"
  ON public.inventory_items FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow inventory_items UPDATE (for edit and preferred_supplier nulling on vendor delete)
DROP POLICY IF EXISTS "Staff can update items" ON public.inventory_items;
CREATE POLICY "Staff can update items"
  ON public.inventory_items FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Allow inventory_items DELETE (for item registry delete)
DROP POLICY IF EXISTS "Staff can delete items" ON public.inventory_items;
CREATE POLICY "Staff can delete items"
  ON public.inventory_items FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Allow vendors INSERT/UPDATE/DELETE (for vendor management)
DROP POLICY IF EXISTS "Staff can insert vendors" ON public.vendors;
CREATE POLICY "Staff can insert vendors"
  ON public.vendors FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can update vendors" ON public.vendors;
CREATE POLICY "Staff can update vendors"
  ON public.vendors FOR UPDATE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can delete vendors" ON public.vendors;
CREATE POLICY "Staff can delete vendors"
  ON public.vendors FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 4. ATTENDANCE_LOG — UPDATE policy (needed for mispunch approval and admin corrections)
DROP POLICY IF EXISTS "Admins can update attendance" ON public.attendance_log;
CREATE POLICY "Admins can update attendance"
  ON public.attendance_log FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('admin','ceo','cto'))
    OR auth.uid() = employee_id
  );

-- ============================================================
-- DONE. All supplemental columns and RLS policies are applied.
-- ============================================================
