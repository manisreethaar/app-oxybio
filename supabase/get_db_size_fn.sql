-- Run this in Supabase SQL Editor → New Query
-- Creates a helper function so the app can read the total database size

CREATE OR REPLACE FUNCTION get_db_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size(current_database());
$$;
