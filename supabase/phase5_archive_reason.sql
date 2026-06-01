ALTER TABLE batches ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE lab_notebook_entries ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS archive_reason TEXT;
