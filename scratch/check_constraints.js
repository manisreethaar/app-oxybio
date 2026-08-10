import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkConstraints() {
  const { data, error } = await supabase.rpc('query_constraints', {
    sql: `
      SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid IN ('public.batches'::regclass, 'public.batch_flasks'::regclass)
        AND contype = 'c';
    `
  });

  if (error) {
    console.error("RPC failed, we might need a direct query:", error.message);
    // Alternatively just select from a view if RPC is not there
    // Actually, we can't run raw SQL from the client unless there is an RPC.
  } else {
    console.log(data);
  }
}

checkConstraints();
