import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Find employee Santha Kumari (case‑insensitive)
  const { data: emp, error: e1 } = await supabaseAdmin
    .from('employees')
    .select('id, full_name')
    .ilike('full_name', '%santha%')
    .single();

  if (e1) {
    console.error('Error finding employee:', e1);
    return;
  }
  console.log('Employee found:', emp);

  // Fetch payslip for June 2022
  const { data: payslips, error: e2 } = await supabaseAdmin
    .from('payslips')
    .select('*')
    .eq('employee_id', emp.id)
    .eq('month', 'June')
    .eq('year', 2022);

  if (e2) {
    console.error('Error fetching payslip:', e2);
    return;
  }

  console.log(`Found ${payslips.length} payslip(s) for June 2022:`);
  console.dir(payslips, { depth: null });

  // Show LOP deduction calculation breakdown if fields present
  if (payslips.length > 0) {
    const p = payslips[0];
    console.log('\n--- Breakdown ---');
    console.log('Base salary:', p.base_salary);
    console.log('Total working days (calendar):', p.total_working_days);
    console.log('Present days:', p.present_days);
    console.log('Monthly leave allowance (prorated):', p.monthly_leave_allowance ?? p.prorated_allowance);
    console.log('Approved leave days:', p.approved_leave_days);
    console.log('LOP days:', p.lop_days);
    console.log('LOP deduction:', p.lop_deduction);
    console.log('Total hours worked (if recorded):', p.total_hours_worked);
  }
}

run();
