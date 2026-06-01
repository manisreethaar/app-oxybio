export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp || !['admin', 'hr', 'ceo'].includes(emp.role)) {
      return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });
    }

    const { employee_id, days } = await request.json();
    if (!employee_id || !days) return NextResponse.json({ error: 'employee_id and days are required' }, { status: 400 });

    const { data: currentEmp } = await supabase.from('employees').select('comp_off_balance').eq('id', employee_id).single();
    const newBalance = (currentEmp.comp_off_balance || 0) + parseFloat(days);

    const { error } = await supabase.from('employees').update({ comp_off_balance: newBalance }).eq('id', employee_id);
    if (error) throw error;
    
    return NextResponse.json({ success: true, new_balance: newBalance });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
