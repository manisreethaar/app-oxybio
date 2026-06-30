import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // find employee Santha Kumari (case-insensitive)
  const { data: emp, error: e1 } = await supabaseAdmin
    .from('employees')
    .select('id, full_name')
    .ilike('full_name', '%santha%')
    .single();
  if (e1) { console.error('Error finding employee', e1); return; }
  console.log('Employee:', emp);

  const month = '2022-06'; // June 2022
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payroll/attendance-detail?employee_id=${emp.id}&month=${month}`;
  // Use supabase service role to call the route directly
  const res = await fetch(url, {
    headers: { apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY }
  });
  if (!res.ok) { console.error('Failed to fetch attendance detail', await res.text()); return; }
  const result = await res.json();
  console.log('Attendance detail for June 2022:');
  console.dir(result.data.calendar_days, { depth: null });
}

run();
