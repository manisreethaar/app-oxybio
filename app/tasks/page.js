'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { notifyEmployee, notifyAll } from '@/lib/notifyEmployee';
import { 
  CheckSquare, Clock, AlertTriangle, Plus, CheckCircle2, 
  ChevronDown, ChevronUp, Timer, Paperclip, ThumbsUp, 
  ThumbsDown, X, ListChecks, PlayCircle, Loader2, FileCheck, Trash2,
  LayoutGrid, List, Activity, Eye, BarChart2
} from 'lucide-react';
import { canAssignTo } from '@/lib/permissions';
import { differenceInDays } from 'date-fns';

const formatMinutes = (mins) => {
  if (!mins || mins === 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function TasksPage() {
  const { role, canDo, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'individual'

  const isMaster = employeeProfile?.email === 'manisreethaar@gmail.com';
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

  useEffect(() => {
    if (selectedTask) {
      setCompletionNote(''); setProofFile(null); setRejectNote('');
      setProgressNote(''); setProgressPercentage(selectedTask.progress_percentage || 0);
    }
  }, [selectedTask?.id]);

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    if (employeeProfile) fetchTasks();
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
    const task = tasks.find(t => t.id === taskId);
    const success = await executeTaskPatch('approve', taskId);
    if (success) { if (task?.assigned_to) notifyEmployee(task.assigned_to, '✅ Task Approved', `Your task "${task.title}" has been approved.`, '/tasks'); setSelectedTask(null); fetchTasks(); }
  };

  const handleReject = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    const success = await executeTaskPatch('reject', taskId, { reject_note: rejectNote });
    if (success) { if (task?.assigned_to) notifyEmployee(task.assigned_to, '🔄 Task Returned', `Your task "${task.title}" needs revision: ${rejectNote}`, '/tasks'); setRejectNote(''); setSelectedTask(null); fetchTasks(); }
  };

  const filteredTasks = tasks.filter(t => (statusFilter === 'All' || t.status === statusFilter) && (assigneeFilter === 'All' || t.assigned_to === assigneeFilter));
  
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
          totalCount: 0,
          checklist: task.checklist,
          status: 'open'
        };
      }
      groups[key].assignees.push(task);
      groups[key].totalCount++;
      if (task.status === 'done') groups[key].completedCount++;
      if (task.approval_status === 'pending_review') groups[key].pendingReviewCount++;
      
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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Task Operations</h1>
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

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 focus:ring-2 focus:ring-accent outline-none">
            <option value="All">All Statuses</option><option value="open">Open</option><option value="in-progress">In Progress</option><option value="done">Done</option>
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 focus:ring-2 focus:ring-accent outline-none">
            <option value="All">All Assignees</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
      )}

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
                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}><Clock className="w-3 h-3"/>{group.due_date ? new Date(group.due_date).toLocaleDateString() : '—'}</span>
                </div>
                {group.pendingReviewCount > 0 && <div className="mt-3 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border border-amber-100 bg-amber-50 text-amber-700 text-center animate-pulse">{group.pendingReviewCount} Pending Review</div>}
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
            const approvalBadge = { 'pending_review': { label: 'Review', cls: 'bg-amber-50 text-amber-700 border-amber-100' }, 'approved': { label: 'Approved ✓', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' }, 'rejected': { label: 'Returned', cls: 'bg-red-50 text-red-700 border-red-100' } }[task.approval_status];

            return (
              <div key={task.id} onClick={() => setSelectedTask(task)} className={`surface p-5 flex flex-col cursor-pointer hover:border-gray-300 transition-colors relative overflow-hidden ${isOverdue ? 'border-red-200 bg-red-50/10' : ''}`}>
                <div className={`absolute top-0 left-0 w-1 p-0.5 h-full ${task.status === 'done' ? 'bg-emerald-500' : task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-amber-500' : task.priority === 'medium' ? 'bg-blue-400' : 'bg-gray-300'}`}></div>
                <div className="flex justify-between items-start mb-2 pl-1">
                  <div className="flex gap-1.5 items-center">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${task.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-100' : task.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-blue-50 text-blue-700 border-blue-50'}`}>{task.priority}</span>
                    {task.is_acknowledged && <Eye className="w-3 h-3 text-emerald-500" title={`Acknowledged: ${task.acknowledged_at ? new Date(task.acknowledged_at).toLocaleTimeString() : ''}`} />}
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${task.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{task.status}</span>
                </div>
                <h3 className={`text-sm font-bold mb-1 pl-1 ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</h3>
                
                <div className="pl-1 mb-2">
                  <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase mb-0.5">
                    <span>Progress</span>
                    <span>{displayPct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1">
                    <div className={`h-1 rounded-full ${displayPct === 100 ? 'bg-emerald-500' : 'bg-navy'}`} style={{ width: `${displayPct}%` }}></div>
                  </div>
                </div>

                <div className="mt-auto pt-2 border-t border-gray-100 flex justify-between items-center text-[10px] font-bold text-gray-400">
                  <span>{task.assigned_user?.full_name || 'Staff'}</span>
                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}><Clock className="w-3 h-3"/>{task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}</span>
                </div>
                {approvalBadge && <div className={`mt-2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border text-center ${approvalBadge.cls}`}>{approvalBadge.label}</div>}
              </div>
            );
          })}
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="p-5 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
              <div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${selectedTask.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700'}`}>{selectedTask.priority}</span>
                <h3 className="text-base font-bold text-gray-900 mt-1">{selectedTask.title}</h3>
              </div>
              <div className="flex gap-1 text-gray-400">
                {(isMaster || (selectedTask?.assigned_by && String(selectedTask.assigned_by) === String(employeeProfile?.id))) && (
                    <button onClick={() => handleDeleteTask(selectedTask.id)} className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600" title="Delete Task"><Trash2 className="w-4 h-4"/></button>
                )}
                {(isMaster || (selectedTask?.assigned_by && String(selectedTask.assigned_by) === String(employeeProfile?.id))) && (
                   <button onClick={() => handleEditTask(selectedTask)} className="p-1.5 rounded-md hover:bg-gray-50 hover:text-navy" title="Edit Task Settings"><Timer className="w-4 h-4 rotate-45"/></button>
                )}
                <button onClick={handleCloseModal} className="p-1.5 rounded-md hover:bg-gray-50"><X className="w-4 h-4"/></button>
              </div>
            </div>

            <div className="p-5 pb-20 space-y-5">
              {!selectedTask.is_acknowledged && selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-3 text-emerald-800">
                    <Eye className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-bold">New Task assigned. Please acknowledge.</span>
                  </div>
                  <button onClick={() => handleAcknowledge(selectedTask.id)} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm transition-colors">Acknowledge</button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex flex-col justify-center">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Assignees</p>
                    <div className="flex flex-wrap gap-1">
                      {groupedTasks.find(g => g.title === selectedTask.title && g.description === selectedTask.description)?.assignees.map((a, idx) => (
                        <span key={idx} className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-bold text-gray-700 text-[10px]">
                          {a.assigned_user?.full_name?.split(' ')[0] || 'Staff'}
                        </span>
                      ))}
                    </div>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Due Date</p>
                    <p className="font-bold text-gray-800">{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : '—'}</p>
                </div>
              </div>

              {selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && selectedTask.status !== 'done' && (
                <div className="space-y-4 border-y border-gray-100 py-5">
                   <div className="flex items-center justify-between mb-1">
                      <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5"/> Work Progress</h4>
                      <span className="text-sm font-black text-navy">{progressPercentage}%</span>
                   </div>
                   
                   <input type="range" min="0" max="100" value={progressPercentage} onChange={(e) => setProgressPercentage(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-navy" />
                   
                   <form onSubmit={handleUpdateProgress} className="flex gap-2">
                      <input type="text" value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="What are you working on?..." className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-navy outline-none" />
                      <button type="submit" disabled={actionLoading} className="px-4 bg-navy hover:bg-navy-hover text-white text-[10px] font-bold rounded-lg shadow-sm transition-all whitespace-nowrap">Log Note</button>
                   </form>
                </div>
              )}

              {selectedTask.progress_logs?.length > 0 && (
                <div className="space-y-3">
                   <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/> Activity Timeline</h4>
                   <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                      {selectedTask.progress_logs.map((log, i) => (
                        <div key={i} className="flex gap-3 relative pb-2 group">
                          {i < selectedTask.progress_logs.length - 1 && <div className="absolute left-1.5 top-4 w-px h-full bg-gray-100"></div>}
                          <div className={`w-3 h-3 rounded-full mt-1 shrink-0 z-10 ${log.percentage === 100 ? 'bg-emerald-500' : 'bg-navy'}`}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <p className="text-[9px] font-black text-gray-400">{new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                              <span className="text-[9px] font-black text-navy px-1 bg-gray-100 rounded">{log.percentage}%</span>
                            </div>
                            <p className="text-xs font-semibold text-gray-700 leading-snug">{log.note}</p>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}

              {selectedTask.checklist?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Checklist</p>
                  <ul className="space-y-1.5">
                    {selectedTask.checklist.map((item, i) => (
                      <li key={i} onClick={() => selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && toggleChecklistItem(selectedTask, i)} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${item.done ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' : 'bg-white border-gray-100 cursor-pointer'}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>{item.done && <CheckCircle2 className="w-3 h-3 text-white"/>}</div>
                        <span className={`text-xs font-semibold ${item.done ? 'line-through opacity-70' : ''}`}>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                 </div>
              )}

              {selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && selectedTask.status !== 'done' && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase text-gray-400 mb-1">Cumulative Time Spent</span>
                    <span className="text-2xl font-black tabular-nums text-gray-900 tracking-tight">
                      {String(Math.floor(((selectedTask.logged_minutes || 0) * 60 + elapsedSeconds) / 3600)).padStart(2,'0')}:
                      {String(Math.floor((((selectedTask.logged_minutes || 0) * 60 + elapsedSeconds) % 3600) / 60)).padStart(2,'0')}:
                      {String(((selectedTask.logged_minutes || 0) * 60 + elapsedSeconds) % 60).padStart(2,'0')}
                    </span>
                  </div>
                  {!timerRunning ? (
                    <button onClick={() => handleStartTimer(selectedTask)} className="px-3 py-1.5 bg-navy text-white font-bold text-xs rounded-lg shadow-sm hover:scale-105 transition-transform"><CheckSquare className="w-3.5 h-3.5 inline mr-1"/> Start & Acknowledge</button>
                  ) : (
                    <button onClick={handlePauseTimer} className="px-3 py-1.5 bg-amber-500 text-white font-bold text-xs rounded-lg hover:bg-amber-600"><Timer className="w-3.5 h-3.5 inline mr-1"/> Pause Timer</button>
                  )}
                </div>
              )}

              {selectedTask.assigned_to && String(selectedTask.assigned_to) === String(employeeProfile?.id) && selectedTask.status === 'in-progress' && selectedTask.approval_status !== 'pending_review' && (
                <form onSubmit={handleSubmitForReview} className="space-y-3 border-t border-gray-100 pt-4">
                  <textarea required value={completionNote} onChange={e => setCompletionNote(e.target.value)} rows="2" placeholder="Describe work done..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-accent outline-none bg-white resize-none"/>
                  <div className="flex gap-2">
                    <input type="file" ref={fileRef} className="hidden" onChange={e => setProofFile(e.target.files[0])} />
                    <button type="button" onClick={() => fileRef.current.click()} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 bg-white"><Paperclip className="w-3.5 h-3.5"/> {proofFile ? 'File Attached' : 'Attach Proof'}</button>
                    {proofFile && <button type="button" onClick={() => setProofFile(null)} className="text-red-500"><X className="w-4 h-4"/></button>}
                  </div>
                  <button type="submit" disabled={actionLoading || uploading} className="w-full py-2 bg-navy text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5">{uploading ? 'Uploading...' : 'Submit Work for Review'}</button>
                </form>
              )}

              {selectedTask.proof_url && <div className="pt-2"><a href={selectedTask.proof_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 font-bold text-xs"><Paperclip className="w-3.5 h-3.5"/> View Proof</a></div>}
              {selectedTask.completion_note && <div className="bg-gray-50 p-3 rounded-lg border border-gray-100"><p className="text-[9px] font-bold text-gray-400 uppercase">Completion Notes</p><p className="text-xs text-gray-700 font-medium">{selectedTask.completion_note}</p></div>}

              {canApprove && selectedTask.approval_status === 'pending_review' && (
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows="2" placeholder="Rejection notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-accent bg-white resize-none"/>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(selectedTask.id)} className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs">Approve</button>
                    <button onClick={() => handleReject(selectedTask.id)} disabled={!rejectNote.trim()} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg text-xs disabled:opacity-40">Return</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                ⚠ Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
