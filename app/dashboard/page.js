// @ts-nocheck
import { createClient } from '@/utils/supabase/server';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

async function fetchAdminDashboardStats() {
  try {
    const supabase = createClient();
    const todayStr = new Date().toISOString().split('T')[0];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

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
      stockRes,
      calibRes,
      capaRes,
      qcHoldRes,
    ] = await Promise.all([
      supabase.from('ph_readings').select('batch_id', { count: 'exact', head: true }).eq('is_deviation', true).eq('deviation_acknowledged', false),
      supabase.from('compliance_items').select('id', { count: 'exact', head: true }).eq('status', 'overdue'),
      supabase.from('leave_applications').select('id, employees!leave_applications_employee_id_fkey(full_name)', { count: 'exact' }).eq('status', 'pending').limit(5),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('priority', 'urgent'),
      supabase.from('compliance_items').select('id', { count: 'exact', head: true }).in('status', ['upcoming', 'in-progress']),
      supabase.from('attendance_log').select('id', { count: 'exact', head: true }).eq('date', todayStr),
      supabase.from('attendance_log').select('id', { count: 'exact', head: true }).eq('date', todayStr).is('check_out_time', null),
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('attendance_log').select('id, date, mispunch_requested_hours, mispunch_reason, employees(full_name)', { count: 'exact' }).eq('mispunch_status', 'pending').limit(10),
      supabase.from('batches').select('id, batch_id, variant, current_stage, status, created_at, ph_readings(ph_value, is_deviation), batch_fermentation_readings(ph, is_ph_alarm, logged_at)').is('archived_at', null).not('status', 'in', '("released","rejected")').limit(10),
      supabase.from('batches').select('status, created_at').is('archived_at', null).in('status', ['released', 'rejected']).gte('created_at', sixMonthsAgo.toISOString()).order('created_at', { ascending: true }),
      supabase.from('inventory_stock').select('id, current_quantity, min_stock_level, unit, item:inventory_items(id, name)').not('min_stock_level', 'is', null).gt('min_stock_level', 0).filter('current_quantity', 'lt', 'min_stock_level').limit(5),
      supabase.from('equipment').select('id, name, calibration_due_date').lte('calibration_due_date', sevenDaysFromNow.toISOString().split('T')[0]).not('calibration_due_date', 'is', null).neq('requires_calibration', false).limit(5),
      supabase.from('deviations').select('id, title, severity, status, batch_id, batches(id, batch_id)').neq('status', 'Closed').is('archived_at', null).order('created_at', { ascending: false }).limit(5),
      supabase.from('batches').select('id, batch_id, current_stage, status, formulations(name)').is('archived_at', null).eq('current_stage', 'qc_hold').not('status', 'in', '("released","rejected")').order('created_at', { ascending: false }).limit(100),
    ]);

    const batchHistory = batchHistoryResult?.data || [];
    const monthMap = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      monthMap[key] = { month: key, Released: 0, Rejected: 0 };
    }
    batchHistory.forEach(b => {
      const key = new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (monthMap[key]) {
        if (b.status === 'released') monthMap[key].Released++;
        else if (b.status === 'rejected') monthMap[key].Rejected++;
      }
    });

    return {
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
        activeBatches:            activeBatchesResult?.data?.length || 0,
      },
      leaves:        leavesResult?.data        || [],
      mispunches:    mispunchesResult?.data     || [],
      activeBatches: activeBatchesResult?.data  || [],
      chartData:     Object.values(monthMap),
      lowStock:      stockRes?.data            || [],
      calibDue:      calibRes?.data            || [],
      openCapa:      capaRes?.data             || [],
      qcHoldBatches: qcHoldRes?.data           || [],
    };
  } catch (err) {
    console.error('[Dashboard SSR] fetchAdminDashboardStats failed:', err);
    return null;
  }
}

async function fetchStaffDashboardData(employeeId) {
  try {
    const supabase = createClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [tasksRes, leavesRes, batchesRes, activityRes, notifRes] = await Promise.all([
      supabase.from('tasks').select('id, title, priority, due_date, status, assigned_to').eq('assigned_to', employeeId).in('status', ['open', 'in-progress']).order('due_date', { ascending: true }).limit(5),
      supabase.from('leave_applications').select('leave_type, start_date, end_date').eq('employee_id', employeeId).eq('status', 'approved'),
      supabase.from('tasks').select('batch_id, batches!inner(id, batch_id, current_stage, product_name)').eq('assigned_to', employeeId).in('status', ['open', 'in-progress']).not('batch_id', 'is', null).limit(3),
      supabase.from('activity_log').select('id, activity_description, start_time, end_time, created_at, issue_observed').eq('employee_id', employeeId).is('archived_at', null).gte('created_at', todayStart.toISOString()).order('created_at', { ascending: false }).limit(5),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId).eq('is_read', false),
    ]);

    // Deduplicate batches
    const batchMap = new Map();
    (batchesRes.data || []).forEach(t => {
      if (t.batches && !batchMap.has(t.batches.id)) batchMap.set(t.batches.id, t.batches);
    });

    // Active fermentations
    let activeFermentations = [];
    const { data: fermBatches } = await supabase.from('batches').select('id, batch_id, current_stage').eq('current_stage', 'fermentation').not('status', 'in', '("released","rejected")').is('archived_at', null).limit(10);
    if (fermBatches?.length) {
      const batchIds = fermBatches.map(b => b.id);
      const { data: latestReadings } = await supabase.from('batch_fermentation_readings').select('batch_id, ph, is_ph_alarm, is_temp_alarm, logged_at, elapsed_hours').in('batch_id', batchIds).order('logged_at', { ascending: false });
      const latestMap = new Map();
      (latestReadings || []).forEach(r => { if (!latestMap.has(r.batch_id)) latestMap.set(r.batch_id, r); });
      const now = Date.now();
      activeFermentations = fermBatches.map(b => {
        const lr = latestMap.get(b.id);
        const hrsSinceLog = lr?.logged_at ? (now - new Date(lr.logged_at).getTime()) / 3600000 : null;
        const hasAlarm = lr?.is_ph_alarm || lr?.is_temp_alarm;
        const status = hasAlarm ? 'red' : hrsSinceLog === null ? 'amber' : hrsSinceLog > 6 ? 'red' : hrsSinceLog > 3 ? 'amber' : 'green';
        return { ...b, lr, hrsSinceLog, hasAlarm, status };
      });
    }

    return {
      tasks:               tasksRes.data    || [],
      activeBatches:       [...batchMap.values()].slice(0, 3),
      activeFermentations,
      leaveApplications:   leavesRes.data   || [],
      recentActivity:      activityRes.data || [],
      unreadCount:         notifRes.count   || 0,
    };
  } catch (err) {
    console.error('[Dashboard SSR] fetchStaffDashboardData failed:', err);
    return null;
  }
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let employeeProfile = null;
  if (user?.email) {
    const { data: emp } = await supabase.from('employees').select('*').eq('email', user.email).single();
    employeeProfile = emp;
  }

  const role = employeeProfile?.role?.toLowerCase() || '';
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  // Pre-fetch the correct dataset server-side in parallel
  const [adminData, staffData] = await Promise.all([
    isAdmin ? fetchAdminDashboardStats() : Promise.resolve(null),
    !isAdmin && employeeProfile?.id ? fetchStaffDashboardData(employeeProfile.id) : Promise.resolve(null),
  ]);

  return (
    <DashboardClient
      employeeProfile={employeeProfile}
      isAdmin={isAdmin}
      initialAdminData={adminData}
      initialStaffData={staffData}
    />
  );
}
