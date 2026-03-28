import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only admins may export
    const { data: emp } = await supabase.from('employees').select('role').eq('id', user.id).single();
    if (!['admin','ceo','cto'].includes(emp?.role)) return NextResponse.json({ error: 'Leadership role required' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const employeeId = searchParams.get('employeeId');

    let query = supabase
      .from('attendance_log')
      .select('*, employees(full_name, role)')
      .order('date', { ascending: false });

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (employeeId) query = query.eq('employee_id', employeeId);

    const { data: logs, error } = await query.limit(5000);
    if (error) throw error;

    // Build CSV
    const header = 'Employee,Date,Check In,Check Out,Total Hours,GPS Verified,In Geofence';
    const rows = (logs || []).map(log => [
      log.employees?.full_name || 'Unknown',
      log.date || '',
      log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString('en-IN') : '--',
      log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString('en-IN') : '--',
      log.total_hours || '0',
      log.in_geofence ? 'Yes' : 'No',
      log.in_geofence ? 'Yes' : 'No'
    ].join(','));

    const csv = [header, ...rows].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="attendance_export_${new Date().toISOString().split('T')[0]}.csv"`
      }
    });

  } catch (error) {
    console.error('Attendance Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
