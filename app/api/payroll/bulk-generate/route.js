export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: admin } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!admin || !['admin', 'hr', 'ceo'].includes(admin.role)) {
      return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });
    }

    const { month, year } = await request.json();
    if (!month || !year) return NextResponse.json({ error: 'Month and year required' }, { status: 400 });

    // 1. Fetch all active employees
    const { data: employees } = await supabase.from('employees').select('id, basic_salary, shift_id').eq('is_active', true);
    
    // 2. Fetch tax profiles
    const { data: taxProfiles } = await supabase.from('hr_tax_profiles').select('*');
    
    // 3. Fetch pending expenses for the month
    const { data: pendingExpenses } = await supabase.from('hr_expenses').select('*').eq('status', 'Approved');

    const payslipsToInsert = employees.map(emp => {
      const taxProfile = taxProfiles?.find(tp => tp.employee_id === emp.id) || {};
      const empExpenses = pendingExpenses?.filter(ex => ex.employee_id === emp.id) || [];
      const totalReimbursements = empExpenses.reduce((sum, ex) => sum + Number(ex.amount), 0);

      const basic = emp.basic_salary || 0;
      
      // Basic logic
      const pf_deduction = taxProfile.pf_applicable ? basic * 0.12 : 0;
      const pt_deduction = taxProfile.pt_applicable ? 200 : 0;
      const esi_deduction = taxProfile.esi_applicable ? basic * 0.0075 : 0;
      const tds_deduction = basic * (taxProfile.tds_percentage || 0) / 100;
      
      const net_payable = basic + totalReimbursements - pf_deduction - pt_deduction - esi_deduction - tds_deduction;

      return {
        employee_id: emp.id,
        month,
        year,
        basic_salary: basic,
        pf_deduction,
        esi_deduction,
        pt_deduction,
        tds_deduction,
        reimbursements: totalReimbursements,
        net_payable,
        status: 'Draft',
        is_exported: false
      };
    });

    const { data, error } = await supabase.from('payslips').insert(payslipsToInsert).select();
    if (error) throw error;
    
    // Mark expenses as Paid and link to payslips
    // Simple approach for now: mark them Paid
    if (pendingExpenses && pendingExpenses.length > 0) {
      const expenseIds = pendingExpenses.map(ex => ex.id);
      await supabase.from('hr_expenses').update({ status: 'Paid' }).in('id', expenseIds);
    }

    return NextResponse.json({ success: true, count: data.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
