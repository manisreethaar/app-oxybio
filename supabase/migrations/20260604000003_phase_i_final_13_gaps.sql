-- Phase I: Final 13 remaining audit gaps
-- A-46: Quarantine physical location tracking
ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS quarantine_location text,
  ADD COLUMN IF NOT EXISTS quarantine_rack     text,
  ADD COLUMN IF NOT EXISTS rejection_reason    text,
  ADD COLUMN IF NOT EXISTS rejected_at         timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by         uuid REFERENCES employees(id) ON DELETE SET NULL;

-- A-09: Vendor qualification status
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS qualification_status text DEFAULT 'Unqualified'
    CHECK (qualification_status IN ('Unqualified','Under Review','Approved','Suspended')),
  ADD COLUMN IF NOT EXISTS qualified_at         date,
  ADD COLUMN IF NOT EXISTS qualification_notes  text,
  ADD COLUMN IF NOT EXISTS audit_due_date       date;

-- A-08: AQL incoming sampling schedule
CREATE TABLE IF NOT EXISTS aql_sampling_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid REFERENCES inventory_items(id) ON DELETE CASCADE,
  aql_level      text DEFAULT 'II',
  sample_size_pct numeric DEFAULT 10,
  accept_number  integer DEFAULT 0,
  reject_number  integer DEFAULT 1,
  tests_required text[] DEFAULT '{}',
  created_at     timestamptz DEFAULT now()
);
