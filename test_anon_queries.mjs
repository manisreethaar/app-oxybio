import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function timeQuery(name, queryFn) {
  const start = Date.now();
  console.log(`Starting ${name} (with anon key)...`);
  try {
    const { data, error } = await Promise.race([
        queryFn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 10s')), 10000))
    ]);
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
  await timeQuery('activity_log_base', () => supabase
    .from('activity_log')
    .select('id')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  );
  
  await timeQuery('tasks_overdue', () => supabase
    .from('tasks')
    .select('id')
    .limit(5)
  );

  await timeQuery('batches_active', () => supabase
    .from('batches')
    .select('batch_id')
    .limit(5)
  );

  await timeQuery('documents', () => supabase
    .from('documents')
    .select('id')
    .limit(5)
  );
  
  await timeQuery('attendance', () => supabase
    .from('attendance_log')
    .select('id')
    .limit(5)
  );

  process.exit(0);
}

run();
