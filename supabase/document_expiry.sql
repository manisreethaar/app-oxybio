-- Add expiry dates for documents
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS coa_expiry_date DATE;
ALTER TABLE inventory_stock ADD COLUMN IF NOT EXISTS sds_expiry_date DATE;
