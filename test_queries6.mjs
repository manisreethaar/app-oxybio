import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
  await timeQuery('activity_log_base', () => supabase
    .from('activity_log')
    .select('id')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  );

  await timeQuery('activity_log_exec_issues', () => supabase
    .from('activity_log')
    .select('id')
    .eq('issue_observed', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(200)
  );

  await timeQuery('tasks_overdue', () => supabase
    .from('tasks')
    .select('id')
    .neq('status', 'done')
    .neq('status', 'cancelled')
    .lt('due_date', new Date().toLocaleDateString('en-CA'))
    .order('due_date', { ascending: true })
    .limit(5)
  );

  await timeQuery('batches_active', () => supabase
    .from('batches')
    .select('batch_id')
    .is('archived_at', null)
    .in('status', ['fermenting', 'in-progress', 'testing', 'inoculation', 'media_prep', 'sterilisation', 'harvest', 'downstream', 'qc_hold'])
    .limit(20)
  );
  
  process.exit(0);
}

run();
