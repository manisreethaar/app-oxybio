export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { createAdminClient } from '@/utils/supabase/admin';
import { isMasterAdmin } from '@/lib/permissions';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const supabaseAdmin = createAdminClient();

    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, role, full_name, department')
      .eq('email', user.email)
      .single();

    const isMaster = isMasterAdmin(user.email);
    const isApprover = ['admin', 'ceo', 'cto'].includes(emp?.role) || isMaster;
    if (empErr || !emp || !isApprover) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch pending mispunches
    let query = supabaseAdmin
      .from('attendance_log')
      .select('id, date, employee_id, mispunch_status, mispunch_reason, mispunch_requested_hours')
      .eq('mispunch_status', 'pending')
      .order('date', { ascending: false });

    // CEO and Master Admin can approve their own; other admins cannot
    if (emp.role !== 'ceo' && !isMaster) {
      query = query.neq('employee_id', emp.id);
    }

    const { data: logs, error: logsErr } = await query;
    if (logsErr) throw logsErr;

    if (!logs || logs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Fetch employee names separately (avoids FK join ambiguity)
    const employeeIds = [...new Set(logs.map(l => l.employee_id))];
    const { data: employees, error: empsErr } = await supabaseAdmin
      .from('employees')
      .select('id, full_name')
      .in('id', employeeIds);

    if (empsErr) throw empsErr;

    const empMap = {};
    (employees || []).forEach(e => { empMap[e.id] = e; });

    const enriched = logs.map(log => ({
      ...log,
      employees: empMap[log.employee_id] || { full_name: 'Unknown' }
    }));

    return NextResponse.json({ data: enriched });
  } catch (err) {
    console.error('[Mispunch Pending GET] Error:', err.message, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
