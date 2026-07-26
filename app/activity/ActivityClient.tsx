// @ts-nocheck
'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  Activity, AlertTriangle, MessageSquare, CheckCircle, Loader2,
  Users, Clock, CheckSquare, FlaskConical, TrendingUp,
  CalendarCheck, Zap, Archive, Trash2, Edit2, X, Send, LogOut
} from 'lucide-react';
import { downloadCsvWithHash } from '@/utils/exportUtils';
import { useRouter } from 'next/navigation';
import Skeleton from '@/components/Skeleton';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
const ActivityVelocityChart = dynamic(() => import('@/components/charts/ActivityAnalyticsCharts').then(m => ({ default: m.ActivityVelocityChart })), { ssr: false });
const ActivityDeviationChart = dynamic(() => import('@/components/charts/ActivityAnalyticsCharts').then(m => ({ default: m.ActivityDeviationChart })), { ssr: false });

export default function ActivityClient({ initialBatches, initialLogs }: { initialBatches: any[], initialLogs: any[] }) {
  const { employeeProfile, role, canDo, loading: authLoading } = useAuth() as any;
  const toast = useToast();
  const [activities, setActivities] = useState<any[]>(initialLogs || []);
  const [archivedActivities, setArchivedActivities] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [activeBatches, setActiveBatches] = useState(initialBatches || []);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('feed'); 
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [activityOffset, setActivityOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [error, setError] = useState(null);
  const isMounted = useRef(true);
  const isAdmin = useMemo(() => ['admin', 'ceo', 'cto'].includes(role), [role]);

  // Edit/Delete request state (staff → admin approval flow)
  const [editModal, setEditModal] = useState<any>(null); // the activity being edited
  const [editForm, setEditForm] = useState<any>({
    activity_description: '',
    start_time: '',
    end_time: '',
    issue_observed: false,
    issue_description: '',
  });
  const [requestingDelete, setRequestingDelete] = useState<string | null>(null); // activity id awaiting delete confirmation
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [adminEditPayload, setAdminEditPayload] = useState<{ id: string, action: string, updates: any } | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [myPendingIds, setMyPendingIds] = useState<Set<string>>(new Set());


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
   const isCalOverdue = selectedEquipment && selectedEquipment.requires_calibration !== false && selectedEquipment.calibration_due_date && new Date(selectedEquipment.calibration_due_date) < new Date();

  // Founder Brief State
  const [brief, setBrief] = useState({
    presentToday: [],      // checked-in today, not checked out
    absentToday: [],       // NOT checked in yet
    checkedOutToday: [],   // checked in and checked out
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
      fetchData();
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      setLogValue('start_time', oneHourAgo.toTimeString().slice(0, 5));
      setLogValue('end_time', now.toTimeString().slice(0, 5));

      // Realtime: prepend new activity_log entries as they arrive
      const isExecUser = ['admin', 'ceo', 'cto'].includes(role);
      const channel = supabase
        .channel('activity-log-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'activity_log' },
          (payload) => {
            if (!isMounted.current) return;
            // For staff: only show own entries. For admin: show all.
            if (!isExecUser && payload.new.employee_id !== employeeProfile?.id) return;
            // Realtime INSERT payloads don't include joined data — resolve name locally
            const resolvedName =
              allEmployees.find((e: any) => e.id === payload.new.employee_id)?.full_name ||
              (payload.new.employee_id === employeeProfile?.id ? employeeProfile?.full_name : null) ||
              '...';
            setActivities(prev => [{ ...payload.new, employees: { full_name: resolvedName } }, ...prev]);
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeProfile]);

  const fetchData = useCallback(async (append = false) => {
    if (!append) setLoading(true);
    setError(null);

    try {
      await withTimeout((async () => {
      // Fetch batches for dropdown
      const { data: batches } = await supabase.from('batches')
        .select('batch_id, product_name, status')
        .is('archived_at', null)
        .in('status', ['fermenting', 'in-progress', 'testing', 'inoculation', 'media_prep', 'sterilisation', 'harvest', 'downstream', 'qc_hold'])
        .limit(20);
      const { data: equip } = await supabase.from('equipment').select('id, name, model, status').eq('status', 'Operational');
      if (!isMounted.current) return;
      setActiveBatches(batches || []);
      setEquipmentList(equip || []);

      // Build activity log query
      const PAGE_SIZE = 50;
      const offset = append ? activityOffset : 0;
      const isExecUser = ['admin', 'ceo', 'cto'].includes(role);

      let query = supabase
        .from('activity_log')
        .select('id, created_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, batch_id, severity, founder_comment, employee_id, archived_at, employees!activity_log_employee_id_fkey(full_name)')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (isExecUser) {
        if (filterEmployee) query = query.eq('employee_id', filterEmployee);
        if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
        if (filterDateTo)   query = query.lte('created_at', filterDateTo + 'T23:59:59');
      } else {
        query = query.eq('employee_id', employeeProfile?.id);
      }

      const { data: logData } = await query;
      if (!isMounted.current) return;

      const newLogs = logData || [];
      setHasMore(newLogs.length === PAGE_SIZE);
      if (append) {
        setActivities(prev => [...prev, ...newLogs]);
        setActivityOffset(offset + newLogs.length);
      } else {
        setActivities(newLogs);
        setActivityOffset(newLogs.length);
      }

      if (isExecUser) {
        const allLogs = append ? [...activities, ...newLogs] : newLogs;
        setIssues(allLogs.filter((a: any) => a.issue_observed));
      }

      // Founder Brief data (admin only)
      if (isExecUser) {
        const archivedQuery = supabase
          .from('activity_log')
          .select('id, created_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, batch_id, severity, founder_comment, employee_id, archived_at, employees!activity_log_employee_id_fkey(full_name)')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false })
          .limit(100);
        const { data: archived } = await archivedQuery;
        if (!isMounted.current) return;
        setArchivedActivities(archived || []);

        // Bug A fix: Dedicated Issue Tracker query — not limited to loaded page
        setIssuesLoading(true);
        const issuesQuery = supabase
          .from('activity_log')
          .select('id, created_at, activity_description, issue_description, founder_comment, employee_id, employees!activity_log_employee_id_fkey(full_name), batch_id')
          .eq('issue_observed', true)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(200);
        const { data: allIssues } = await issuesQuery;
        if (isMounted.current) {
          setIssues(allIssues || []);
          setIssuesLoading(false);
        }

        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // IST-safe date
        const [staffRes, logsRes, overdueRes, approvalRes, expRes] = await Promise.all([
          // Bug B fix: exclude admin, ceo AND cto from the staff attendance list
          supabase.from('employees').select('id, full_name, designation, role').eq('is_active', true).neq('role', 'admin').neq('role', 'ceo').neq('role', 'cto'),
          supabase.from('attendance_log').select('employee_id, check_out_time').eq('date', today),
          supabase.from('tasks').select('id, title, priority, due_date, assigned_user:employees!tasks_assigned_to_fkey(full_name)').neq('status', 'done').neq('status', 'cancelled').lt('due_date', today).order('due_date', { ascending: true }).limit(5),
          supabase.from('tasks').select('id, title, assigned_user:employees!tasks_assigned_to_fkey(full_name)').eq('approval_status', 'pending_review').limit(5),
          supabase.from('batches').select('batch_id, product_name, status').is('archived_at', null).in('status', ['fermenting', 'in-progress', 'testing']).limit(5)
        ]);

        if (!isMounted.current) return;

        const allStaff = staffRes.data || [];
        setAllEmployees(allStaff);
        const todayLogs = logsRes.data || [];
        const overdueTasks = overdueRes.data || [];
        const pendingApprovals = approvalRes.data || [];
        const activeExps = expRes.data || [];

        const logMap = new Map(todayLogs.map((l: any) => [l.employee_id, l]));
        const present = allStaff.filter((s: any) => logMap.has(s.id) && !logMap.get(s.id).check_out_time);
        const checkedOut = allStaff.filter((s: any) => logMap.has(s.id) && logMap.get(s.id).check_out_time);
        const absent = allStaff.filter((s: any) => !logMap.has(s.id));
        // Open issues for morning brief — from the dedicated issues query
        const openIssues = (allIssues || []).filter((a: any) => !a.founder_comment).slice(0, 5);

        setBrief({ presentToday: present, absentToday: absent, checkedOutToday: checkedOut, overdueTasks, pendingApprovals, activeExperiments: activeExps, openIssues });
      }
      })(), 20000, 'Activity load timed out');
    } catch (err) {
      console.error("Activity page fetch error:", err);
      if (isMounted.current) setError("Failed to load activity data: " + err.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [supabase, role, employeeProfile, filterEmployee, filterDateFrom, filterDateTo, activityOffset, activities]);

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
      toast.success('Activity logged successfully.');
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

  const handleArchiveActivity = async (reason: string) => {
    if (!archiveConfirmId) return;
    const id = archiveConfirmId;
    try {
      const res = await fetch(`/api/activity?id=${id}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive_reason: reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to archive activity.');
      toast.success(data.message || 'Activity archived.');
      setArchiveConfirmId(null);
      fetchData();
    } catch (err) {
      toast.error("Failed to archive activity: " + err.message);
    }
  };

  const handlePermanentDeleteActivity = async (id) => {
    try {
      const res = await fetch(`/api/activity?id=${id}&permanent=true`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete activity.');
      setArchivedActivities(prev => prev.filter(a => a.id !== id));
      setActivities(prev => prev.filter(a => a.id !== id));
      toast.success(data.message || 'Activity permanently deleted.');
    } catch (err) {
      toast.error("Failed to permanently delete activity: " + err.message);
    }
  };

  // Fetch which activity_log record IDs already have a pending change request
  const fetchMyPendingIds = useCallback(async () => {
    const res = await fetch('/api/edit-request');
    if (!res.ok) return;
    const { data } = await res.json();
    if (!data) return;
    const ids = new Set<string>(
      data
        .filter((r: any) => r.table_name === 'activity_log' && r.status === 'pending')
        .map((r: any) => r.record_id)
    );
    if (isMounted.current) setMyPendingIds(ids);
  }, []);

  useEffect(() => {
    if (employeeProfile && !isAdmin) fetchMyPendingIds();
  }, [employeeProfile, isAdmin, fetchMyPendingIds]);

  const openEditModal = (act: any) => {
    setEditModal(act);
    setEditForm({
      activity_description: act.activity_description || '',
      start_time: act.start_time || '',
      end_time: act.end_time || '',
      issue_observed: act.issue_observed || false,
      issue_description: act.issue_description || '',
    });
  };

  const submitEditRequest = async () => {
    if (!editModal) return;
    setSubmittingRequest(true);
    try {
      const res = await fetch('/api/edit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: 'activity_log',
          record_id: editModal.id,
          change_type: 'edit',
          proposed_data: editForm,
          module_label: 'Activity Log',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request.');
      toast.success('Edit request submitted — admin will review shortly.');
      setEditModal(null);
      fetchMyPendingIds();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingRequest(false);
    }
  };

  const submitDeleteRequest = async (id: string) => {
    setSubmittingRequest(true);
    try {
      const res = await fetch('/api/edit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: 'activity_log',
          record_id: id,
          change_type: 'delete',
          module_label: 'Activity Log',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request.');
      toast.success('Archive request submitted — admin will review shortly.');
      setRequestingDelete(null);
      fetchMyPendingIds();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (authLoading) return <div className="p-12"><Skeleton className="h-40 w-full mb-4"/><Skeleton className="h-60 w-full"/></div>;

  const nowHour = new Date().getHours();
  const greeting = nowHour < 12 ? 'Good morning' : nowHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="max-w-7xl mx-auto space-y-5 md:space-y-6 pb-24 px-1 sm:px-0">
      <MobilePageHeader
        icon={Activity}
        title={isAdmin ? 'Ops Center' : 'Activity'}
        subtitle={isAdmin ? `${greeting}, ${employeeProfile.full_name?.split(' ')[0]}. Today's operational pulse is ready.` : 'Log daily work and flag issues from the floor.'}
        stats={[
          { label: 'Logs', value: activities.length },
          { label: 'Issues', value: issues.length },
          { label: 'Archived', value: archivedActivities.length },
        ]}
      />

      <div className="hidden md:flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
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
          <button onClick={() => fetchData()} className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded-lg font-bold text-xs">Retry</button>
        </div>
      )}


      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-2 md:gap-6 overflow-x-auto mobile-scroll-tabs md:mx-0 md:px-0">
          {isAdmin && (
            <button onClick={() => setTab('brief')} 
              className={`whitespace-nowrap py-3 px-2 md:px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'brief' ? 'border-navy text-navy' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <Zap className="w-4 h-4"/> Morning Brief
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setTab('analytics')} 
              className={`whitespace-nowrap py-3 px-2 md:px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'analytics' ? 'border-navy text-navy' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <TrendingUp className="w-4 h-4"/> Operations Hub
            </button>
          )}
          <button onClick={() => setTab('feed')}
            className={`whitespace-nowrap py-3 px-2 md:px-1 border-b-2 font-bold text-sm transition-colors ${tab === 'feed' ? 'border-navy text-navy' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {isAdmin ? 'Team Activity Feed' : 'Recent Activity'}
          </button>
          <button onClick={() => setTab('log')}
            className={`whitespace-nowrap py-3 px-2 md:px-1 border-b-2 font-bold text-sm transition-colors ${tab === 'log' ? 'border-navy text-navy' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            + Log Activity
          </button>
          {isAdmin && (
            <button onClick={() => setTab('issues')}
              className={`whitespace-nowrap py-3 px-2 md:px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'issues' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              Issue Tracker
              {issues.filter(i => !i.founder_comment).length > 0 && (
                <span className="bg-red-500 text-white py-0.5 px-1.5 rounded-full text-xs font-black">
                  {issues.filter(i => !i.founder_comment).length}
                </span>
              )}
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setTab('archived')}
              className={`whitespace-nowrap py-3 px-2 md:px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'archived' ? 'border-slate-700 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <Archive className="w-4 h-4"/> Archived
              {archivedActivities.length > 0 && (
                <span className="bg-slate-200 text-slate-700 py-0.5 px-1.5 rounded-full text-xs font-black">
                  {archivedActivities.length}
                </span>
              )}
            </button>
          )}
        </nav>
      </div>

      {/* ── Feed Controls: filters + export ───────────────────── */}
      {tab === 'feed' && (
        <div className="card p-3 flex flex-col md:flex-row md:flex-wrap md:items-end gap-3">
          {isAdmin && (
            <select
              value={filterEmployee}
              onChange={e => { setFilterEmployee(e.target.value); setActivityOffset(0); }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white text-slate-700 font-medium focus:ring-2 focus:ring-navy outline-none"
            >
              <option value="">All Staff</option>
              {allEmployees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">From</label>
            <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setActivityOffset(0); }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-navy outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">To</label>
            <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setActivityOffset(0); }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-navy outline-none" />
          </div>
          {(filterEmployee || filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterEmployee(''); setFilterDateFrom(''); setFilterDateTo(''); setActivityOffset(0); }}
              className="px-3 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
              Clear
            </button>
          )}
          <button
            onClick={() => {
              const headers = ['Date', 'Employee', 'Start', 'End', 'Description', 'Issue?', 'Issue Detail'];
              const rows = activities.map((a: any) => [
                a.created_at?.split('T')[0] || '',
                a.employees?.full_name || employeeProfile?.full_name || '',
                a.start_time || '',
                a.end_time || '',
                `"${(a.activity_description || '').replace(/"/g, '""')}"`,
                a.issue_observed ? 'Yes' : 'No',
                `"${(a.issue_description || '').replace(/"/g, '""')}"`,
              ]);
              const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
              downloadCsvWithHash(csv, `activity_log_${new Date().toISOString().split('T')[0]}.csv`);
            }}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ↓ Export CSV
          </button>
          {isAdmin && (
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
          )}
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
              { label: 'Active Batches', value: brief.activeExperiments.length, icon: FlaskConical, color: 'text-navy', bg: 'bg-slate-50', border: 'border-slate-200' },
            ].map(kpi => (
              <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4 flex items-center gap-3`}>
                <kpi.icon className={`w-7 h-7 ${kpi.color} shrink-0`}/>
                <div>
                  <p className="text-2xl font-black text-slate-800">{kpi.value}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
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
                      <span className="text-slate-400 text-xs">{s.designation || s.role}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {brief.checkedOutToday && brief.checkedOutToday.length > 0 && (
                <>
                  <div className="border-t border-slate-100 mt-3 pt-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><LogOut className="w-3 h-3 text-slate-400"/> Checked out</p>
                    {brief.checkedOutToday.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-sm mb-1.5 opacity-60">
                        <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0"></span>
                        <span className="font-medium text-slate-500 line-through">{s.full_name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              {brief.absentToday.length > 0 && (
                <>
                  <div className="border-t border-slate-100 mt-3 pt-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Not yet checked in</p>
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
              {/* Bug C fix: Overdue tasks — now clickable, navigate to /tasks */}
              {brief.overdueTasks.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500"/> Overdue Tasks
                    <button onClick={() => router.push('/tasks')} className="ml-auto text-xs font-bold text-navy hover:underline">View all →</button>
                  </h2>
                  <div className="space-y-2">
                    {brief.overdueTasks.map(t => (
                      <button key={t.id} onClick={() => router.push('/tasks')} className="w-full text-left bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between hover:bg-red-100 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-red-800 truncate max-w-[180px]">{t.title}</p>
                          <p className="text-xs text-red-500">{t.assigned_user?.full_name} · Due {new Date(t.due_date).toLocaleDateString()}</p>
                        </div>
                        <span className={`text-xs font-black uppercase px-2 py-0.5 rounded ${t.priority === 'urgent' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>{t.priority}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bug C fix: Pending approvals — now clickable, navigate to /tasks */}
              {brief.pendingApprovals.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500"/> Pending Your Approval
                    <button onClick={() => router.push('/tasks')} className="ml-auto text-xs font-bold text-navy hover:underline">View all →</button>
                  </h2>
                  <div className="space-y-2">
                    {brief.pendingApprovals.map(t => (
                      <button key={t.id} onClick={() => router.push('/tasks')} className="w-full text-left bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 hover:bg-amber-100 transition-colors">
                        <p className="text-sm font-bold text-amber-800 truncate">{t.title}</p>
                        <p className="text-xs text-amber-600">Submitted by {t.assigned_user?.full_name}</p>
                      </button>
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

          {/* Bug C fix: Active Experiments — now clickable, each batch links to /batches/[id] */}
          {brief.activeExperiments.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-navy"/> Active Experiments
                <button onClick={() => router.push('/batches')} className="ml-auto text-xs font-bold text-navy hover:underline">View all →</button>
              </h2>
              <div className="flex flex-wrap gap-2">
                {brief.activeExperiments.map(b => (
                  <button key={b.batch_id} onClick={() => router.push(`/batches/${b.batch_id}`)} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2 hover:bg-slate-100 hover:border-navy/30 transition-colors">
                    <span className="w-2 h-2 rounded-full bg-navy animate-pulse"></span>
                    <span className="text-sm font-black text-slate-800 font-mono">{b.batch_id}</span>
                    {b.product_name && <span className="text-xs text-slate-600">{b.product_name}</span>}
                    <span className="text-xs font-bold uppercase text-navy bg-slate-200 px-1.5 py-0.5 rounded">{b.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bug C fix: Open Issues — now clickable, each issue navigates to the Issue Tracker tab */}
          {brief.openIssues.length > 0 && (
            <div className="glass-card rounded-2xl p-5 border border-red-100">
              <h2 className="text-xs font-black text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4"/> Unreviewed Lab Issues
                <button onClick={() => setTab('issues')} className="ml-auto text-xs font-bold text-red-600 hover:underline">Review all →</button>
              </h2>
              <div className="space-y-2">
                {brief.openIssues.map(issue => (
                  <button key={issue.id} onClick={() => setTab('issues')} className="w-full text-left bg-red-50 border border-red-200 rounded-xl p-3 hover:bg-red-100 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-red-800 text-sm">{issue.employees?.full_name}</span>
                      <span className="text-xs text-red-500">{new Date(issue.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-red-700 font-medium">{issue.issue_description}</p>
                  </button>
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
              <div className="card p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center text-navy">
                       <Activity className="w-5 h-5"/>
                    </div>
                    <div>
                       <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Logged Effort (7D)</p>
                       <p className="text-2xl font-black text-gray-900 leading-none mt-1">
                          {analyticsData.velocity.reduce((acc,v) => acc + v.hours, 0).toFixed(1)} <span className="text-xs font-bold text-gray-400">HRS</span>
                       </p>
                    </div>
                 </div>
              </div>

              <div className="card p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                       <AlertTriangle className="w-5 h-5"/>
                    </div>
                    <div>
                       <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Deviation Rate</p>
                       <p className="text-2xl font-black text-gray-900 leading-none mt-1">
                          {((analyticsData.velocity.reduce((acc,v) => acc + v.issues, 0) / (activities.length || 1)) * 100).toFixed(1)}%
                       </p>
                    </div>
                 </div>
                 <p className="text-xs font-bold text-gray-400 uppercase">Based on {activities.length} logged entries</p>
              </div>

              <div className="card p-6">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-navy">
                       <CheckCircle className="w-5 h-5"/>
                    </div>
                    <div>
                       <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Issues Logged (7D)</p>
                       <p className="text-2xl font-black text-gray-900 leading-none mt-1">
                          {analyticsData.velocity.reduce((acc,v) => acc + v.issues, 0)}
                       </p>
                    </div>
                 </div>
                 <p className="text-xs font-bold text-gray-400 uppercase">Across all team members</p>
              </div>
           </div>

           {/* Charts Section */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Productivity Chart */}
              <div className="card p-6">
                 <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-navy"/> Activity Velocity
                 </h3>
                 <div className="h-64 w-full">
                    <ActivityVelocityChart data={analyticsData.velocity} />
                 </div>
              </div>

              {/* Issue Tracker Heatmap */}
              <div className="card p-6">
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
           <div className="card p-6">
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
                             <p className="text-xs text-gray-500">{act.activity_description.length > 60 ? act.activity_description.slice(0, 60) + '...' : act.activity_description}</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-xs font-black uppercase text-gray-400">{new Date(act.created_at).toLocaleDateString()}</p>
                          <button onClick={() => {setTab('feed'); setPriorityOnly(true);}} className="text-xs font-black text-navy uppercase hover:underline">Review</button>
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
              <div key={act.id} className={`glass-card rounded-2xl border p-5 transition-all ${act.severity === 'high' || act.issue_observed ? 'border-red-200 bg-red-50/20' : 'border-white/60 hover:border-slate-200'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{isAdmin ? act.employees?.full_name : 'You'}</span>
                    <span className="text-xs text-slate-400">{new Date(act.created_at).toLocaleDateString()} · {act.start_time} – {act.end_time}</span>
                    {act.batch_id && <span className="px-2 py-0.5 bg-slate-100 text-slate-900 text-xs font-mono font-bold rounded border border-slate-200">{act.batch_id}</span>}
                    {act.severity && (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-black uppercase border ${
                        act.severity === 'high' ? 'bg-red-50 text-red-700 border-red-100' : 
                        act.severity === 'normal' ? 'bg-slate-100 text-slate-900 border-slate-200' :
                        'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {act.severity}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/messages?pin_type=activity&pin_id=${act.id}&pin_title=${encodeURIComponent('Activity: ' + (act.activity_description.length > 20 ? act.activity_description.substring(0, 20) + '...' : act.activity_description))}`)}
                      className="p-1.5 rounded-lg border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                      title="Discuss activity"
                    >
                      <MessageSquare className="w-3.5 h-3.5"/>
                    </button>
                    {act.issue_observed && <span className="flex items-center text-xs font-black text-red-700 bg-red-100 px-2 py-0.5 rounded"><AlertTriangle className="w-3 h-3 mr-1"/> ISSUE</span>}
                    {(isAdmin || (act.employee_id === employeeProfile?.id && !act.is_optimistic)) && (
                      <>
                        {!isAdmin && (
                          <button
                            onClick={() => openEditModal(act)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-800 hover:bg-slate-100 hover:border-slate-300"
                            title="Request edit"
                          >
                            <Edit2 className="w-3.5 h-3.5"/>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to permanently delete this activity?')) {
                              handlePermanentDeleteActivity(act.id);
                            }
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200"
                          title="Delete activity"
                        >
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap text-sm mb-2">{act.activity_description}</p>
                {act.issue_observed && <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-900"><span className="font-bold">Issue: </span>{act.issue_description}</div>}
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start">
                    <MessageSquare className="w-4 h-4 text-navy mr-2 mt-0.5 shrink-0"/>
                    <div><p className="text-xs font-black text-navy mb-0.5">ADMIN REVIEW</p><p className="text-sm text-slate-700">{act.founder_comment}</p></div>
                  </div>
                ) : isAdmin ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {activeCommentId === act.id ? (
                      <div className="flex gap-2">
                        <input autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a review note..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-navy"/>
                        <button onClick={() => handleAddComment(act.id)} className="bg-navy text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-navy-hover">Save</button>
                        <button onClick={() => { setCommentText(''); setActiveCommentId(null); }} className="text-slate-500 px-2 text-sm">Cancel</button>

                      </div>
                    ) : (
                      <button onClick={() => { setCommentText(''); setActiveCommentId(act.id); }} className="text-sm text-navy font-bold hover:text-navy-hover flex items-center">

                        <MessageSquare className="w-3.5 h-3.5 mr-1"/> Add Review
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
          {/* Load More */}
          {hasMore && !loading && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => fetchData(true)}
                className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Load 50 more
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── LOG ACTIVITY FORM ─────────────────────────────────────────── */}
      {tab === 'archived' && isAdmin && (
        <div className="space-y-4">
          {archivedActivities.length === 0 ? (
            <div className="glass-card p-8 rounded-2xl text-center text-slate-400">
              <Archive className="w-8 h-8 mx-auto text-slate-300 mb-3"/>
              <p className="font-medium">No archived activity.</p>
            </div>
          ) : (
            archivedActivities.map(act => (
              <div key={act.id} className="glass-card rounded-2xl border border-slate-200 p-5 bg-slate-50/40">
                <div className="flex justify-between items-start gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{act.employees?.full_name}</span>
                    <span className="text-xs text-slate-400">{new Date(act.created_at).toLocaleDateString()} · {act.start_time} – {act.end_time}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-black uppercase border bg-slate-100 text-slate-600 border-slate-200">
                      Archived
                    </span>
                  </div>
                  <button
                    onClick={() => handlePermanentDeleteActivity(act.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-100 text-xs font-bold hover:bg-red-100"
                    title="Permanently delete archived activity"
                  >
                    <Trash2 className="w-3.5 h-3.5"/> Delete permanently
                  </button>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap text-sm">{act.activity_description}</p>
                {act.issue_observed && <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-900"><span className="font-bold">Issue: </span>{act.issue_description}</div>}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="glass-card rounded-2xl p-6 max-w-2xl">
          <h2 className="text-lg font-black text-slate-800 mb-5">Record New Activity</h2>
          <form onSubmit={handLog(handleLogSubmit)} className="space-y-5">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">What did you do? *</label>
              <textarea {...regLog('activity_description')} rows={4} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy resize-none bg-slate-50 text-sm" 
                placeholder="Protocol steps, prep work, general tasks, results..."/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Linked Batch</label>
                <select {...regLog('batch_id')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy bg-slate-50 text-sm">
                  <option value="">— None —</option>
                  {activeBatches.map(b => <option key={b.batch_id} value={b.batch_id}>{b.batch_id}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Hardware / Equipment</label>
                <select {...regLog('equipment_id')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy bg-slate-50 text-sm">
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
                <p className="text-xs text-red-600">This equipment passed its calibration due date ({new Date(selectedEquipment.calibration_due_date).toLocaleDateString()}). Logging is disabled for compliance safety.</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Start</label>
                  <input type="time" {...regLog('start_time')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy bg-slate-50 text-sm"/>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">End</label>
                  <input type="time" {...regLog('end_time')} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy bg-slate-50 text-sm"/>
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
              className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-black text-white bg-navy hover:bg-navy-hover disabled:opacity-60 transition-all">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : isCalOverdue ? 'Locked (Calibration Required)' : 'Save Activity Entry'}
            </button>
          </form>
        </div>
      )}

      {/* ── DELETE CONFIRMATION (inline, non-admin) ───────────────── */}
      {requestingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/10 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-2xl shadow-2xl border border-red-100 max-w-sm w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-black text-slate-800 text-base">Request Archive</h3>
                <p className="text-sm text-slate-500 mt-1">This will send an archive request to admin for approval. The entry stays visible until approved.</p>
              </div>
              <button onClick={() => setRequestingDelete(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setRequestingDelete(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => submitDeleteRequest(requestingDelete)}
                disabled={submittingRequest}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700 disabled:opacity-60"
              >
                {submittingRequest ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Send className="w-4 h-4"/> Send Request</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT REQUEST MODAL (non-admin) ────────────────────────── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/10 backdrop-blur-sm p-0 sm:p-4">
          <div className="flex flex-col bg-white rounded-none sm:rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-4 h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-black text-slate-800 text-base">Request Edit</h3>
                <p className="text-sm text-slate-500 mt-1">Propose your changes below. An admin will review and apply them.</p>
              </div>
              <button onClick={() => setEditModal(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Activity Description *</label>
                <textarea
                  rows={4}
                  value={editForm.activity_description}
                  onChange={e => setEditForm(f => ({ ...f, activity_description: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy resize-none bg-slate-50 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Start Time</label>
                  <input type="time" value={editForm.start_time}
                    onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy bg-slate-50 text-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">End Time</label>
                  <input type="time" value={editForm.end_time}
                    onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-navy bg-slate-50 text-sm"/>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative flex items-center">
                    <input type="checkbox" className="peer sr-only"
                      checked={editForm.issue_observed}
                      onChange={e => setEditForm(f => ({ ...f, issue_observed: e.target.checked }))}/>
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                  </div>
                  <span className="text-sm font-bold text-slate-700">Issue / Deviation</span>
                </label>
              </div>
              {editForm.issue_observed && (
                <div>
                  <label className="block text-xs font-black text-red-600 uppercase tracking-widest mb-1.5">Issue Description</label>
                  <textarea rows={3}
                    value={editForm.issue_description}
                    onChange={e => setEditForm(f => ({ ...f, issue_description: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 bg-red-50 text-red-900 text-sm"/>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button onClick={() => setEditModal(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={submitEditRequest}
                disabled={submittingRequest || !editForm.activity_description?.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-black hover:bg-navy-hover disabled:opacity-60"
              >
                {submittingRequest ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Send className="w-4 h-4"/> Submit for Approval</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ISSUE TRACKER (Admin only) — Bug A fix: dedicated DB query, not in-memory filter ── */}
      {tab === 'issues' && isAdmin && (
        <div className="space-y-4">
          {issuesLoading ? (
            <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="glass-card p-5 rounded-2xl border border-red-100 h-24 animate-pulse bg-red-50/30" />)}</div>
          ) : issues.length === 0 ? (
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
                    ? <span className="bg-red-600 text-white text-xs uppercase font-black px-2 py-0.5 rounded animate-pulse">Needs Review</span>
                    : <span className="bg-emerald-100 text-emerald-800 text-xs uppercase font-black px-2 py-0.5 rounded">Reviewed</span>}
                </div>
                <div className="mb-3 text-sm text-slate-600 border-l-2 border-slate-300 pl-3">{act.activity_description}</div>
                <div className="p-3 bg-red-100 border border-red-200 rounded-xl text-sm text-red-900 mb-3 font-medium">
                  <span className="font-black flex items-center mb-1"><AlertTriangle className="w-3.5 h-3.5 mr-1"/> Issue: </span> 
                  {act.issue_description}
                </div>
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl">
                    <p className="text-xs font-black text-navy mb-1">RESOLUTION NOTE</p>
                    <p className="text-sm text-slate-700">{act.founder_comment}</p>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-red-100">
                    {activeCommentId === act.id ? (
                      <div className="flex gap-2">
                        <input autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Enter resolution note..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-navy"/>
                        <button onClick={() => handleAddComment(act.id)} className="bg-navy text-white px-4 py-1.5 rounded-lg text-sm font-black hover:bg-navy-hover">Resolve</button>
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
      <ConfirmModal
        isOpen={!!archiveConfirmId}
        onClose={() => setArchiveConfirmId(null)}
        onConfirm={handleArchiveActivity}
        title="Archive Activity"
        message="This activity will be hidden from the active log."
        confirmText="Archive Activity"
        loadingText="Archiving..."
        variant="danger"
        requireInput={true}
        inputPlaceholder="Reason for archiving..."
        inputLabel="Please provide a reason for archiving:"
      />
    </div>
  );
}
