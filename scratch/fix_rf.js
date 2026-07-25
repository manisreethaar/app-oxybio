require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  // 1. Update Devika
  const { data: updated, error: updErr } = await supabase
    .from('employees')
    .update({ employee_code: 'O2B-RF-002' })
    .eq('id', '1a6cf92b-bd6e-4c26-9e9b-acbca9d19add')
    .select();
  console.log("Updated Devika:", updated, updErr);

  // 2. Remove O2B-RF-002 from released_employee_codes
  const { error: delErr } = await supabase
    .from('released_employee_codes')
    .delete()
    .eq('employee_code', 'O2B-RF-002');
  console.log("Deleted O2B-RF-002 from released codes:", delErr);

  // 3. Add O2B-RF-003 back to released_employee_codes
  const { error: insErr } = await supabase
    .from('released_employee_codes')
    .insert({
      employee_code: 'O2B-RF-003',
      reason: 'Re-released after correcting Devika back to O2B-RF-002'
    });
  console.log("Inserted O2B-RF-003 to released codes:", insErr);
}
fix();
