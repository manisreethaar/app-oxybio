'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  CheckSquare, Clock, AlertTriangle, Plus, CheckCircle2,
  ChevronDown, ChevronUp, Timer, Paperclip, ThumbsUp,
  ThumbsDown, X, ListChecks, PlayCircle, Loader2, FileCheck, Trash2,
  LayoutGrid, List, Activity, Eye, BarChart2, FlaskConical, Search
} from 'lucide-react';
import Link from 'next/link';
import { canAssignTo } from '@/lib/permissions';
import { differenceInDays } from 'date-fns';
import TaskDetailModal from './components/TaskDetailModal';
import { formatMinutes } from './components/utils';

export default function TasksPage() {
  const { role, canDo, isAdmin: isMaster, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('due_asc');
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'individual'

  const isAdmin = canDo('tasks', 'assign') || isMaster;
  const canApprove = canDo('tasks', 'approve') || isMaster;

  const [showCreate, setShowCreate] = useState(false);
  const [checklistBuffer, setChecklistBuffer] = useState([]);
  const [checklistInput, setChecklistInput] = useState('');

  const { register: regTask, handleSubmit: handTask, formState: { errors: taskErrors, isSubmitting: isTaskSubmitting }, reset: resetTask, watch, setValue } = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(1, 'Title required'),
      description: z.string().optional(),
      assigned_user_ids: z.array(z.string()),
      due_date: z.string().min(1, 'Date required'),
      priority: z.enum(['low', 'medium', 'high', 'urgent'])
    })),
    defaultValues: { title: '', description: '', assigned_user_ids: [], due_date: '', priority: 'medium' }
  });
  const watchedAssignees = watch('assigned_user_ids') || [];

  const [selectedTask, setSelectedTask] = useState(null);
  const [completionNote, setCompletionNote] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0); 
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [progressNote, setProgressNote] = useState('');
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [pendingDeleteTask, setPendingDeleteTask] = useState(null);
  const [capaTaskBatchMap, setCapaTaskBatchMap] = useState({});

  useEffect(() => {
    if (selectedTask) {
      setCompletionNote(''); setProofFile(null); setRejectNote('');
      setProgressNote(''); setProgressPercentage(selectedTask.progress_percentage || 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id]);

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    if (!employeeProfile) return;
    fetchTasks();

    // Subscribe to live task changes — catches admin assignments, peer updates, approvals
    const channel = supabase.channel('tasks_realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        ...(isAdmin ? {} : { filter: `assigned_to=eq.${employeeProfile.id}` })
      }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeProfile]);

  useEffect(() => {
    let interval;
    if (timerRunning && selectedTask?.time_started_at) {
      interval = setInterval(() => {
        const start = new Date(selectedTask.time_started_at).getTime();
        const now = new Date().getTime();
        setElapsedSeconds(Math.floor((now - start) / 1000));
      }, 1000);
    } else { 
      // If timer isn't running, elapsed seconds is 0, but we show logged_minutes
      setElapsedSeconds(0); 
    }
    return () => clearInterval(interval);
  }, [timerRunning, selectedTask?.time_started_at, selectedTask?.id]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      let query = supabase.from('tasks').select('*, assigned_user:employees!tasks_assigned_to_fkey(full_name), creator:employees!tasks_assigned_by_fkey(full_name)').order('due_date', { ascending: true });
      let empsPromise = Promise.resolve({ data: [{ id: employeeProfile.id, full_name: employeeProfile.full_name }] });

      if (!isAdmin) {
        query = query.eq('assigned_to', employeeProfile.id);
      } else {
        empsPromise = supabase.from('employees').select('id, full_name, role').eq('is_active', true);
      }

      const [empsRes, tasksRes] = await Promise.all([empsPromise, query]);
      if (tasksRes.error) throw tasksRes.error;

      setEmployees(empsRes.data || []);
      setTasks(tasksRes.data || []);
      if (selectedTask) {
        const updated = tasksRes.data?.find(t => t.id === selectedTask.id);
        if (updated) { setSelectedTask(updated); setTimerRunning(!!updated.time_started_at); }
      }

      // Resolve CAPA â†’ batch links for tasks created from CAPA actions
      const allTasks = tasksRes.data || [];
      const capaTaskIds = allTasks.filter(t => t.title?.startsWith('[CAPA]')).map(t => t.id);
      if (capaTaskIds.length > 0) {
        try {
          const { data: capaLinks } = await supabase.from('capa_actions').select('task_id, investigation_id').in('task_id', capaTaskIds);
          const invIds = [...new Set((capaLinks || []).map(c => c.investigation_id).filter(Boolean))];
          if (invIds.length > 0) {
            const { data: devData } = await supabase.from('deviations').select('id, batches(id, batch_id)').in('id', invIds);
            const map = {};
            (capaLinks || []).forEach(ca => {
              const dev = (devData || []).find(d => d.id === ca.investigation_id);
              if (dev?.batches) map[ca.task_id] = dev.batches;
            });
            setCapaTaskBatchMap(map);
          }
        } catch(e) { /* silent - cross-module linking is best-effort */ }
      }
    } catch (err) { console.error('Fetch tasks error:', err); }
    finally { setLoading(false); }
  };


  const addChecklistItem = () => {
    if (!checklistInput.trim()) return;
    setChecklistBuffer(prev => [...prev, { text: checklistInput.trim(), done: false }]);
    setChecklistInput('');
  };

  const executeTaskPatch = async (action, taskId, payload = {}) => {
    try {
      const res = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, task_id: taskId, payload }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update task');
      return true;
    } catch(err) { toast.error(err.message); return false; }
  };

  const handleCreateTask = async (data) => {
    if (actionLoading) return;
    const isEdit = !!editingTaskId;
    const isAdmin = canDo('tasks', 'assign') || isMaster;
    let assignees = isAdmin ? data.assigned_user_ids : [employeeProfile.id];
    
    if (isAdmin && assignees.length === 0 && !isEdit) { toast.warn('Select at least one assignee.'); return; }

    setActionLoading(true);

    try {
      if (isEdit) {
        // Handle Single Task Edit
        const res = await fetch('/api/tasks', { 
          method: 'PUT', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ 
            id: editingTaskId,
            title: data.title, 
            description: data.description, 
            assigned_to: assignees[0], // Edit currently supports 1-to-1
            due_date: data.due_date, 
            priority: data.priority, 
            checklist: checklistBuffer
          }) 
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to update task');
      } else {
        // Handle New Task Creation (Batch Support)
        const insertPayload = assignees.map(uid => ({
          title: data.title, description: data.description, assigned_to: uid,
          due_date: data.due_date, priority: data.priority, checklist: checklistBuffer,
          is_personal_reminder: !isAdmin
        }));
        const res = await fetch('/api/tasks', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(insertPayload) 
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to create tasks');
        
        if (isAdmin) {
          assignees.forEach(uid => { 
            fetch('/api/push/send', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ assigned_to: uid, title: "New Task: " + data.priority.toUpperCase(), body: data.title, url: "/tasks" }) 
            }).catch(() => {}); 
          });
        }
      }
      
      setShowCreate(false); setEditingTaskId(null); resetTask(); setChecklistBuffer([]); fetchTasks();
    } catch(err) { toast.error(err.message); }
    finally { setActionLoading(false); }
  };

  const handleEditTask = (task) => {
    setEditingTaskId(task.id);
    resetTask({
      title: task.title,
      description: task.description || '',
      assigned_user_ids: [task.assigned_to],
      due_date: task.due_date ? task.due_date.split('T')[0] : '',
      priority: task.priority || 'medium'
    });
    setChecklistBuffer(task.checklist || []);
    setShowCreate(true);
    setSelectedTask(null);
  };

  const handleDeleteTask = (taskId) => {
    setPendingDeleteTask(taskId);
  };

  const confirmDeleteTask = async () => {
    if (!pendingDeleteTask) return;
    const taskId = pendingDeleteTask;
    setPendingDeleteTask(null);
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' });
      if (res.ok) { 
        if (selectedTask?.id === taskId) setSelectedTask(null); 
        fetchTasks(); 
      }
      else toast.error('Delete failed');
    } catch (err) { toast.error('Error: ' + err.message); }
  };

  const handleAcknowledge = async (taskId) => {
    if (actionLoading) return; setActionLoading(true);
    const success = await executeTaskPatch('acknowledge_task', taskId);
    if (success) { 
      if (selectedTask?.id === taskId) setSelectedTask(t => ({ ...t, is_acknowledged: true })); 
      fetchTasks(); 
    }
    setActionLoading(false);
  };

  const handleUpdateProgress = async (e) => {
    e.preventDefault(); if (actionLoading || !selectedTask) return;
    setActionLoading(true);
    const success = await executeTaskPatch('update_progress', selectedTask.id, { 
      percentage: progressPercentage, 
      note: progressNote || 'Progress update' 
    });
    if (success) { 
      // Auto-trigger "Submit for Review" if 100%
      if (progressPercentage === 100) { 
        // We just let the user see it's at 100%, and the submit form is already visible if in-progress
      }
      setProgressNote('');
      fetchTasks(); 
    }
    setActionLoading(false);
  };

  const handleStartTimer = async (task) => {
    if (actionLoading) return; setActionLoading(true);
    const success = await executeTaskPatch('start_timer', task.id);
    if (success) { 
      setSelectedTask(t => ({ ...t, time_started_at: new Date().toISOString(), status: 'in-progress', is_acknowledged: true })); 
      setTimerRunning(true); 
      fetchTasks(); 
    }
    setActionLoading(false);
  };

  const handlePauseTimer = async () => {
    if (!selectedTask?.time_started_at || actionLoading) return;
    setActionLoading(true);
    const sessionSeconds = Math.floor((new Date().getTime() - new Date(selectedTask.time_started_at).getTime()) / 1000);
    const newMins = Math.floor(sessionSeconds / 60);

    const success = await executeTaskPatch('pause_timer', selectedTask.id, { logged_minutes: (selectedTask.logged_minutes || 0) + newMins });
    if (success) { setTimerRunning(false); setElapsedSeconds(0); fetchTasks(); }
    setActionLoading(false);
  };

  const handleCloseModal = async () => {
    if (timerRunning) await handlePauseTimer();
    setSelectedTask(null); setElapsedSeconds(0); setTimerRunning(false);
  };

  const toggleChecklistItem = async (task, index) => {
    const updated = [...(task.checklist || [])]; updated[index].done = !updated[index].done;
    const success = await executeTaskPatch('update_checklist', task.id, { checklist: updated });
    if (success) { if (selectedTask?.id === task.id) setSelectedTask(t => ({ ...t, checklist: updated })); fetchTasks(); }
  };

  const handleSubmitForReview = async (e) => {
    e.preventDefault(); if (actionLoading) return;
    setActionLoading(true); setUploading(true);
    let proofUrl = null;

    try {
      if (proofFile) {
        const formData = new FormData(); formData.append('file', proofFile);
        const res = await fetch('/api/upload', { method: 'POST', body: formData }); 
        if (!res.ok) { toast.error("Failed to upload proof"); return; }
        proofUrl = (await res.json()).url;
      }
      let finalMins = (selectedTask.logged_minutes || 0);
      if (timerRunning && selectedTask?.time_started_at) {
        finalMins += Math.floor((new Date().getTime() - new Date(selectedTask.time_started_at).getTime()) / 60000);
      }

      const success = await executeTaskPatch('submit_review', selectedTask.id, {
        completion_note: completionNote, proof_url: proofUrl, logged_minutes: finalMins, is_personal_reminder: selectedTask.is_personal_reminder
      });

      if (success) { setSelectedTask(null); setCompletionNote(''); setProofFile(null); setTimerRunning(false); setElapsedSeconds(0); fetchTasks(); }
    } finally { setUploading(false); setActionLoading(false); }
  };

  const handleApprove = async (taskId) => {
    const success = await executeTaskPatch('approve', taskId);
    if (success) { setSelectedTask(null); fetchTasks(); }
  };

  const handleReject = async (taskId) => {
    const success = await executeTaskPatch('reject', taskId, { reject_note: rejectNote });
    if (success) { setRejectNote(''); setSelectedTask(null); fetchTasks(); }
  };

  const filteredTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
    return tasks
      .filter(t => {
        const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
        const matchesAssignee = assigneeFilter === 'All' || t.assigned_to === assigneeFilter;
        const matchesSearch = !q || [
          t.title,
          t.description,
          t.priority,
          t.status,
          t.assigned_user?.full_name,
          t.creator?.full_name
        ].some(value => String(value || '').toLowerCase().includes(q));
        return matchesStatus && matchesAssignee && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOrder === 'due_desc') return new Date(b.due_date || 0) - new Date(a.due_date || 0);
        if (sortOrder === 'priority') return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
        if (sortOrder === 'title') return (a.title || '').localeCompare(b.title || '');
        return new Date(a.due_date || 0) - new Date(b.due_date || 0);
      });
  }, [tasks, statusFilter, assigneeFilter, searchTerm, sortOrder]);
  
  const groupedTasks = useMemo(() => {
    const groups = {};
    filteredTasks.forEach(task => {
      const key = `${task.title.trim().toLowerCase()}|${(task.description || '').trim().toLowerCase()}`;
      if (!groups[key]) {
        groups[key] = {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          due_date: task.due_date,
          assignees: [],
          completedCount: 0,
          pendingReviewCount: 0,
          unacknowledgedCount: 0,
          totalCount: 0,
          checklist: task.checklist,
          status: 'open'
        };
      }
      groups[key].assignees.push(task);
      groups[key].totalCount++;
      if (task.status === 'done') groups[key].completedCount++;
      if (task.approval_status === 'pending_review') groups[key].pendingReviewCount++;
      if (!task.is_acknowledged && task.status !== 'done') groups[key].unacknowledgedCount++;
      
      // Inherit urgent priority if any subtask is urgent
      if (task.priority === 'urgent') groups[key].priority = 'urgent';
    });
    return Object.values(groups).sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
  }, [filteredTasks]);

  const overdueCount = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.due_date && differenceInDays(new Date(t.due_date), new Date()) < 0).length;
  const pendingApprovals = tasks.filter(t => t.approval_status === 'pending_review').length;

  if (authLoading || loading) return <div className="p-8 text-center text-gray-400 font-medium">Loading task queue...</div>;

  return (
    <div className="page-container">
      {/* Alerts */}
      <div className="space-y-3">
        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center text-red-800 shadow-sm text-sm">
            <AlertTriangle className="w-5 h-5 mr-3 shrink-0 text-red-600" />
            <span className="font-bold">{overdueCount} overdue task{overdueCount > 1 ? 's' : ''} need attention.</span>
          </div>
        )}
        {canApprove && pendingApprovals > 0 && (
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-center text-amber-800 shadow-sm text-sm">
            <FileCheck className="w-5 h-5 mr-3 shrink-0 text-amber-600" />
            <span className="font-bold">{pendingApprovals} task{pendingApprovals > 1 ? 's' : ''} pending your review.</span>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Task Operations</h1>
          <p className="text-sm text-gray-500 mt-1">Assign, track, and complete Node operations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner mr-2">
            <button onClick={() => setViewMode('grouped')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grouped' ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Grouped View">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('individual')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'individual' ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Individual View">
              <List className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider">
            <Plus className="w-4 h-4 mr-1.5" /> {isAdmin ? 'Assign Task' : 'Add Reminder'}
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handTask(handleCreateTask)} className="surface p-6 animate-in fade-in duration-200">
          <h2 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-1.5">
            <ListChecks className="w-5 h-5 text-navy"/> {editingTaskId ? 'Edit Task Details' : (isAdmin ? 'Create & Assign Task' : 'Set Personal Reminder')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Task Title *</label>
              <input type="text" {...regTask('title')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none font-semibold" placeholder="Title..."/>
              {taskErrors.title && <p className="text-red-500 text-xs mt-1">{taskErrors.title.message}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</label>
              <textarea {...regTask('description')} rows="2" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none resize-none font-medium" placeholder="Instructions..."/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Assign To *</label>
              {isAdmin ? (
                <div className="max-h-28 overflow-y-auto bg-gray-50 border border-gray-100 rounded-lg p-2 space-y-1">
                  {employees.filter(e => canAssignTo(role, e.role, employeeProfile?.email)).map(e => (
                    <label key={e.id} className="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer transition-colors text-xs font-semibold text-gray-700">
                      <input type="checkbox" checked={watchedAssignees.includes(e.id)} onChange={(ev) => { const ids = ev.target.checked ? [...watchedAssignees, e.id] : watchedAssignees.filter(id => id !== e.id); setValue('assigned_user_ids', ids); }} className="rounded text-navy focus:ring-navy flex-shrink-0" />
                      {e.full_name} <span className="text-[9px] text-gray-400 ml-auto uppercase opacity-60 font-black">{e.role}</span>
                    </label>
                  ))}
                  {employees.filter(e => canAssignTo(role, e.role, employeeProfile?.email)).length === 0 && (
                    <p className="text-[10px] text-gray-400 p-2 italic text-center">No authorized colleagues below your role.</p>
                  )}
                </div>
              ) : <div className="bg-gray-100 px-3 py-2 rounded-lg text-xs font-bold text-gray-600">Self</div>}
              {taskErrors.assigned_user_ids && <p className="text-red-500 text-xs mt-1">{taskErrors.assigned_user_ids.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Due Date *</label>
                <input type="date" {...regTask('due_date')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none"/>
                {taskErrors.due_date && <p className="text-red-500 text-xs mt-1">{taskErrors.due_date.message}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Priority</label>
                <select {...regTask('priority')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none">
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Checklist Steps</label>
              <div className="flex gap-2 mb-2">
                <input value={checklistInput} onChange={e => setChecklistInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-accent outline-none font-medium" placeholder="Step title..."/>
                <button type="button" onClick={addChecklistItem} className="px-3 bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs hover:bg-gray-200">Add</button>
              </div>
              {checklistBuffer.length > 0 && (
                <ul className="space-y-1">
                  {checklistBuffer.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs bg-gray-50 px-2 py-1.5 rounded border border-gray-100">
                      <span className="w-3.5 h-3.5 rounded border border-gray-300 inline-block shrink-0"></span>
                      <span className="flex-1 text-gray-700 font-medium">{item.text}</span>
                      <button type="button" onClick={() => setChecklistBuffer(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={() => { setShowCreate(false); setEditingTaskId(null); setChecklistBuffer([]); resetTask(); }} className="px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isTaskSubmitting || actionLoading} className="px-4 py-2 text-xs font-bold text-white bg-navy rounded-lg hover:bg-navy-hover shadow-sm disabled:opacity-60">{isTaskSubmitting || actionLoading ? 'Saving...' : (editingTaskId ? 'Save Changes' : 'Create')}</button>
          </div>
        </form>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search tasks, assignees, status..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-700 focus:ring-2 focus:ring-accent outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 focus:ring-2 focus:ring-accent outline-none">
            <option value="due_asc">Due Soon</option>
            <option value="due_desc">Due Later</option>
            <option value="priority">Priority</option>
            <option value="title">Title A-Z</option>
          </select>
          {isAdmin && (
            <>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 focus:ring-2 focus:ring-accent outline-none">
            <option value="All">All Statuses</option><option value="open">Open</option><option value="in-progress">In Progress</option><option value="done">Done</option>
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 focus:ring-2 focus:ring-accent outline-none">
            <option value="All">All Assignees</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
            </>
          )}
        </div>
      </div>

      {viewMode === 'grouped' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupedTasks.map(group => {
            const isOverdue = group.status !== 'done' && group.due_date && differenceInDays(new Date(group.due_date), new Date()) < 0;
            const progress = Math.round((group.completedCount / group.totalCount) * 100);
            
            return (
              <div key={group.id} onClick={() => setSelectedTask(group.assignees[0])} className={`surface p-5 flex flex-col cursor-pointer hover:border-gray-300 transition-colors relative overflow-hidden ${isOverdue ? 'border-red-200 bg-red-50/10' : ''}`}>
                <div className={`absolute top-0 left-0 w-1 p-0.5 h-full ${progress === 100 ? 'bg-emerald-500' : group.priority === 'urgent' ? 'bg-red-500' : group.priority === 'high' ? 'bg-amber-500' : 'bg-blue-400'}`}></div>
                <div className="flex justify-between items-start mb-2 pl-1">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${group.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700'}`}>{group.priority}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-gray-100 text-gray-600">{group.completedCount}/{group.totalCount} Done</span>
                </div>
                <h3 className="text-sm font-bold mb-1 pl-1 text-gray-900">{group.title}</h3>
                <p className="text-[10px] text-gray-500 mb-3 pl-1 line-clamp-1">{group.description}</p>
                
                <div className="pl-1 mb-4">
                  <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase mb-1">
                    <span>Overall Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-navy'}`} style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div className="mt-auto pt-2 border-t border-gray-100 flex justify-between items-center text-[10px] font-bold text-gray-400">
                  <div className="flex -space-x-1.5">
                    {group.assignees.slice(0, 3).map((a, i) => (
                      <div key={i} className="w-5 h-5 rounded-full border border-white bg-teal-100 flex items-center justify-center text-[8px] text-teal-800 font-black shadow-sm" title={a.assigned_user?.full_name}>
                        {a.assigned_user?.full_name?.[0]}
                      </div>
                    ))}
                    {group.totalCount > 3 && <div className="w-5 h-5 rounded-full border border-white bg-gray-100 flex items-center justify-center text-[8px] text-gray-400 font-black">+ {group.totalCount - 3}</div>}
                  </div>
                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}><Clock className="w-3 h-3"/>{group.due_date ? new Date(group.due_date).toLocaleDateString() : 'â€”'}</span>
                </div>
                <div className="mt-3 flex flex-col gap-1">
                  {group.pendingReviewCount > 0 && <div className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase border border-amber-100 bg-amber-50 text-amber-700 text-center animate-pulse">{group.pendingReviewCount} Pending Review</div>}
                  {group.unacknowledgedCount > 0 && <div className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase border border-orange-200 bg-orange-50 text-orange-700 text-center">{group.unacknowledgedCount} Not Yet Seen</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400 font-medium text-sm">No tasks assigned.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTasks.map(task => {
            const isOverdue = task.status !== 'done' && task.status !== 'cancelled' && task.due_date && differenceInDays(new Date(task.due_date), new Date()) < 0;
            const checklistTotal = task.checklist?.length || 0;
            const checklistDone = task.checklist?.filter(c => c.done).length || 0;
            const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
            const displayPct = task.progress_percentage > 0 ? task.progress_percentage : checklistPct;
            const approvalBadge = { 'pending_review': { label: 'Review', cls: 'bg-amber-50 text-amber-700 border-amber-100' }, 'approved': { label: 'Approved âœ“', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' }, 'rejected': { label: 'Returned', cls: 'bg-red-50 text-red-700 border-red-100' } }[task.approval_status];

            return (
              <div key={task.id} onClick={() => setSelectedTask(task)} className={`surface p-5 flex flex-col cursor-pointer hover:border-gray-300 transition-colors relative overflow-hidden ${isOverdue ? 'border-red-200 bg-red-50/10' : ''}`}>
                <div className={`absolute top-0 left-0 w-1 p-0.5 h-full ${task.status === 'done' ? 'bg-emerald-500' : task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-amber-500' : task.priority === 'medium' ? 'bg-blue-400' : 'bg-gray-300'}`}></div>
                <div className="flex justify-between items-start mb-2 pl-1">
                  <div className="flex gap-1.5 items-center">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${task.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-100' : task.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-blue-50 text-blue-700 border-blue-50'}`}>{task.priority}</span>
                    {task.is_acknowledged
                      ? <Eye className="w-3 h-3 text-emerald-500" title={`Acknowledged: ${task.acknowledged_at ? new Date(task.acknowledged_at).toLocaleString() : ''}`} />
                      : String(task.assigned_to) === String(employeeProfile?.id) && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-orange-50 text-orange-600 border border-orange-200 animate-pulse">Unread</span>
                        )
                    }
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${task.status === 'done' ? 'bg-emerald-50 text-emerald-700' : task.status === 'in-progress' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{task.status}</span>
                </div>
                <h3 className={`text-sm font-bold mb-1 pl-1 ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</h3>
                {capaTaskBatchMap[task.id] && (
                  <Link href={`/batches/${capaTaskBatchMap[task.id].id}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-full hover:bg-indigo-100 transition-colors mb-1">
                    <FlaskConical className="w-2.5 h-2.5"/> CAPA: {capaTaskBatchMap[task.id].batch_id}
                  </Link>
                )}

                <div className="pl-1 mb-2">
                  <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase mb-0.5">
                    <span>Progress</span>
                    <span>{displayPct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1">
                    <div className={`h-1 rounded-full ${displayPct === 100 ? 'bg-emerald-500' : 'bg-navy'}`} style={{ width: `${displayPct}%` }}></div>
                  </div>
                </div>

                {/* Unacknowledged banner for the assignee */}
                {!task.is_acknowledged && String(task.assigned_to) === String(employeeProfile?.id) && task.status !== 'done' && (
                  <div
                    className="mt-1 mb-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between gap-2"
                    onClick={e => { e.stopPropagation(); handleAcknowledge(task.id); }}
                  >
                    <span className="text-[10px] font-bold text-orange-700">ðŸ‘† Tap to acknowledge this task</span>
                    <button className="px-2 py-1 bg-orange-500 text-white text-[9px] font-black uppercase rounded-md hover:bg-orange-600 transition-colors whitespace-nowrap">Acknowledge</button>
                  </div>
                )}

                <div className="mt-auto pt-2 border-t border-gray-100 flex justify-between items-center text-[10px] font-bold text-gray-400">
                  <span>{task.assigned_user?.full_name || 'Staff'}</span>
                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}><Clock className="w-3 h-3"/>{task.due_date ? new Date(task.due_date).toLocaleDateString() : 'â€”'}</span>
                </div>
                {approvalBadge && <div className={`mt-2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border text-center ${approvalBadge.cls}`}>{approvalBadge.label}</div>}
                {task.status !== 'done' && task.status !== 'cancelled' && (
                  <div className="mt-2 text-center text-[9px] text-gray-300 font-semibold">Tap to view &amp; update â†’</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TaskDetailModal
        selectedTask={selectedTask}
        groupedTasks={groupedTasks}
        employeeProfile={employeeProfile}
        isMaster={isMaster}
        canApprove={canApprove}
        timerRunning={timerRunning}
        elapsedSeconds={elapsedSeconds}
        progressPercentage={progressPercentage}
        setProgressPercentage={setProgressPercentage}
        progressNote={progressNote}
        setProgressNote={setProgressNote}
        completionNote={completionNote}
        setCompletionNote={setCompletionNote}
        rejectNote={rejectNote}
        setRejectNote={setRejectNote}
        proofFile={proofFile}
        setProofFile={setProofFile}
        actionLoading={actionLoading}
        uploading={uploading}
        onClose={handleCloseModal}
        onAcknowledge={handleAcknowledge}
        onStartTimer={handleStartTimer}
        onPauseTimer={handlePauseTimer}
        onUpdateProgress={handleUpdateProgress}
        onSubmitForReview={handleSubmitForReview}
        onApprove={handleApprove}
        onReject={handleReject}
        onEditTask={handleEditTask}
        onDeleteTask={handleDeleteTask}
        onToggleChecklist={toggleChecklistItem}
      />


      {/* Delete Task Modal */}
      {pendingDeleteTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Delete Task</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Are you sure you want to permanently delete this task? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingDeleteTask(null)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteTask}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition w-full"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
