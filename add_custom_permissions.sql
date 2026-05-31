-- Run this in Supabase SQL Editor to add custom_permissions column
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '{}'::jsonb;
