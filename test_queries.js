require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.log("Testing queries...");
  
  const q6 = await supabase
    .from('activity_log')
    .select('id, created_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, batch_id, equipment_id, severity, founder_comment, employee_id, archived_at, employees!activity_log_employee_id_fkey(full_name)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log("Q6 activity_log main error:", q6.error);

  const q7 = await supabase
    .from('activity_log')
    .select('id, created_at, activity_description, issue_description, founder_comment, employee_id, employees!activity_log_employee_id_fkey(full_name), batch_id, equipment_id')
    .eq('issue_observed', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  console.log("Q7 activity_log issues error:", q7.error);
}

test();
