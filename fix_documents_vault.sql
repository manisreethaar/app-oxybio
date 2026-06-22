-- Drop the hardcoded check constraint on category to allow dynamic categories from app_settings
DO $$ 
DECLARE
  constraint_name text;
BEGIN
  -- Find the check constraint on the category column
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'documents'::regclass AND contype = 'c' AND conname LIKE '%category%';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE documents DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;
