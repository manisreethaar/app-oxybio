'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { CheckSquare, Activity, Bell, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';

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
    blue:    'bg-blue-500',
    emerald: 'bg-emerald-500',
    violet:  'bg-violet-500',
  }[color] || 'bg-gray-400';
  const textColor = {
    blue:    'text-blue-600',
    emerald: 'text-emerald-600',
    violet:  'text-violet-600',
  }[color] || 'text-gray-600';

  return (
    <div>
      <div className="flex justify-between items-end mb-1">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">{label}</span>
        <span className={`text-base font-black ${textColor}`}>
          {remaining} <span className="text-xs text-gray-400 font-semibold">/ {total} days</span>
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
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

  const [tasks,           setTasks]           = useState([]);
  const [activeBatches,   setActiveBatches]   = useState([]);
  const [leaveStats,      setLeaveStats]      = useState({ casual: 0, medical: 0, earned: 0 });
  const [recentActivity,  setRecentActivity]  = useState([]);
  const [unreadCount,     setUnreadCount]     = useState(0);
  const [loading,         setLoading]         = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { fetchStaffData(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStaffData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
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
        <div className="surface p-8 flex flex-col sm:flex-row items-center justify-between">
          <div className="mb-4 sm:mb-0 text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Ready to Log Data?</h2>
            <p className="text-sm text-gray-500">Capture real-time pH metrics and shift activities instantly.</p>
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
          <div className="bg-white border-l-4 border-navy p-6 rounded-xl shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">My Active Batches</h2>
              <span className="bg-navy text-white text-[10px] font-black px-2 py-0.5 rounded animate-pulse">ACTION REQUIRED</span>
            </div>
            {activeBatches.map(batch => (
              <div key={batch.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 group hover:border-navy transition-all">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Batch {batch.batch_id} · {batch.product_name || 'Generic'}</p>
                  <p className="text-sm font-black text-gray-900">Next: {nextStepMap[batch.current_stage] || 'Monitor Process Status'}</p>
                </div>
                <Link href={`/batches/${batch.id}`} className="text-[10px] font-black text-navy bg-white border border-gray-200 px-3 py-2 rounded-lg group-hover:bg-navy group-hover:text-white group-hover:border-navy transition-all">
                  GO TO BATCH
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* My Tasks */}
        <div className="surface overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Active Operations</h2>
            <Link href="/tasks" className="text-xs font-bold text-gray-500 hover:text-navy transition-colors">View All →</Link>
          </div>
          <div>
            {tasks.length === 0 ? (
              <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center mb-4 border border-gray-100 shadow-sm">
                  <CheckSquare className="w-6 h-6 text-gray-400" />
                </div>
                <p className="font-bold text-gray-700">All Operations Nominal.</p>
                <p className="text-xs text-gray-500 mt-0.5">No critical action items assigned.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {tasks.map(task => (
                  <li key={task.id} className="p-6 hover:bg-gray-50/50 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between group">
                    <div className="mb-4 sm:mb-0">
                      <p className="text-base font-bold tracking-tight text-gray-800 mb-2">{task.title}</p>
                      <div className="flex flex-wrap items-center text-xs gap-2">
                        <span className={`px-2 py-1 rounded font-bold border ${
                          task.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-100' :
                          task.priority === 'high'   ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                       'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {task.priority?.toUpperCase()}
                        </span>
                        <span className="font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded border border-gray-200">
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Link href="/tasks" className="w-full sm:w-auto text-center px-4 py-2 bg-white hover:bg-gray-50 font-bold text-gray-700 rounded-lg shadow-sm border border-gray-200 transition-colors text-xs">
                      Engage
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* My Activity Today */}
        {recentActivity.length > 0 && (
          <div className="surface overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" /> My Activity Today
              </h2>
              <Link href="/activity" className="text-xs font-bold text-gray-500 hover:text-navy transition-colors">Full Log →</Link>
            </div>
            <ul className="divide-y divide-gray-50">
              {recentActivity.map(act => (
                <li key={act.id} className="px-6 py-3 flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${act.issue_observed ? 'bg-red-500' : 'bg-emerald-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{act.activity_description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{act.start_time} – {act.end_time}</p>
                  </div>
                  {act.issue_observed && (
                    <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded shrink-0">ISSUE</span>
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
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Time Off Balances</h2>
          </div>
          <div className="p-6 space-y-5">
            <LeaveBar label="Casual Leave" used={leaveStats.casual} total={limits.casual} color="blue" />
            {isClOnly ? (
              <div className="text-xs text-gray-400 font-medium bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <span className="font-bold text-blue-600">CL Policy:</span> 1 day earned per month since your joining date.
              </div>
            ) : (
              <>
                <LeaveBar label="Medical Leave" used={leaveStats.medical} total={limits.medical} color="emerald" />
                <LeaveBar label="Earned Leave"  used={leaveStats.earned}  total={limits.earned}  color="violet" />
              </>
            )}
            <Link href="/leave" className="mt-2 block w-full py-2.5 text-center text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
              Submit Requisition
            </Link>
          </div>
        </div>

        {/* Quick links */}
        <div className="surface p-5">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Quick Access</h2>
          <div className="space-y-1">
            {[
              { label: 'Attendance', href: '/attendance' },
              { label: 'Lab Notebook', href: '/lab-notebook' },
              { label: 'SOPs', href: '/sops' },
              { label: 'Notifications', href: '/notifications', badge: unreadCount },
            ].map(({ label, href, badge }) => (
              <Link key={href} href={href} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                <span className="text-sm font-semibold text-gray-700 group-hover:text-navy">{label}</span>
                <div className="flex items-center gap-2">
                  {badge > 0 && <span className="text-[10px] font-black text-white bg-red-500 px-1.5 py-0.5 rounded-full">{badge}</span>}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-navy" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
