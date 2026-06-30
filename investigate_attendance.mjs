import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  console.log('--- 1. Investigating Manual Override for Anushika P ---');
  const { data: anushika, error: e1 } = await supabaseAdmin
    .from('employees')
    .select('id, full_name')
    .ilike('full_name', '%anushika%')
    .single();

  if (anushika) {
    const { data: attLogs } = await supabaseAdmin
      .from('attendance_log')
      .select('*')
      .eq('employee_id', anushika.id)
      .order('date', { ascending: false })
      .limit(5);
    console.log('Recent attendance logs for Anushika:', attLogs);
  } else {
    console.error('Anushika not found', e1);
  }

  console.log('\n--- 2. Investigating June 22nd for Santha Kumari ---');
  const { data: santha, error: e2 } = await supabaseAdmin
    .from('employees')
    .select('id, full_name')
    .ilike('full_name', '%santha%')
    .single();

  if (santha) {
    const { data: santhaLogs } = await supabaseAdmin
      .from('attendance_log')
      .select('*')
      .eq('employee_id', santha.id)
      .eq('date', '2026-06-22');
    console.log('Santha Kumari log for June 22 2026:', santhaLogs);
  } else {
    console.error('Santha Kumari not found', e2);
  }
}

investigate();
