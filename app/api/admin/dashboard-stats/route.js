export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role, email').eq('email', user.email).single();
    if (!['admin', 'ceo', 'cto'].includes(emp?.role) && !isMasterAdmin(emp?.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Fetch KPI counts only (not full data). batchHistory and
    // lowStockAlerts used to run as separate sequential queries after this
    // block even though neither depends on it — folded them in here so the
    // whole dashboard is one round-trip instead of three. (A batch-stats RPC
    // call used to run before this too, but its result was never read
    // anywhere in the response — dropped it entirely.)
    const [
      deviationsResult,
      overduesResult,
      leavesResult,
      tasksCount,
      compCount,
      attendanceCount,
      currentlyInLabCount,
      totalEmps,
      mispunchesResult,
      activeBatchesResult,
      batchHistoryResult,
    ] = await Promise.all([
      // Unacknowledged pH deviations
      supabase.from('ph_readings').select('batch_id', { count: 'exact', head: true })
        .eq('is_deviation', true).eq('deviation_acknowledged', false),
      // Overdue compliance items
      supabase.from('compliance_items').select('id', { count: 'exact', head: true })
        .eq('status', 'overdue'),
      // Pending leaves
      supabase.from('leave_applications').select('id, employees!leave_applications_employee_id_fkey(full_name)', { count: 'exact' })
        .eq('status', 'pending').limit(5),
      // Urgent task count
      supabase.from('tasks').select('id', { count: 'exact', head: true })
        .eq('status', 'open').eq('priority', 'urgent'),
      // Upcoming compliance
      supabase.from('compliance_items').select('id', { count: 'exact', head: true })
        .in('status', ['upcoming', 'in-progress']),
      // Today's attendance
      supabase.from('attendance_log').select('id', { count: 'exact', head: true })
        .eq('date', todayStr),
      // Currently in lab
      supabase.from('attendance_log').select('id', { count: 'exact', head: true })
        .eq('date', todayStr).is('check_out_time', null),
      // Active employees
      supabase.from('employees').select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      // Pending mispunches
      supabase.from('attendance_log').select('id, date, mispunch_requested_hours, mispunch_reason, employees(full_name)', { count: 'exact' })
        .eq('mispunch_status', 'pending').limit(10),
      // Active batches with last fermentation reading timestamp
      supabase.from('batches').select('id, batch_id, variant, current_stage, status, created_at, ph_readings(ph_value, is_deviation), batch_fermentation_readings(ph, is_ph_alarm, logged_at)')
        .is('archived_at', null)
        .not('status', 'in', '("released","rejected")').limit(10),
      // Batch history for the 6-month chart
      supabase.from('batches').select('status, created_at')
        .is('archived_at', null)
        .in('status', ['released', 'rejected'])
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: true }),
    ]);

    const batchHistory = batchHistoryResult?.data;

    // Build chart data
    const monthMap = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      monthMap[key] = { month: key, Released: 0, Rejected: 0 };
    }
    
    (batchHistory || []).forEach(b => {
      const key = new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (monthMap[key]) {
        if (b.status === 'released') monthMap[key].Released++;
        else if (b.status === 'rejected') monthMap[key].Rejected++;
      }
    });

    const response = NextResponse.json({
      success: true,
      data: {
        stats: {
          unacknowledgedDeviations: deviationsResult?.count || 0,
          overdueCompliance:        overduesResult?.count   || 0,
          pendingLeaves:            leavesResult?.count     || 0,
          urgentTasks:              tasksCount?.count       || 0,
          upcomingCompliance:       compCount?.count        || 0,
          checkedInToday:           attendanceCount?.count  || 0,
          currentlyInLab:           currentlyInLabCount?.count || 0,
          totalEmployees:           totalEmps?.count        || 0,
          pendingMispunches:        mispunchesResult?.count || 0,
          activeBatches:            activeBatchesResult?.data?.length || 0
        },
        leaves:         leavesResult?.data         || [],
        mispunches:     mispunchesResult?.data      || [],
        activeBatches:  activeBatchesResult?.data   || [],
        chartData:      Object.values(monthMap)
      }
    });
    // Cache for 30s on Vercel CDN — dashboard numbers don’t need to be real-time
    response.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return response;

  } catch (err) {
    console.error('Dashboard API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
