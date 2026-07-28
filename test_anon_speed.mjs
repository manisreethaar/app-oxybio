import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We use the ANON KEY which respects RLS policies!
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function timeQuery(name, queryFn) {
  const start = Date.now();
  console.log(`Starting ${name}...`);
  try {
    const { data, error } = await queryFn();
    const end = Date.now();
    if (error) {
      console.log(`[${name}] failed in ${end - start}ms:`, error.message);
    } else {
      console.log(`[${name}] succeeded in ${end - start}ms (Rows: ${data?.length})`);
    }
  } catch (e) {
    console.log(`[${name}] crashed in ${Date.now() - start}ms:`, e.message);
  }
}

async function run() {
  await timeQuery('lab_notebook_entries (ANON)', () => supabase
    .from('lab_notebook_entries')
    .select('id, title')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  );
  
  await timeQuery('batches (ANON)', () => supabase
    .from('batches')
    .select('id, batch_id')
    .limit(10)
  );

  process.exit(0);
}

run();
