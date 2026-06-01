export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, earned_leave_balance').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });

    const { leave_type, days_encashed, amount } = await request.json();
    if (!leave_type || !days_encashed || !amount) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    if (leave_type === 'Earned') {
        if ((emp.earned_leave_balance || 0) < days_encashed) {
            return NextResponse.json({ error: 'Insufficient balance for encashment' }, { status: 400 });
        }
    }

    const { data, error } = await supabase.from('leave_encashments').insert({
      employee_id: emp.id,
      leave_type,
      days_encashed,
      amount,
      status: 'Pending'
    }).select().single();

    if (error) throw error;
    
    // Deduct from balance
    if (leave_type === 'Earned') {
        await supabase.from('employees').update({ 
            earned_leave_balance: (emp.earned_leave_balance || 0) - days_encashed 
        }).eq('id', emp.id);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
