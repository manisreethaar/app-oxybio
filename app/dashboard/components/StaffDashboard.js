'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { CheckSquare, Activity, Bell, Clock, ChevronRight, FlaskConical, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import MyPendingActionsWidget from './MyPendingActionsWidget';

const CL_ONLY_ROLES = ['intern', 'research_intern', 'research_fellow'];

function calculateEarnedCL(joinedDate, today = new Date()) {
  const doj = new Date(joinedDate);
  const currentYear = today.getFullYear();
  const dojYear = doj.getFullYear();
  if (dojYear === currentYear) {
    let earned = 6;
    const sixMonthMark = new Date(doj.getFullYear(), doj.getMonth() + 6, doj.getDate());
    if (today >= sixMonthMark) {
      let firstMonthly = new Date(sixMonthMark.getFullYear(), sixMonthMark.getMonth() + 1, 1);
      while (firstMonthly <= today && firstMonthly.getFullYear() === currentYear) {
        earned += 1;
        firstMonthly = new Date(firstMonthly.getFullYear(), firstMonthly.getMonth() + 1, 1);
      }
    }
    return earned;
  } else {
    let earned = 0;
    let firstOfMonth = new Date(currentYear, 0, 1);
    while (firstOfMonth <= today) {
      earned += 1;
      firstOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 1);
    }
    return earned;
  }
}

