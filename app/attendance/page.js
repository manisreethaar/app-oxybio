import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import { redirect } from 'next/navigation';
import AttendanceClient from './AttendanceClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance - OxyOS' };

export default async function AttendancePage() {
  const supabase = createClient();
  const user = getRequestUser();
  if (!user) redirect('/login');

  const todayStr = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];

  // Fetch employee profile + role
  const { data: emp } = await supabase
    .from('employees')
    .select('id, full_name, role, initials, employee_code')
    .eq('id', user.id)
    .single();

  if (!emp) redirect('/login');

  const isExec = ['admin', 'ceo', 'cto'].includes(emp.role);

  // Pre-fetch all initial data in parallel
  const [todayRes, historyRes, leavesRes, geofenceRes, rosterRes] = await Promise.all([
    supabase
      .from('attendance_log')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('date', todayStr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('attendance_log')
      .select('*')
      .eq('employee_id', emp.id)
      .order('date', { ascending: false })
      .limit(30),

    supabase
      .from('leave_applications')
      .select('employee_id')
      .eq('status', 'approved')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr),

    supabase
      .from('system_config')
      .select('value')
      .eq('key', 'attendance_geofence')
      .maybeSingle(),

    // Team roster only for exec roles
    isExec
      ? supabase
          .from('attendance_log')
          .select('*, employees!attendance_log_employee_id_fkey(id, full_name, initials, role, employee_code)')
          .eq('date', todayStr)
          .order('check_in_time', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const geofenceConfig = geofenceRes.data?.value
    ? {
        lat: geofenceRes.data.value.TARGET_LAT,
        lng: geofenceRes.data.value.TARGET_LNG,
        radius: geofenceRes.data.value.MAX_RADIUS_METERS,
      }
    : { lat: 12.716065, lng: 77.870016, radius: 300 };

  return (
    <AttendanceClient
      initialTodayLog={todayRes.data || null}
      initialHistory={historyRes.data || []}
      initialOnLeaveIds={(leavesRes.data || []).map(l => l.employee_id)}
      initialGeofence={geofenceConfig}
      initialTeamRoster={rosterRes.data || []}
      employeeProfile={emp}
    />
  );
}
