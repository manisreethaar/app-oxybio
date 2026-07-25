export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });

    const { delegatee_id, start_date, end_date } = await request.json();
    if (!delegatee_id || !start_date || !end_date) {
      return NextResponse.json({ error: 'Delegatee and dates are required' }, { status: 400 });
    }

    const { data, error } = await supabase.from('hr_delegations').insert({
      delegator_id: emp.id,
      delegatee_id,
      start_date,
      end_date,
      status: 'Active',
      created_by: emp.id
    }).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
