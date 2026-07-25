require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: emps } = await supabase.from('employees').select('id, full_name, employee_code, email').ilike('employee_code', 'O2B-RF-%');
  console.log("RF Employees:", emps);
  const { data: released } = await supabase.from('released_employee_codes').select('*');
  console.log("Released codes:", released);
}
run();
