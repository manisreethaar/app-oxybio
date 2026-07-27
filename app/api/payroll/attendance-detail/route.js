export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { NextResponse } from 'next/server';

/**
 * GET /api/payroll/attendance-detail
 * Returns per-day attendance data for a specific employee + month.
 * Query params: employee_id, month (YYYY-MM)
 *
 * Returns:
 *   - employee info (name, DOJ, base_salary, role)
 *   - attendance_logs[]  — one per calendar day that has a log
 *   - leave_days[]       — approved leave applications overlapping the month
 *   - summary stats
 */
export async function GET(request) {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();

    if (!caller || !['admin', 'ceo', 'cto'].includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const employee_id = searchParams.get('employee_id');
    const month = searchParams.get('month'); // YYYY-MM

    if (!employee_id || !month) {
      return NextResponse.json({ error: 'employee_id and month (YYYY-MM) are required' }, { status: 400 });
    }

    const [year, monthIdx] = month.split('-').map(Number);
    if (!year || !monthIdx) {
      return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
    }

    const monthStart = new Date(year, monthIdx - 1, 1);
    const monthEnd   = new Date(year, monthIdx, 0); // Last day of month

    const startStr = monthStart.toISOString().split('T')[0];
    const endStr   = monthEnd.toISOString().split('T')[0];

    // Fetch employee details
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name, base_salary, joined_date, designation, employee_code, role, department')
      .eq('id', employee_id)
      .single();

    if (empErr || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    // Fetch all attendance logs in month
    const { data: logs } = await supabase
      .from('attendance_log')
      .select('id, date, check_in_time, check_out_time, total_hours, location_lat, location_lng, in_geofence, notes, manual_entry, mispunch_status, mispunch_requested_hours')
      .eq('employee_id', employee_id)
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date');

    // Fetch approved + pending leave applications overlapping this month
    const { data: leaves } = await supabase
      .from('leave_applications')
      .select('id, leave_type, start_date, end_date, total_days, status, reason')
      .eq('employee_id', employee_id)
      .in('status', ['approved', 'pending'])
      .lte('start_date', endStr)
      .gte('end_date', startStr)
      .order('start_date');

    // Build a set of leave-covered dates for easy calendar lookup
    const leaveDateMap = {}; // date string -> leave entry
    (leaves || []).forEach(leave => {
      const s = new Date(leave.start_date);
      const e = new Date(leave.end_date);
      const cur = new Date(s);
      while (cur <= e) {
        const ds = cur.toISOString().split('T')[0];
        leaveDateMap[ds] = leave;
        cur.setDate(cur.getDate() + 1);
      }
    });

    // Build attendance map: date -> log
    const attendanceMap = {};
    (logs || []).forEach(log => {
      if (!attendanceMap[log.date]) attendanceMap[log.date] = log;
    });

    // Build calendar days — no day is automatically excluded or marked as rest
    const calendarDays = [];
    const cur = new Date(monthStart);
    while (cur <= monthEnd) {
      const ds = cur.toISOString().split('T')[0];
      const dayOfWeek = cur.getDay(); // 0=Sun, kept for display only

      const isBeforeDOJ = emp.joined_date && new Date(emp.joined_date) > cur;
      const isJoiningDay = emp.joined_date && emp.joined_date === ds;
      const log = attendanceMap[ds] || null;
      const leave = leaveDateMap[ds] || null;

      // Status priority: not_applicable → present (any day with a log) → on_leave → leave_pending → absent
      let status = 'absent';
      if (isBeforeDOJ) status = 'not_applicable';
      else if (log && log.check_in_time) status = 'present';  // present on ANY day, incl. Sunday
      else if (leave) status = leave.status === 'approved' ? 'on_leave' : 'leave_pending';

      calendarDays.push({
        date: ds,
        day_of_week: dayOfWeek,
        is_sunday: dayOfWeek === 0,   // purely cosmetic flag for the UI
        status,
        is_joining_day: isJoiningDay,
        log: log ? {
          id: log.id,
          check_in_time: log.check_in_time,
          check_out_time: log.check_out_time,
          total_hours: (log.mispunch_status === 'approved' && log.mispunch_requested_hours) 
            ? parseFloat(log.mispunch_requested_hours).toFixed(2) 
            : (log.total_hours ? parseFloat(log.total_hours).toFixed(2) : null),
          in_geofence: log.in_geofence,
          manual_entry: log.manual_entry,
          notes: log.notes,
        } : null,
        leave: leave ? {
          id: leave.id,
          leave_type: leave.leave_type,
          status: leave.status,
        } : null,
      });

      cur.setDate(cur.getDate() + 1);
    }

    // Compute summary stats — all calendar days count, no auto exclusions
    const presentDays  = calendarDays.filter(d => d.status === 'present');
    const absentDays   = calendarDays.filter(d => d.status === 'absent');
    const leaveDays    = calendarDays.filter(d => d.status === 'on_leave');
    const totalHours   = presentDays.reduce((sum, d) => sum + parseFloat(d.log?.total_hours || 0), 0);
    const avgHours     = presentDays.length > 0 ? totalHours / presentDays.length : 0;

    // Proration: if joined during this month, period starts from DOJ
    let periodStartStr = startStr;
    if (emp.joined_date) {
      const doj = new Date(emp.joined_date);
      if (doj > monthStart && doj <= monthEnd) periodStartStr = emp.joined_date;
    }

    // Total payable days = all calendar days from period start (no day excluded)
    let payableWorkingDays = 0;
    const pd = new Date(periodStartStr);
    while (pd <= monthEnd) { payableWorkingDays++; pd.setDate(pd.getDate() + 1); }

    // 4 days/month allowance, prorated for mid-month joiners
    const fullMonthDays = calendarDays.length;
    const periodFraction = payableWorkingDays / fullMonthDays;
    const monthlyLeaveAllowance = Math.round(4 * periodFraction * 10) / 10;

    const approvedLeaveDays = leaveDays.length;
    // LOP = total − present − 4_allowance − approved_leaves
    const lopDays = Math.max(0, Math.round((payableWorkingDays - presentDays.length - monthlyLeaveAllowance - approvedLeaveDays) * 100) / 100);

    return NextResponse.json({
      success: true,
      data: {
        employee: emp,
        period: { start: startStr, end: endStr, month, year, monthIdx },
        calendar_days: calendarDays,
        summary: {
          total_working_days: payableWorkingDays,
          monthly_leave_allowance: monthlyLeaveAllowance,
          present_days: presentDays.length,
          absent_days: absentDays.length,
          leave_days: approvedLeaveDays,
          lop_days: lopDays,
          total_hours_worked: Math.round(totalHours * 100) / 100,
          avg_hours_per_day: Math.round(avgHours * 100) / 100,
        },
        leaves: leaves || [],
      }
    });

  } catch (err) {
    console.error('payroll/attendance-detail error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
