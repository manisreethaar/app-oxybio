export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp || !['admin', 'ceo', 'hr'].includes(emp.role)) {
      return NextResponse.json({ error: 'Permission Denied: Managers only' }, { status: 403 });
    }

    const { log_ids } = await request.json();

    if (!log_ids || !Array.isArray(log_ids) || log_ids.length === 0) {
      return NextResponse.json({ error: 'Array of log_ids required' }, { status: 400 });
    }

    const { error } = await supabase.from('attendance_log').update({
      locked: true,
      manager_signoff_by: emp.id,
      manager_signoff_at: new Date().toISOString()
    }).in('id', log_ids);

    if (error) throw error;
    
    return NextResponse.json({ success: true, lockedCount: log_ids.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