/** Visual progress bar for leave balance */
function LeaveBar({ label, used, total, color }) {
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const barColor = {
    blue:    'bg-slate-500',
    emerald: 'bg-emerald-500',
    slate:  'bg-slate-500',
  }[color] || 'bg-slate-400';
  const textColor = {
    blue:    'text-slate-600',
    emerald: 'text-emerald-600',
    slate:  'text-slate-600',
  }[color] || 'text-slate-600';

  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</span>
        <span className={`text-base font-black ${textColor}`}>
          {remaining} <span className="text-xs text-slate-400 font-semibold">/ {total} days</span>
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function StaffDashboard({ employeeProfile }) {
  const employeeId = employeeProfile?.id;
  const empRole = employeeProfile?.role?.toLowerCase() || '';
  const isClOnly = CL_ONLY_ROLES.includes(empRole);

  const earnedCL = isClOnly && employeeProfile?.joined_date
    ? calculateEarnedCL(employeeProfile.joined_date)
    : 0;

  const limits = {
    casual:  isClOnly ? earnedCL        : (employeeProfile?.casual_leave_balance  ?? 12),
    medical: isClOnly ? 0               : (employeeProfile?.medical_leave_balance ?? 6),
    earned:  isClOnly ? 0               : (employeeProfile?.earned_leave_balance  ?? 15),
  };

  const [tasks,                setTasks]                = useState([]);
  const [activeBatches,        setActiveBatches]        = useState([]);
  const [activeFermentations,  setActiveFermentations]  = useState([]);
  const [leaveStats,           setLeaveStats]           = useState({ casual: 0, medical: 0, earned: 0 });
  const [recentActivity,       setRecentActivity]       = useState([]);
  const [unreadCount,          setUnreadCount]          = useState(0);
  const [loading,              setLoading]              = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { fetchStaffData(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStaffData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      // A stalled Supabase connection otherwise leaves this page spinning
      // forever with no way out except a manual refresh — see the same
      // pattern in app/tasks/page.js and app/profile/page.js.
      await withTimeout((async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [tasksRes, leavesRes, batchesRes, activityRes, notifRes] = await Promise.all([
        // My open tasks
        supabase.from('tasks')
          .select('id, title, priority, due_date, status, assigned_to')
          .eq('assigned_to', employeeId)
          .in('status', ['open', 'in-progress'])
          .order('due_date', { ascending: true })
          .limit(5),

        // My approved leaves
        supabase.from('leave_applications')
          .select('leave_type, start_date, end_date')
          .eq('employee_id', employeeId)
          .eq('status', 'approved'),

        // Only batches that have tasks assigned to me (via task batch_id)
        supabase.from('tasks')
          .select('batch_id, batches!inner(id, batch_id, current_stage, product_name)')
          .eq('assigned_to', employeeId)
          .in('status', ['open', 'in-progress'])
          .not('batch_id', 'is', null)
          .limit(3),

        // My activity today
        supabase.from('activity_log')
          .select('id, activity_description, start_time, end_time, created_at, issue_observed')
          .eq('employee_id', employeeId)
          .is('archived_at', null)
          .gte('created_at', todayStart.toISOString())
          .order('created_at', { ascending: false })
          .limit(5),

        // My unread notifications
        supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employeeId)
          .eq('is_read', false),
      ]);

      setTasks(tasksRes.data || []);

      // Deduplicate batches from task results
      const batchMap = new Map();
      (batchesRes.data || []).forEach(t => {
        if (t.batches && !batchMap.has(t.batches.id)) batchMap.set(t.batches.id, t.batches);
      });
      setActiveBatches([...batchMap.values()].slice(0, 3));

      // 3A: Active Fermentations widget — fetch in-progress fermentation batches with last reading
      try {
        const { data: fermBatches } = await supabase
          .from('batches')
          .select('id, batch_id, current_stage')
          .eq('current_stage', 'fermentation')
          .not('status', 'in', '("released","rejected")')
          .is('archived_at', null)
          .limit(10);

        if (fermBatches?.length) {
          const batchIds = fermBatches.map(b => b.id);
          // Get latest reading per batch
          const { data: latestReadings } = await supabase
            .from('batch_fermentation_readings')
            .select('batch_id, ph, is_ph_alarm, is_temp_alarm, logged_at, elapsed_hours')
            .in('batch_id', batchIds)
            .order('logged_at', { ascending: false });

          // Reduce to one reading per batch (latest)
          const latestMap = new Map();
          (latestReadings || []).forEach(r => {
            if (!latestMap.has(r.batch_id)) latestMap.set(r.batch_id, r);
          });

          const now = Date.now();
          const enriched = fermBatches.map(b => {
            const lr = latestMap.get(b.id);
            const hrsSinceLog = lr?.logged_at
              ? (now - new Date(lr.logged_at).getTime()) / 3600000
              : null;
            const hasAlarm = lr?.is_ph_alarm || lr?.is_temp_alarm;
            // No readings yet = amber (needs first log); alarm = red; >6h = red; >3h = amber; else green
            const status =
              hasAlarm ? 'red' :
              hrsSinceLog === null ? 'amber' :
              hrsSinceLog > 6 ? 'red' :
              hrsSinceLog > 3 ? 'amber' : 'green';
            return { ...b, lr, hrsSinceLog, hasAlarm, status };
          }); // show ALL fermenting batches, even those with no readings yet

          setActiveFermentations(enriched);
        } else {
          setActiveFermentations([]);
        }
      } catch (fermErr) {
        console.error('Fermentation widget fetch error:', fermErr);
      }

      setRecentActivity(activityRes.data || []);
      setUnreadCount(notifRes.count || 0);

      let c = 0, m = 0, e = 0;
      (leavesRes.data || []).forEach(l => {
        if (!l.start_date || !l.end_date) return;
        const days = Math.ceil((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / (1000 * 3600 * 24)) + 1;
        if (l.leave_type === 'Casual') c += days;
        if (l.leave_type === 'Sick')   m += days;
        if (l.leave_type === 'Earned') e += days;
      });
      setLeaveStats({ casual: c, medical: m, earned: e });
      })(), 20000, 'Dashboard load timed out');
    } catch (error) {
      console.error('Error fetching staff dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-8">
        <Skeleton className="h-40 w-full rounded-2xl"/>
        <Skeleton className="h-40 w-full rounded-2xl"/>
        <Skeleton className="h-64 w-full rounded-2xl"/>
      </div>
      <Skeleton className="h-80 w-full rounded-2xl"/>
    </div>
  );

  const nextStepMap = {
    media_prep:    'Initialize Fermentation Cycle',
    fermentation:  'Conduct Sampling & QA Analysis',
    testing:       'Finalize QC & Package Approval',
    formulation:   'Validate Ingredient Ratios',
    inoculation:   'Monitor Inoculation Progress',
    sterilisation: 'Verify Sterilisation Completion',
    qc_hold:       'Await QC Release Decision',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in duration-300">
      <div className="md:col-span-2 space-y-8">

        {/* Quick Actions CTA */}
        <div className="card p-8 flex flex-col sm:flex-row items-center justify-between">
          <div className="mb-4 sm:mb-0 text-center sm:text-left">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-1">Ready to Log Data?</h2>
            <p className="text-sm text-slate-500">Capture real-time pH metrics and shift activities instantly.</p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <Link href="/notifications" className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-xl text-sm hover:bg-amber-100 transition-colors">
                <Bell className="w-4 h-4" />
                {unreadCount} unread
              </Link>
            )}
            <Link href="/activity" className="px-5 py-3 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl flex items-center justify-center shadow-sm transition-colors text-sm">
              <Activity className="w-4 h-4 mr-2" /> Initiate Activity
            </Link>
          </div>
        </div>

        {/* Contextual Batch Prompt — only my task-linked batches */}
        {activeBatches.length > 0 && (
          <div className="card border-l-4 border-navy p-6 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">My Active Batches</h2>
              <span className="bg-navy text-white text-xs font-black px-2 py-0.5 rounded">ACTION REQUIRED</span>
            </div>
            {activeBatches.map(batch => (
              <div key={batch.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 group hover:border-navy transition-all">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Batch {batch.batch_id} · {batch.product_name || 'Generic'}</p>
                  <p className="text-sm font-black text-slate-900">Next: {nextStepMap[batch.current_stage] || 'Monitor Process Status'}</p>
                </div>
                <Link href={`/batches/${batch.id}`} className="text-xs font-black text-navy bg-white border border-slate-200 px-3 py-2 rounded-lg group-hover:bg-navy group-hover:text-white group-hover:border-navy transition-all">
                  GO TO BATCH
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* 3A: Active Fermentations Monitoring Widget */}
        {activeFermentations.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-navy" />
                <h2 className="text-sm font-black text-slate-900">Active Fermentations</h2>
                <span className="text-xs font-black text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">{activeFermentations.length}</span>
              </div>
              <Link href="/batches" className="text-xs font-bold text-slate-500 hover:text-navy transition-colors">View All →</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {activeFermentations.map(b => {
                const statusColors = {
                  green: { dot: 'bg-emerald-500', row: '', badge: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
                  amber: { dot: 'bg-amber-400', row: 'bg-amber-50/30', badge: 'text-amber-700 bg-amber-50 border-amber-200' },
                  red:   { dot: 'bg-red-500', row: 'bg-red-50/30', badge: 'text-red-700 bg-red-50 border-red-200' },
                }[b.status];

                const hrsLabel = b.hrsSinceLog !== null
                  ? b.hrsSinceLog < 1 ? `${Math.round(b.hrsSinceLog * 60)}m ago`
                    : `${b.hrsSinceLog.toFixed(1)}h ago`
                  : 'No logs';

                return (
                  <Link
                    key={b.id}
                    href={`/batches/${b.id}`}
                    className={`flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors ${statusColors.row}`}
                  >
                    <div className="relative shrink-0">
                      <div className={`w-2 h-2 rounded-full ${statusColors.dot}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 font-mono">{b.batch_id}</p>
                      <p className="text-xs text-slate-400 font-semibold">
                        pH {b.lr?.ph?.toFixed(2) ?? '—'} · Last log: {hrsLabel}
                      </p>
                    </div>
                    {b.hasAlarm && (
                      <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${statusColors.badge} flex items-center gap-1`}>
                        <AlertTriangle className="w-2.5 h-2.5" /> ALARM
                      </span>
                    )}
                    {!b.hasAlarm && (
                      <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${statusColors.badge}`}>
                        {b.hrsSinceLog === null ? 'LOG NOW' : b.status === 'red' ? 'OVERDUE' : b.status === 'amber' ? 'DUE SOON' : 'OK'}
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Unified My Pending Actions Widget */}
        <MyPendingActionsWidget />

        {/* My Activity Today */}
        {recentActivity.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" /> My Activity Today
              </h2>
              <Link href="/activity" className="text-xs font-bold text-slate-500 hover:text-navy transition-colors">Full Log →</Link>
            </div>
            <ul className="divide-y divide-gray-50">
              {recentActivity.map(act => (
                <li key={act.id} className="px-6 py-3 flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${act.issue_observed ? 'bg-red-500' : 'bg-emerald-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{act.activity_description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{act.start_time} – {act.end_time}</p>
                  </div>
                  {act.issue_observed && (
                    <span className="text-xs font-black text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded shrink-0">ISSUE</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="space-y-8">

        {/* Leave Balance with Progress Bars */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Time Off Balances</h2>
          </div>
          <div className="p-6 space-y-5">
            <LeaveBar label="Casual Leave" used={leaveStats.casual} total={limits.casual} color="blue" />
            {isClOnly ? (
              <div className="text-xs text-slate-400 font-medium bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <span className="font-bold text-slate-600">CL Policy:</span> 1 day earned per month since your joining date.
              </div>
            ) : (
              <>
                <LeaveBar label="Medical Leave" used={leaveStats.medical} total={limits.medical} color="emerald" />
                <LeaveBar label="Earned Leave"  used={leaveStats.earned}  total={limits.earned}  color="slate" />
              </>
            )}
            <Link href="/leave" className="mt-2 block w-full py-2.5 text-center text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
              Submit Requisition
            </Link>
          </div>
        </div>

        {/* Quick links */}
        <div className="card p-5">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Quick Access</h2>
          <div className="space-y-1">
            {[
              { label: 'Attendance', href: '/attendance' },
              { label: 'Lab Notebook', href: '/lab-notebook' },
              { label: 'SOPs', href: '/sops' },
              { label: 'Notifications', href: '/notifications', badge: unreadCount },
            ].map(({ label, href, badge }) => (
              <Link key={href} href={href} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
                <span className="text-sm font-semibold text-slate-700 group-hover:text-navy">{label}</span>
                <div className="flex items-center gap-2">
                  {badge > 0 && <span className="text-xs font-black text-white bg-red-500 px-1.5 py-0.5 rounded-full">{badge}</span>}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-navy" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
