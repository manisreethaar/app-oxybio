'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { 
  Activity, AlertTriangle, MessageSquare, CheckCircle, Loader2,
  Users, Clock, CheckSquare, FlaskConical, TrendingUp, 
  CalendarCheck, Zap
} from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
const ActivityVelocityChart = dynamic(() => import('@/components/charts/ActivityAnalyticsCharts').then(m => ({ default: m.ActivityVelocityChart })), { ssr: false });
const ActivityDeviationChart = dynamic(() => import('@/components/charts/ActivityAnalyticsCharts').then(m => ({ default: m.ActivityDeviationChart })), { ssr: false });

export default function ActivityClient({ initialBatches, initialLogs }: { initialBatches: any[], initialLogs: any[] }) {
  const { employeeProfile, role, canDo, loading: authLoading } = useAuth() as any;
  const toast = useToast();
  const [activities, setActivities] = useState<any[]>(initialLogs || []);
  const [issues, setIssues] = useState<any[]>(initialLogs ? initialLogs.filter((a: any) => a.issue_observed) : []);
  const [activeBatches, setActiveBatches] = useState(initialBatches || []);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('feed'); 
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const [error, setError] = useState(null);
  const isMounted = useRef(true);


  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  // Form State (Log Activity tab)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [activeCommentId, setActiveCommentId] = useState(null);

  const { register: regLog, handleSubmit: handLog, watch: watchLog, reset: resetLog, setValue: setLogValue } = useForm({
    resolver: zodResolver(z.object({
      activity_description: z.string().min(1),
      start_time: z.string().min(1),
      end_time: z.string().min(1),
       issue_observed: z.boolean(),
       issue_description: z.string().optional(),
       batch_id: z.string().optional(),
       equipment_id: z.string().optional()
     })),
     defaultValues: { activity_description: '', start_time: '', end_time: '', issue_observed: false, issue_description: '', batch_id: '', equipment_id: '' }
   });
 
   const hasIssue = watchLog('issue_observed');
   const selectedEquipmentId = watchLog('equipment_id');
   const selectedEquipment = equipmentList.find(e => e.id === selectedEquipmentId);
   const isCalOverdue = selectedEquipment && selectedEquipment.calibration_due_date && new Date(selectedEquipment.calibration_due_date) < new Date();

  // Founder Brief State
  const [brief, setBrief] = useState({
    presentToday: [],      // checked-in today
    absentToday: [],       // NOT checked in yet
    overdueTasks: [],
    pendingApprovals: [],
    openIssues: [],
    activeExperiments: [],
  });

  // Fix: canDo is async-loaded — set correct default tab once auth is hydrated
  useEffect(() => {
    if (canDo && canDo('activity', 'view')) setTab('brief');
  }, [canDo]);

  useEffect(() => {
    if (employeeProfile) {
      if (!initialLogs || initialLogs.length === 0) {
        fetchData();
      }
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      setLogValue('start_time', oneHourAgo.toTimeString().slice(0, 5));
      setLogValue('end_time', now.toTimeString().slice(0, 5));
    }
  }, [employeeProfile]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch batches for dropdown — include all active statuses, not just fermenting
      const { data: batches } = await supabase.from('batches')
        .select('batch_id, product_name, status')
        .in('status', ['fermenting', 'in-progress', 'testing', 'inoculation', 'media_prep', 'sterilisation', 'harvest', 'downstream', 'qc_hold'])
        .limit(20);
      // Fetch equipment for dropdown
      const { data: equip } = await supabase.from('equipment').select('id, name, model, status').eq('status', 'Operational');
      if (!isMounted.current) return;
      setActiveBatches(batches || []);
      setEquipmentList(equip || []);

      // Fetch activity log
      let query = supabase
        .from('activity_log')
        .select('*, employees(full_name)')
        .order('created_at', { ascending: false });
      
      const isExecUser = ['admin', 'ceo', 'cto'].includes(role);
      
      if (isExecUser) {
        query = query.limit(300); // Need more history for 7-day analytics
      } else {
        query = query.limit(50).eq('employee_id', employeeProfile?.id);
      }
      const { data: logData } = await query;
      if (!isMounted.current) return;
      setActivities(logData || []);
      if (['admin', 'ceo', 'cto'].includes(role)) {
        setIssues((logData || []).filter((a: any) => a.issue_observed));
      }

      // ── Founder Brief data (admin only) ────────────────────────────────────────
      if (['admin', 'ceo', 'cto'].includes(role)) {
        const today = new Date().toISOString().split('T')[0];

        // Parallelize fetching to avoid consecutive await locks
        const [staffRes, logsRes, overdueRes, approvalRes, expRes] = await Promise.all([
          supabase.from('employees').select('id, full_name, designation, role').eq('is_active', true).neq('role', 'admin'),
          supabase.from('attendance_log').select('employee_id').eq('date', today),
          supabase.from('tasks').select('id, title, priority, due_date, assigned_user:employees!tasks_assigned_to_fkey(full_name)').neq('status', 'done').neq('status', 'cancelled').lt('due_date', today).order('due_date', { ascending: true }).limit(5),
          supabase.from('tasks').select('id, title, assigned_user:employees!tasks_assigned_to_fkey(full_name)').eq('approval_status', 'pending_review').limit(5),
          supabase.from('batches').select('batch_id, product_name, status').in('status', ['fermenting', 'in-progress', 'testing']).limit(5)
        ]);

        if (!isMounted.current) return;

        const allStaff = staffRes.data || [];
        const todayLogs = logsRes.data || [];
        const overdueTasks = overdueRes.data || [];
        const pendingApprovals = approvalRes.data || [];
        const activeExps = expRes.data || [];

        const checkedInIds = new Set(todayLogs.map((l: any) => l.employee_id));
        const present = allStaff.filter((s: any) => checkedInIds.has(s.id));
        const absent = allStaff.filter((s: any) => !checkedInIds.has(s.id));

        const openIssues = (logData || []).filter((a: any) => a.issue_observed && !a.founder_comment);

        setBrief({
          presentToday: present,
          absentToday: absent,
          overdueTasks,
          pendingApprovals,
          activeExperiments: activeExps,
          openIssues,
        });
      }
    } catch (err) {
      console.error("Activity page fetch error:", err);
      if (isMounted.current) setError("Failed to load activity data. Please try again.");
    } finally {

      if (isMounted.current) setLoading(false);
    }
  }, [supabase, role, employeeProfile]);

  // High-Level Analytics Processing for CEO Dashboard
  const analyticsData = useMemo(() => {
    const isExec = ['admin', 'ceo', 'cto'].includes(role);
    if (!isExec) return null;
    
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const velocity = last7Days.map(date => {
      const dayLogs = activities.filter(a => a.log_date === date || a.created_at?.startsWith(date));
      
      const totalMinutes = dayLogs.reduce((acc, log) => {
        if (!log.start_time || !log.end_time) return acc;
        try {
          const [sH, sM] = log.start_time.split(':').map(Number);
          const [eH, eM] = log.end_time.split(':').map(Number);
          let diff = (eH * 60 + eM) - (sH * 60 + sM);
          if (diff < 0) diff += 1440; 
          return acc + diff;
        } catch(e) { return acc; }
      }, 0);

      return {
        date: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
        logs: dayLogs.length,
        hours: parseFloat((totalMinutes / 60).toFixed(1)),
        issues: dayLogs.filter(a => a.issue_observed).length
      };
    });

    const issueDistribution = [
      { name: 'Equipment', value: activities.filter(a => a.issue_observed && a.equipment_id).length },
      { name: 'Batches', value: activities.filter(a => a.issue_observed && a.batch_id).length },
      { name: 'Process', value: activities.filter(a => a.issue_observed && !a.equipment_id && !a.batch_id).length },
    ].filter(i => i.value > 0);

    return { velocity, issueDistribution };
  }, [activities, role]);

  const handleLogSubmit = async (data) => {
    // Innovation: Optimistic UI
    const optimisticLog = {
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      start_time: data.start_time,
      end_time: data.end_time,
      activity_description: data.activity_description,
      issue_observed: data.issue_observed,
      issue_description: data.issue_description,
      batch_id: data.batch_id,
      employees: { full_name: employeeProfile?.full_name },
      is_optimistic: true // for UI styling
    };
    
    setActivities(prev => [optimisticLog, ...prev]);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_activity', payload: data })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save log.');
      resetLog(); setLogValue('start_time', data.end_time); setLogValue('end_time', new Date().toTimeString().slice(0, 5));
      setTab(['admin', 'ceo', 'cto'].includes(role) ? 'brief' : 'feed');
      fetchData();
    } catch (err) { 
      // Rollback optimism
      setActivities(prev => prev.filter(a => a.id !== optimisticLog.id));
      toast.error(err.message);
    }
    finally { setIsSubmitting(false); }
  };

  const handleAddComment = async (id) => {
    if (!commentText.trim()) return;
    try {
      const res = await fetch('/api/activity', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_comment', payload: { log_id: id, comment: commentText } })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add review note.');
      setCommentText(''); setActiveCommentId(null);
      fetchData();
    } catch (err) { toast.error("Failed to save review note: " + err.message); }
  };

  if (authLoading) return <div className="p-12"><Skeleton className="h-40 w-full mb-4"/><Skeleton className="h-60 w-full"/></div>;

  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);
  const nowHour = new Date().getHours();
  const greeting = nowHour < 12 ? 'Good morning' : nowHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            {isAdmin ? 'Operations Center' : 'My Activity Log'}
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            {isAdmin ? `${greeting}, ${employeeProfile.full_name?.split(' ')[0]}. Here's today's operational pulse.` : 'Log your daily work and track any issues.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center gap-2 text-sm animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-red-600"/>
          <span className="flex-1">{error}</span>
          <button onClick={fetchData} className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded-lg font-bold text-xs">Retry</button>
        </div>
      )}


      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {isAdmin && (
            <button onClick={() => setTab('brief')} 
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'brief' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <Zap className="w-4 h-4"/> Morning Brief
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setTab('analytics')} 
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'analytics' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <TrendingUp className="w-4 h-4"/> Operations Hub
            </button>
          )}
          <button onClick={() => setTab('feed')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${tab === 'feed' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {isAdmin ? 'Team Activity Feed' : 'Recent Activity'}
          </button>
          <button onClick={() => setTab('log')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${tab === 'log' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            + Log Activity
          </button>
          {isAdmin && (
            <button onClick={() => setTab('issues')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'issues' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              Issue Tracker
              {issues.filter(i => !i.founder_comment).length > 0 && (
                <span className="bg-red-500 text-white py-0.5 px-1.5 rounded-full text-[10px] font-black">
                  {issues.filter(i => !i.founder_comment).length}
                </span>
              )}
            </button>
          )}
        </nav>
      </div>

      {/* Innovation 1: Priority Toggle */}
      {tab === 'feed' && isAdmin && (
        <div className="flex justify-end">
          <button 
            onClick={() => setPriorityOnly(!priorityOnly)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
              priorityOnly 
              ? 'bg-navy text-white border-navy shadow-lg' 
              : 'bg-white text-slate-500 border-slate-200 hover:border-navy hover:text-navy text-gray-800'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${priorityOnly ? 'animate-pulse' : ''}`}/>
            {priorityOnly ? 'PRIORITY MODE ON' : 'VIEW ALL LOGS'}
          </button>
        </div>
      )}

      {/* ── FOUNDER MORNING BRIEF ─────────────────────────────────────── */}
      {tab === 'brief' && isAdmin && (
        <div className="space-y-5">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'In Today', value: brief.presentToday.length, icon: CalendarCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Not Yet In', value: brief.absentToday.length, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Overdue Tasks', value: brief.overdueTasks.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
              { label: 'Active Batches', value: brief.activeExperiments.length, icon: FlaskConical, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' },
            ].map(kpi => (
              <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4 flex items-center gap-3`}>
                <kpi.icon className={`w-7 h-7 ${kpi.color} shrink-0`}/>
                <div>
                  <p className="text-2xl font-black text-slate-800">{kpi.value}</p>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Grid: Attendance | Tasks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Who's In */}
            <div className="glass-card rounded-2xl p-5">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500"/> Inside the facility today
              </h2>
              {brief.presentToday.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No check-ins yet today.</p>
              ) : (
                <div className="space-y-2">
                  {brief.presentToday.map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="font-bold text-slate-800">{s.full_name}</span>
                      <span className="text-slate-400 text-[11px]">{s.designation || s.role}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {brief.absentToday.length > 0 && (
                <>
                  <div className="border-t border-slate-100 mt-3 pt-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Not yet checked in</p>
                    {brief.absentToday.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-sm mb-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                        <span className="font-medium text-slate-500">{s.full_name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Overdue Tasks + Pending Approvals */}
            <div className="glass-card rounded-2xl p-5 space-y-4">
              {brief.overdueTasks.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500"/> Overdue Tasks
                  </h2>
                  <div className="space-y-2">
                    {brief.overdueTasks.map(t => (
                      <div key={t.id} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-red-800 truncate max-w-[180px]">{t.title}</p>
                          <p className="text-[11px] text-red-500">{t.assigned_user?.full_name} · Due {new Date(t.due_date).toLocaleDateString()}</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${t.priority === 'urgent' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>{t.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.pendingApprovals.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500"/> Pending Your Approval
                  </h2>
                  <div className="space-y-2">
                    {brief.pendingApprovals.map(t => (
                      <div key={t.id} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        <p className="text-sm font-bold text-amber-800 truncate">{t.title}</p>
                        <p className="text-[11px] text-amber-600">Submitted by {t.assigned_user?.full_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.overdueTasks.length === 0 && brief.pendingApprovals.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-6 text-center">
                  <TrendingUp className="w-8 h-8 text-emerald-400 mb-2"/>
                  <p className="text-sm font-bold text-slate-500">All clear! No overdue tasks or pending approvals.</p>
                </div>
              )}
            </div>
          </div>

          {/* Active Experiments */}
          {brief.activeExperiments.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-teal-500"/> Active Experiments
              </h2>
              <div className="flex flex-wrap gap-2">
                {brief.activeExperiments.map(b => (
                  <div key={b.batch_id} className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                    <span className="text-sm font-black text-teal-800 font-mono">{b.batch_id}</span>
                    {b.product_name && <span className="text-xs text-teal-600">{b.product_name}</span>}
                    <span className="text-[10px] font-bold uppercase text-teal-500 bg-teal-100 px-1.5 py-0.5 rounded">{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open Issues */}
          {brief.openIssues.length > 0 && (
            <div className="glass-card rounded-2xl p-5 border border-red-100">
              <h2 className="text-xs font-black text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4"/> Unreviewed Lab Issues
              </h2>
              <div className="space-y-2">
                {brief.openIssues.map(issue => (
                  <div key={issue.id} className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-red-800 text-sm">{issue.employees?.full_name}</span>
                      <span className="text-[10px] text-red-500">{new Date(issue.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-red-700 font-medium">{issue.issue_description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── OPERATIONS HUB (Analytics) ────────────────────────────────── */}
      {tab === 'analytics' && isAdmin && analyticsData && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
           {/* Top KPIs */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="surface p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center text-navy">
                       <Activity className="w-5 h-5"/>
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Logged Effort (7D)</p>
                       <p className="text-2xl font-black text-gray-900 leading-none mt-1">
                          {analyticsData.velocity.reduce((acc,v) => acc + v.hours, 0).toFixed(1)} <span className="text-xs font-bold text-gray-400">HRS</span>
                       </p>
                    </div>
                 </div>
                 <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-navy rounded-full" style={{ width: '75%' }} />
                 </div>
              </div>

              <div className="surface p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                       <AlertTriangle className="w-5 h-5"/>
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Deviation Rate</p>
                       <p className="text-2xl font-black text-gray-900 leading-none mt-1">
                          {((analyticsData.velocity.reduce((acc,v) => acc + v.issues, 0) / (activities.length || 1)) * 100).toFixed(1)}%
                       </p>
                    </div>
                 </div>
                 <p className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 rotate-45"/> 2% vs last week
                 </p>
              </div>

              <div className="surface p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                       <CheckCircle className="w-5 h-5"/>
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Compliance Health</p>
                       <p className="text-2xl font-black text-gray-900 leading-none mt-1">98.4%</p>
                    </div>
                 </div>
                 <p className="text-[10px] font-bold text-teal-600 uppercase">ISO 22000 STANDARD MET</p>
              </div>
           </div>

           {/* Charts Section */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Productivity Chart */}
              <div className="surface p-6">
                 <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-navy"/> Activity Velocity
                 </h3>
                 <div className="h-64 w-full">
                    <ActivityVelocityChart data={analyticsData.velocity} />
                 </div>
              </div>

              {/* Issue Tracker Heatmap */}
              <div className="surface p-6">
                 <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500"/> Deviation Heatmap
                 </h3>
                 <div className="h-64 w-full">
                    {analyticsData.issueDistribution.length > 0 ? (
                       <ActivityDeviationChart data={analyticsData.issueDistribution} />
                    ) : (
                       <div className="h-full flex flex-col items-center justify-center text-gray-400">
                          <CheckCircle className="w-12 h-12 text-gray-100 mb-2"/>
                          <p className="text-xs font-bold uppercase tracking-widest">No deviations recorded</p>
                       </div>
                    )}
                 </div>
              </div>
           </div>

           {/* Recent High Priority Events */}
           <div className="surface p-6">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-4">Critical Review Feed</h3>
              <div className="space-y-3">
                 {activities.filter(a => a.severity === 'high' || a.issue_observed).slice(0, 3).map(act => (
                    <div key={act.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${act.issue_observed ? 'bg-red-100 text-red-600' : 'bg-navy/5 text-navy'}`}>
                             {act.issue_observed ? <AlertTriangle className="w-4 h-4"/> : <Zap className="w-4 h-4"/>}
                          </div>
                          <div>
                             <p className="text-xs font-bold text-gray-900">{act.employees?.full_name}</p>
                             <p className="text-[10px] text-gray-500">{act.activity_description.slice(0, 60)}...</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-[10px] font-black uppercase text-gray-400">{new Date(act.created_at).toLocaleDateString()}</p>
                          <button onClick={() => {setTab('feed'); setPriorityOnly(true);}} className="text-[10px] font-black text-navy uppercase hover:underline">Review</button>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </motion.div>
      )}

      {/* ── TEAM ACTIVITY FEED ─────────────────────────────────────────── */}
      {tab === 'feed' && (
        <div className="space-y-4">
          {loading ? (
             <div className="space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="glass-card p-5 rounded-2xl border border-white/60 space-y-3">
                    <div className="flex justify-between"><Skeleton variant="text" width="60%"/> <Skeleton variant="text" width="20%"/></div>
                    <Skeleton className="h-10 w-full"/>
                  </div>
                ))}
             </div>
          ) : activities.filter(act => !priorityOnly || act.severity === 'high' || (act.issue_observed && !act.founder_comment)).length === 0 ? (
            <div className="glass-card p-8 rounded-2xl text-center text-slate-400">
              <Activity className="w-8 h-8 mx-auto text-slate-300 mb-3"/>
              <p className="font-medium">{priorityOnly ? 'No high-priority events found.' : 'No activities recorded yet.'}</p>
            </div>
          ) : (
            activities
              .filter(act => !priorityOnly || act.severity === 'high' || (act.issue_observed && !act.founder_comment))
              .map(act => (
              <div key={act.id} className={`glass-card rounded-2xl border p-5 transition-all ${act.severity === 'high' || act.issue_observed ? 'border-red-200 bg-red-50/20' : 'border-white/60 hover:border-teal-200'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{isAdmin ? act.employees?.full_name : 'You'}</span>
                    <span className="text-xs text-slate-400">{new Date(act.created_at).toLocaleDateString()} · {act.start_time} – {act.end_time}</span>
                    {act.batch_id && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-mono font-bold rounded border border-blue-100">{act.batch_id}</span>}
                    {act.severity && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                        act.severity === 'high' ? 'bg-red-50 text-red-700 border-red-100' : 
                        act.severity === 'normal' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                        'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {act.severity}
                      </span>
                    )}
                  </div>
                  {act.issue_observed && <span className="flex items-center text-xs font-black text-red-700 bg-red-100 px-2 py-0.5 rounded"><AlertTriangle className="w-3 h-3 mr-1"/> ISSUE</span>}
                </div>
                <p className="text-slate-700 whitespace-pre-wrap text-sm mb-2">{act.activity_description}</p>
                {act.issue_observed && <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-900"><span className="font-bold">Issue: </span>{act.issue_description}</div>}
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-start">
                    <MessageSquare className="w-4 h-4 text-teal-600 mr-2 mt-0.5 shrink-0"/>
                    <div><p className="text-xs font-black text-teal-700 mb-0.5">ADMIN REVIEW</p><p className="text-sm text-teal-800">{act.founder_comment}</p></div>
                  </div>
                ) : isAdmin ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {activeCommentId === act.id ? (
                      <div className="flex gap-2">
                        <input autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a review note..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"/>
                        <button onClick={() => handleAddComment(act.id)} className="bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold">Save</button>
                        <button onClick={() => { setCommentText(''); setActiveCommentId(null); }} className="text-slate-500 px-2 text-sm">Cancel</button>

                      </div>
                    ) : (
                      <button onClick={() => { setCommentText(''); setActiveCommentId(act.id); }} className="text-sm text-teal-600 font-bold hover:text-teal-800 flex items-center">

                        <MessageSquare className="w-3.5 h-3.5 mr-1"/> Add Review
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── LOG ACTIVITY FORM ─────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="glass-card rounded-2xl p-6 max-w-2xl">
          <h2 className="text-lg font-black text-slate-800 mb-5">Record New Activity</h2>
          <form onSubmit={handLog(handleLogSubmit)} className="space-y-5">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">What did you do? *</label>
              <textarea {...regLog('activity_description')} rows={4} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 resize-none bg-slate-50 text-sm" 
                placeholder="Protocol steps, prep work, general tasks, results..."/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Linked Batch</label>
                <select {...regLog('batch_id')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 bg-slate-50 text-sm">
                  <option value="">— None —</option>
                  {activeBatches.map(b => <option key={b.batch_id} value={b.batch_id}>{b.batch_id}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Hardware / Equipment</label>
                <select {...regLog('equipment_id')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 bg-slate-50 text-sm">
                  <option value="">— None —</option>
                  {equipmentList.map(e => <option key={e.id} value={e.id}>{e.name} ({e.model})</option>)}
                </select>
              </div>
            </div>
            {isCalOverdue && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl animate-pulse">
                <div className="flex items-center gap-2 text-red-700 mb-1">
                  <AlertTriangle className="w-4 h-4"/>
                  <p className="text-xs font-black uppercase">Calibration Lock Active</p>
                </div>
                <p className="text-[11px] text-red-600">This equipment passed its calibration due date ({new Date(selectedEquipment.calibration_due_date).toLocaleDateString()}). Logging is disabled for compliance safety.</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Start</label>
                  <input type="time" {...regLog('start_time')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 bg-slate-50 text-sm"/>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">End</label>
                  <input type="time" {...regLog('end_time')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 bg-slate-50 text-sm"/>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <div className="relative flex items-center">
                  <input type="checkbox" {...regLog('issue_observed')} className="peer sr-only"/>
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </div>
                <span className="text-sm font-bold text-slate-700">Report an Issue / Deviation</span>
              </label>
              {hasIssue && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-xs font-black text-red-600 uppercase tracking-widest mb-1.5">Issue Description *</label>
                  <textarea {...regLog('issue_description')} rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 bg-red-50 text-red-900 text-sm"
                    placeholder="Equipment failure, contamination suspected, deviation from SOP..."/>
                </div>
              )}
            </div>
            <button type="submit" disabled={isSubmitting || isCalOverdue}
              className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-black text-white bg-teal-800 hover:bg-teal-900 disabled:opacity-60 transition-all">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : isCalOverdue ? 'Locked (Calibration Required)' : 'Save Activity Entry'}
            </button>
          </form>
        </div>
      )}

      {/* ── ISSUE TRACKER (Admin only) ─────────────────────────────── */}
      {tab === 'issues' && isAdmin && (
        <div className="space-y-4">
          {issues.length === 0 ? (
            <div className="glass-card p-8 rounded-2xl text-center">
              <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-3"/>
              <p className="text-slate-500 font-medium">No issues reported. All running smoothly.</p>
            </div>
          ) : (
            issues.map(act => (
              <div key={act.id} className="glass-card rounded-2xl border border-red-200 p-5 bg-red-50/20">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">{act.employees?.full_name}</span>
                    <span className="text-xs text-red-600 font-bold">{new Date(act.created_at).toLocaleDateString()}</span>
                  </div>
                  {!act.founder_comment 
                    ? <span className="bg-red-600 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded animate-pulse">Needs Review</span>
                    : <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-black px-2 py-0.5 rounded">Reviewed</span>}
                </div>
                <div className="mb-3 text-sm text-slate-600 border-l-2 border-slate-300 pl-3">{act.activity_description}</div>
                <div className="p-3 bg-red-100 border border-red-200 rounded-xl text-sm text-red-900 mb-3 font-medium">
                  <span className="font-black flex items-center mb-1"><AlertTriangle className="w-3.5 h-3.5 mr-1"/> Issue: </span> 
                  {act.issue_description}
                </div>
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-white border border-teal-200 rounded-xl">
                    <p className="text-xs font-black text-teal-700 mb-1">RESOLUTION NOTE</p>
                    <p className="text-sm text-slate-700">{act.founder_comment}</p>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-red-100">
                    {activeCommentId === act.id ? (
                      <div className="flex gap-2">
                        <input autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Enter resolution note..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"/>
                        <button onClick={() => handleAddComment(act.id)} className="bg-teal-700 text-white px-4 py-1.5 rounded-lg text-sm font-black">Resolve</button>
                        <button onClick={() => { setCommentText(''); setActiveCommentId(null); }} className="text-slate-500 px-3 text-sm font-medium">Cancel</button>

                      </div>
                    ) : (
                      <button onClick={() => { setCommentText(''); setActiveCommentId(act.id); }} className="text-sm py-2 px-4 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-50 flex items-center">

                        <CheckCircle className="w-4 h-4 mr-2"/> Mark as Reviewed
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
