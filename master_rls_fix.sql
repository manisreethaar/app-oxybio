DO $$
DECLARE
    r RECORD;
BEGIN
    -- Loop through all actual tables (excluding views) in the public schema
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        -- 1. Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        
        -- 2. Drop existing 'auth_all' policy if it exists to prevent duplicates
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.tablename || '_auth_all', r.tablename);
        
        -- 3. Create the new policy allowing all authenticated users
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
            r.tablename || '_auth_all', 
            r.tablename
        );
    END LOOP;
END;
$$;
