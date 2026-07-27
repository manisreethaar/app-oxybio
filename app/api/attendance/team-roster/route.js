export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { getApiUser } from '@/utils/supabase/get-api-user';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const supabaseAdmin = createAdminClient();

    const user = getApiUser();
    const authError = null;
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();

    if (!emp || !['admin', 'ceo', 'cto'].includes(emp.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // IST date
    const todayStr = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];

    const [teamLogsRes, allEmpsRes] = await Promise.all([
      supabaseAdmin
        .from('attendance_log')
        .select('id, employee_id, date, check_in_time, check_out_time, total_hours, in_geofence, photo_url')
        .eq('date', todayStr),
      supabaseAdmin
        .from('employees')
        .select('id, full_name, role')
        .eq('is_active', true),
    ]);

    if (teamLogsRes.error) throw teamLogsRes.error;
    if (allEmpsRes.error) throw allEmpsRes.error;

    const teamLogs = teamLogsRes.data || [];
    const allEmps = allEmpsRes.data || [];

    const combined = allEmps.map(e => {
      const log = teamLogs.find(l => l.employee_id === e.id) || null;
      return { ...e, attendance: log };
    });

    return NextResponse.json({ data: combined });
  } catch (err) {
    console.error('[Team Roster GET] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
