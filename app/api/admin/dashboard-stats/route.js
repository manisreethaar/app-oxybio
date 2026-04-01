import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role, email').eq('email', user.email).single();
    if (!['admin', 'ceo', 'cto'].includes(emp?.role) && emp?.email !== 'manisreethaar@gmail.com') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Use RPC for batch stats - single call instead of multiple
    const { data: batchStats, error: batchErr } = await supabase
      .rpc('get_dashboard_batch_stats', { target_date: todayStr });

    // Fetch KPI counts only (not full data)
    const [
      deviationsResult,
      overduesResult,
      leavesResult,
      tasksCount,
      compCount,
      attendanceCount,
      totalEmps,
      mispunchesResult,
      activeBatchesResult
    ] = await Promise.all([
      // Unacknowledged pH deviations
      supabase.from('ph_readings').select('batch_id', { count: 'exact', head: true })
        .eq('is_deviation', true).eq('deviation_acknowledged', false),
      // Overdue compliance items
      supabase.from('compliance_items').select('id', { count: 'exact', head: true })
        .eq('status', 'overdue'),
      // Pending leaves
      supabase.from('leave_applications').select('id, employees(full_name)', { count: 'exact' })
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
      // Active employees
      supabase.from('employees').select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      // Pending mispunches
      supabase.from('attendance_log').select('id, employees(full_name)', { count: 'exact' })
        .eq('mispunch_status', 'pending').limit(10),
      // Active batches (limited fields, not full data)
      supabase.from('batches').select('id, batch_id, variant, current_stage, status, created_at, ph_readings(ph_value, is_deviation)')
        .not('status', 'in', '("released","rejected")').limit(10)
    ]);

    // Build chart data from batch history (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const { data: batchHistory } = await supabase
      .from('batches').select('status, created_at')
      .in('status', ['released', 'rejected'])
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true });

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

    // Low stock alerts — simple threshold check, no broken nested RPC
    const { data: lowStockAlerts } = await supabase
      .from('inventory_stock')
      .select('id, current_quantity, inventory_items(name, unit, min_stock_level)')
      .eq('status', 'Available')
      .lt('current_quantity', 10) // simple numeric threshold, not a subquery
      .limit(5);

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
