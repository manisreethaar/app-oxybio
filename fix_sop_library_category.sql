-- Drop the hardcoded category check constraint on the sop_library table
-- This allows the dynamic categories defined in the app_settings ('document_categories')
-- to be used successfully during SOP uploads.

ALTER TABLE sop_library DROP CONSTRAINT IF EXISTS sop_library_category_check;
