import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const supabaseAdmin = createAdminClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase
      .from('employees')
      .select('id, role, full_name, department')
      .eq('email', user.email)
      .single();

    if (!emp || !['admin', 'ceo', 'cto', 'research_fellow'].includes(emp.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('attendance_log')
      .select('id, date, mispunch_status, mispunch_reason, mispunch_requested_hours, employees(full_name)')
      .eq('mispunch_status', 'pending')
      .order('date', { ascending: false });

    if (error) throw error;
    
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[Mispunch Pending GET] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
