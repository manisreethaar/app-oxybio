import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const payload = {
    employee_id: '1a6cf92b-bd6e-4c26-9e9b-acbca9d19add',
    month: 'May',
    year: 2026,
    base_salary: 10000,
    total_working_days: 26,
    present_days: 20,
    approved_leave_days: 0,
    lop_days: 0,
    lop_deduction: 0,
    gross_salary: 10000,
    pf_deduction: 0,
    esi_deduction: 0,
    net_salary: 10000,
    total_hours_worked: 160,
    admin_notes: null,
    is_auto_generated: true,
    payslip_url: null,
    uploaded_by: '2e14d5dd-b502-4f6b-8fa8-5519a681470a',
    uploaded_at: new Date().toISOString()
  };
  const { data, error } = await supabaseAdmin.from('payslips').insert(payload);
  console.log('Insert:', data, error);
}

check();
