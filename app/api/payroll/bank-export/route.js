import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: admin } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!admin || !['admin', 'hr', 'ceo'].includes(admin.role)) {
      return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!month || !year) return NextResponse.json({ error: 'Month and year required' }, { status: 400 });

    const { data: payslips, error } = await supabase
      .from('payslips')
      .select('*, employees(full_name, bank_account_number, bank_ifsc)')
      .eq('month', month)
      .eq('year', year)
      .eq('status', 'Approved');

    if (error) throw error;
    if (!payslips || payslips.length === 0) {
      return NextResponse.json({ error: 'No approved payslips found for this period' }, { status: 404 });
    }

    // Generate CSV for Bank Export (Standard format: Account Number, IFSC, Name, Amount, Narration)
    const header = "Beneficiary Name,Account Number,IFSC Code,Amount,Narration\n";
    const csvRows = payslips.map(ps => {
      const emp = ps.employees || {};
      const narration = `Salary ${month} ${year}`;
      return `"${emp.full_name}","${emp.bank_account_number || ''}","${emp.bank_ifsc || ''}","${ps.net_payable}","${narration}"`;
    });

    const csvContent = header + csvRows.join('\n');

    // Mark as exported
    const payslipIds = payslips.map(ps => ps.id);
    await supabase.from('payslips').update({ is_exported: true }).in('id', payslipIds);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="Salary_Export_${month}_${year}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
