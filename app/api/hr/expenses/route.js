export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });

    const { title, amount, receipt_url } = await request.json();
    if (!title || !amount) return NextResponse.json({ error: 'Title and amount are required' }, { status: 400 });

    const { data, error } = await supabase.from('hr_expenses').insert({
      employee_id: emp.id,
      title,
      amount,
      receipt_url: receipt_url || null,
      status: 'Pending'
    }).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
