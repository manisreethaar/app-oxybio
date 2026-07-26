export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('hr_shifts')
      .select('*')
      .order('name');
      
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp || !['admin', 'hr', 'ceo'].includes(emp.role)) {
      return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });
    }

    const body = await request.json();
    const { name, start_time, end_time, is_night_shift, grace_period_mins } = body;

    if (!name || !start_time || !end_time) {
      return NextResponse.json({ error: 'Name, start time, and end time are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('hr_shifts')
      .insert({ name, start_time, end_time, is_night_shift: is_night_shift || false, grace_period_mins: grace_period_mins || 15 })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
