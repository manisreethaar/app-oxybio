'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { 
  CheckSquare, Clock, AlertTriangle, Plus, CheckCircle2, 
  ChevronDown, ChevronUp, Timer, Paperclip, ThumbsUp, 
  ThumbsDown, X, ListChecks, PlayCircle, Loader2, FileCheck
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

// ─── Helper: format minutes into Xh Ym ────────────────────────────────────
const formatMinutes = (mins) => {
  if (!mins || mins === 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function TasksPage() {
  const { role, canDo, employeeProfile, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');

  // New task form
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ 
    title: '', description: '', assigned_to: '', due_date: '', 
    priority: 'medium', checklist: [] 
  });
  const [checklistInput, setChecklistInput] = useState('');

  // Detail view / action
  const [selectedTask, setSelectedTask] = useState(null);
  const [completionNote, setCompletionNote] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);  // NEW seconds only in this session
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Reset all action-state whenever a different task is opened
  useEffect(() => {
    if (selectedTask) {
      setCompletionNote('');
      setProofFile(null);
      setElapsedSeconds(0);
      setTimerRunning(false);
      setRejectNote('');
    }
  }, [selectedTask?.id]);

  const supabase = createClient();

  useEffect(() => {
    if (employeeProfile) fetchTasks();
  }, [employeeProfile]);

  // Live timer
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  const fetchTasks = async () => {
    setLoading(true);
    let query = supabase
      .from('tasks')
      .select('*, assigned_user:employees!tasks_assigned_to_fkey(full_name), creator:employees!tasks_assigned_by_fkey(full_name)')
      .order('due_date', { ascending: true });

    if (!canDo('tasks', 'assign')) {
      query = query.eq('assigned_to', employeeProfile.id);
    } else {
      const { data: emps } = await supabase.from('employees').select('id, full_name').eq('is_active', true);
      setEmployees(emps || []);
    }

    const { data } = await query;
    setTasks(data || []);
    setLoading(false);
  };

  // ─── Create Task ────────────────────────────────────────────────────────────
  const addChecklistItem = () => {
    if (!checklistInput.trim()) return;
    setNewTask(t => ({ 
      ...t, 
      checklist: [...(t.checklist || []), { text: checklistInput.trim(), done: false }] 
    }));
    setChecklistInput('');
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    const { error } = await supabase.from('tasks').insert({
      title: newTask.title,
      description: newTask.description,
      assigned_to: newTask.assigned_to,
      assigned_by: employeeProfile.id,
      due_date: newTask.due_date,
      priority: newTask.priority,
      checklist: newTask.checklist || [],
      status: 'open',
      approval_status: 'not_required',
      logged_minutes: 0
    });

    if (!error) {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_to: newTask.assigned_to,
          title: "New Task: " + newTask.priority.toUpperCase() + " Priority",
          body: newTask.title,
          url: "/tasks"
        })
      }).catch(() => {});
      setShowCreate(false);
      setNewTask({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium', checklist: [] });
      fetchTasks();
    }
    setActionLoading(false);
  };

  // ─── Timer ─────────────────────────────────────────────────────────────────
  const handleStartTimer = async (task) => {
    if (!task.time_started_at) {
      await supabase.from('tasks').update({ 
        time_started_at: new Date().toISOString(),
        status: 'in-progress'
      }).eq('id', task.id);
    }
    // Reset to 0 — we only track NEW seconds in this session to avoid double-counting
    setElapsedSeconds(0);
    setTimerRunning(true);
    setSelectedTask(t => ({ ...t, status: 'in-progress' }));
    fetchTasks();
  };

  const handlePauseTimer = async () => {
    setTimerRunning(false);
    const newMins = Math.floor(elapsedSeconds / 60);
    if (newMins > 0) {
      try {
        const { error } = await supabase.from('tasks').update({ 
          logged_minutes: (selectedTask?.logged_minutes || 0) + newMins
        }).eq('id', selectedTask.id);
        
        if (error) throw error;
        
        // Update selectedTask state directly (avoids stale tasks-array lookup)
        setSelectedTask(t => ({ ...t, logged_minutes: (t.logged_minutes || 0) + newMins }));
        setElapsedSeconds(0); // reset for next session
        fetchTasks();
      } catch (err) {
        console.error("Timer save failed:", err);
        alert("Network Error: Failed to save time to the cloud. Your exact time has been preserved locally. Please connect to WiFi and try pressing Start then Pause again.");
      }
    } else {
      setElapsedSeconds(0);
    }
  };

  // Save time to DB first, then close — prevents losing time if user closes mid-timer
  const handleCloseModal = async () => {
    if (timerRunning && elapsedSeconds > 0) {
      setTimerRunning(false);
      const newMins = Math.floor(elapsedSeconds / 60);
      if (newMins > 0) {
        try {
          const { error } = await supabase.from('tasks').update({ 
            logged_minutes: (selectedTask?.logged_minutes || 0) + newMins
          }).eq('id', selectedTask.id);
          if (error) throw error;
        } catch (err) {
          alert("Warning: Could not save final timer data due to a network error.");
        }
      }
    }
    setSelectedTask(null);
    setElapsedSeconds(0);
  };

  // ─── Checklist Toggle ───────────────────────────────────────────────────────
  const toggleChecklistItem = async (task, index) => {
    const updated = [...(task.checklist || [])];
    updated[index].done = !updated[index].done;
    await supabase.from('tasks').update({ checklist: updated }).eq('id', task.id);
    if (selectedTask?.id === task.id) setSelectedTask(t => ({ ...t, checklist: updated }));
    fetchTasks();
  };

  // ─── Submit for Review ──────────────────────────────────────────────────────
  const handleSubmitForReview = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setUploading(true);
    let proofUrl = null;

    if (proofFile) {
      const formData = new FormData();
      formData.append('file', proofFile);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        proofUrl = data.url;
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    setUploading(false);

    await supabase.from('tasks').update({
      status: 'done',
      approval_status: 'pending_review',
      completion_note: completionNote,
      completed_at: new Date().toISOString(),
      proof_url: proofUrl,
    }).eq('id', selectedTask.id);

    setSelectedTask(null);
    setCompletionNote('');
    setProofFile(null);
    setTimerRunning(false);
    fetchTasks();
    setActionLoading(false);
  };

  // ─── Admin Approve/Reject ───────────────────────────────────────────────────
  const handleApprove = async (taskId) => {
    await supabase.from('tasks').update({ approval_status: 'approved' }).eq('id', taskId);
    setSelectedTask(null);
    fetchTasks();
  };

  const handleReject = async (taskId) => {
    await supabase.from('tasks').update({ 
      approval_status: 'rejected', 
      status: 'in-progress',
      completion_note: rejectNote || 'Task returned for revision.'
    }).eq('id', taskId);
    setRejectNote('');
    setSelectedTask(null);
    fetchTasks();
  };

  if (authLoading || loading) return (
    <div className="p-8 text-center text-slate-400 font-medium animate-pulse">Loading Task Manager...</div>
  );

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (assigneeFilter !== 'All' && t.assigned_to !== assigneeFilter) return false;
    return true;
  });

  const overdueCount = tasks.filter(t => 
    t.status !== 'done' && t.status !== 'cancelled' && 
    t.due_date && differenceInDays(new Date(t.due_date), new Date()) < 0
  ).length;

  const pendingApprovals = tasks.filter(t => t.approval_status === 'pending_review').length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-24">
      
      {/* Alert banners */}
      <div className="space-y-3">
        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center text-red-800 shadow-sm">
            <AlertTriangle className="w-5 h-5 mr-3 shrink-0" />
            <span className="font-bold">{overdueCount} overdue task{overdueCount > 1 ? 's' : ''} need attention.</span>
          </div>
        )}
        {canDo('tasks', 'approve') && pendingApprovals > 0 && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center text-amber-800 shadow-sm">
            <FileCheck className="w-5 h-5 mr-3 shrink-0" />
            <span className="font-bold">{pendingApprovals} task{pendingApprovals > 1 ? 's' : ''} pending your review and approval.</span>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Task Manager</h1>
          <p className="text-slate-500 mt-1 font-medium">Assign, track, and review operational tasks.</p>
        </div>
        {canDo('tasks', 'assign') && (
          <button onClick={() => setShowCreate(!showCreate)} 
            className="flex items-center px-5 py-2.5 bg-teal-800 text-white font-bold rounded-xl hover:bg-teal-900 transition-colors shadow-sm text-sm uppercase tracking-wide">
            <Plus className="w-4 h-4 mr-2" /> Assign Task
          </button>
        )}
      </div>

      {/* Create Task Form */}
      {showCreate && canDo('tasks', 'assign') && (
        <form onSubmit={handleCreateTask} className="glass-card rounded-3xl p-8 animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-teal-600"/> Create & Assign Task
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Task Title *</label>
              <input type="text" required value={newTask.title} 
                onChange={e => setNewTask({...newTask, title: e.target.value})} 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-medium" 
                placeholder="e.g., Prepare 100L fermenter for Batch VA-2026"/>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Description</label>
              <textarea value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} 
                rows="2" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500" 
                placeholder="Requirements, SOP references or any special instructions..."/>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Assign To *</label>
              <select required value={newTask.assigned_to} onChange={e => setNewTask({...newTask, assigned_to: e.target.value})} 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500">
                <option value="">Select team member...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Due Date *</label>
                <input type="date" required value={newTask.due_date} 
                  onChange={e => setNewTask({...newTask, due_date: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500"/>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Priority</label>
                <select value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* Checklist Builder */}
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Checklist Steps</label>
              <div className="flex gap-2 mb-2">
                <input value={checklistInput} onChange={e => setChecklistInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500" 
                  placeholder="Add a step (press Enter)..."/>
                <button type="button" onClick={addChecklistItem} 
                  className="px-4 py-2.5 bg-teal-100 text-teal-800 font-bold rounded-xl text-sm hover:bg-teal-200 transition-colors">
                  Add
                </button>
              </div>
              {newTask.checklist.length > 0 && (
                <ul className="space-y-1.5">
                  {newTask.checklist.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                      <span className="w-4 h-4 rounded border border-slate-300 inline-block shrink-0"></span>
                      <span className="flex-1 text-slate-700 font-medium">{item.text}</span>
                      <button type="button" onClick={() => setNewTask(t => ({ ...t, checklist: t.checklist.filter((_, j) => j !== i) }))} 
                        className="text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5"/></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-5 border-t border-slate-100">
            <button type="button" onClick={() => setShowCreate(false)} 
              className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={actionLoading}
              className="px-6 py-2.5 text-sm font-bold text-white bg-teal-800 rounded-xl hover:bg-teal-900 shadow-sm disabled:opacity-60">
              {actionLoading ? 'Creating...' : 'Assign Task'}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      {canDo('tasks', 'assign') && (
        <div className="flex flex-wrap gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} 
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm bg-white font-semibold text-slate-600 focus:ring-2 focus:ring-teal-500">
            <option value="All">All Statuses</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} 
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm bg-white font-semibold text-slate-600  focus:ring-2 focus:ring-teal-500">
            <option value="All">All Assignees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
      )}

      {/* Task Grid */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-16 text-slate-400 font-medium">
          <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-30"/>
          <p>No tasks found. All clear!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTasks.map(task => {
            const isOverdue = task.status !== 'done' && task.status !== 'cancelled' && 
              task.due_date && differenceInDays(new Date(task.due_date), new Date()) < 0;
            const checklistTotal = task.checklist?.length || 0;
            const checklistDone = task.checklist?.filter(c => c.done).length || 0;
            const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : null;

            const approvalBadge = {
              'pending_review': { label: 'Pending Review', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
              'approved':       { label: 'Approved ✓',    cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
              'rejected':       { label: 'Returned',      cls: 'bg-red-100 text-red-800 border-red-200' },
            }[task.approval_status];

            return (
              <div key={task.id} 
                onClick={() => setSelectedTask(task)}
                className={`glass-card rounded-2xl p-5 flex flex-col cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all relative overflow-hidden border ${isOverdue ? 'border-red-300' : 'border-white/60'}`}>
                
                {/* Priority stripe */}
                <div className={`absolute top-0 left-0 w-1 h-full ${
                  task.status === 'done' ? 'bg-emerald-500' : 
                  task.priority === 'urgent' ? 'bg-red-500' : 
                  task.priority === 'high' ? 'bg-amber-500' : 
                  task.priority === 'medium' ? 'bg-blue-400' : 'bg-slate-300'}`}>
                </div>

                <div className="flex justify-between items-start mb-3 pl-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                    task.priority === 'urgent' ? 'bg-red-100 text-red-800 border-red-200' : 
                    task.priority === 'high' ? 'bg-amber-100 text-amber-800 border-amber-200' : 
                    task.priority === 'medium' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                    'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {task.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    task.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 
                    task.status === 'in-progress' ? 'bg-purple-100 text-purple-800' : 
                    'bg-slate-100 text-slate-600'}`}>
                    {task.status}
                  </span>
                </div>

                <h3 className={`text-base font-black mb-1 pl-1 ${task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {task.title}
                </h3>
                {task.description && <p className="text-xs text-slate-500 mb-3 pl-1 line-clamp-2 font-medium">{task.description}</p>}

                {/* Checklist progress bar */}
                {checklistPct !== null && (
                  <div className="pl-1 mb-3">
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-1">
                      <span>Checklist</span>
                      <span>{checklistDone}/{checklistTotal}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${checklistPct}%` }}></div>
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-3 border-t border-slate-100 flex justify-between items-center text-[11px] font-bold text-slate-400">
                  <span>{task.assigned_user?.full_name || task.creator?.full_name}</span>
                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
                    <Clock className="w-3 h-3"/>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                  </span>
                </div>

                {approvalBadge && (
                  <div className={`mt-2 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider border text-center ${approvalBadge.cls}`}>
                    {approvalBadge.label}
                  </div>
                )}
                {task.logged_minutes > 0 && (
                  <div className="mt-1 text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <Timer className="w-3 h-3"/> {formatMinutes(task.logged_minutes)} logged
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Task Detail / Action Modal ────────────────────────────────────────── */}
      {selectedTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white rounded-t-3xl z-10">
              <div className="pr-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    selectedTask.priority === 'urgent' ? 'bg-red-100 text-red-700' : 
                    selectedTask.priority === 'high' ? 'bg-amber-100 text-amber-700' : 
                    'bg-blue-50 text-blue-700'}`}>
                    {selectedTask.priority}
                  </span>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{selectedTask.status}</span>
                </div>
                <h3 className="text-lg font-black text-slate-800">{selectedTask.title}</h3>
                {selectedTask.description && <p className="text-sm text-slate-500 mt-1">{selectedTask.description}</p>}
              </div>
              <button onClick={handleCloseModal} 
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Assignee</p>
                  <p className="font-bold text-slate-800">{selectedTask.assigned_user?.full_name || '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Due</p>
                  <p className="font-bold text-slate-800">{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Time Logged</p>
                  <p className="font-bold text-slate-800 font-mono">{formatMinutes(selectedTask.logged_minutes)}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Approval</p>
                  <p className="font-bold text-slate-800 capitalize">{selectedTask.approval_status?.replace('_', ' ') || '—'}</p>
                </div>
              </div>

              {/* Checklist */}
              {selectedTask.checklist?.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Checklist</p>
                  <ul className="space-y-2">
                    {selectedTask.checklist.map((item, i) => (
                      <li key={i} 
                        onClick={() => selectedTask.assigned_to === employeeProfile?.id && toggleChecklistItem(selectedTask, i)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${item.done ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100 cursor-pointer'}`}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                          {item.done && <CheckCircle2 className="w-3 h-3 text-white"/>}
                        </div>
                        <span className={`text-sm font-medium ${item.done ? 'text-emerald-700 line-through' : 'text-slate-700'}`}>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Timer (own task + in-progress) */}
              {selectedTask.assigned_to === employeeProfile?.id && selectedTask.status !== 'done' && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Time Tracker</p>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-black tabular-nums text-slate-800 tracking-tighter font-mono">
                      {String(Math.floor(elapsedSeconds / 3600)).padStart(2,'0')}:{String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2,'0')}:{String(elapsedSeconds % 60).padStart(2,'0')}
                    </span>
                    <div className="flex gap-2">
                      {!timerRunning ? (
                        <button onClick={() => handleStartTimer(selectedTask)}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-800 text-white font-bold text-sm rounded-xl hover:bg-teal-900">
                          <PlayCircle className="w-4 h-4"/> Start
                        </button>
                      ) : (
                        <button onClick={handlePauseTimer}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-bold text-sm rounded-xl hover:bg-amber-600">
                          <Timer className="w-4 h-4"/> Pause
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Proof & Completion (own task + in-progress) */}
              {selectedTask.assigned_to === employeeProfile?.id && selectedTask.status === 'in-progress' && selectedTask.approval_status !== 'pending_review' && (
                <form onSubmit={handleSubmitForReview} className="space-y-4 border-t border-slate-100 pt-5">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Submit for Review</p>
                  <textarea required value={completionNote} onChange={e => setCompletionNote(e.target.value)} 
                    rows="3" placeholder="Describe what was completed, results, or observations..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 bg-slate-50"/>
                  
                  <div className="flex gap-2 items-center">
                    <input type="file" ref={fileRef} className="hidden" onChange={e => setProofFile(e.target.files[0])} accept="image/*,.pdf"/>
                    <button type="button" onClick={() => fileRef.current.click()} 
                      className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 bg-white">
                      <Paperclip className="w-4 h-4"/> {proofFile ? proofFile.name : 'Attach Proof'}
                    </button>
                    {proofFile && <button type="button" onClick={() => setProofFile(null)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4"/></button>}
                  </div>

                  <button type="submit" disabled={actionLoading || uploading}
                    className="w-full py-3 bg-teal-800 text-white font-black rounded-2xl hover:bg-teal-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                    {uploading ? <><Loader2 className="w-4 h-4 animate-spin"/> Uploading...</> : 
                     actionLoading ? 'Submitting...' : 
                     <><FileCheck className="w-4 h-4"/> Submit for Review</>}
                  </button>
                </form>
              )}

              {/* Approval Proof (Admin) */}
              {selectedTask.proof_url && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Proof of Work</p>
                  <a href={selectedTask.proof_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-teal-700 font-bold text-sm hover:underline">
                    <Paperclip className="w-4 h-4"/> View Attached Proof
                  </a>
                </div>
              )}
              {selectedTask.completion_note && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Completion Notes</p>
                  <p className="text-sm text-slate-700 font-medium">{selectedTask.completion_note}</p>
                </div>
              )}

              {/* Admin: Approve / Reject */}
              {canDo('tasks', 'approve') && selectedTask.approval_status === 'pending_review' && (
                <div className="border-t border-slate-100 pt-5 space-y-3">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Review Decision</p>
                  <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} 
                    rows="2" placeholder="Rejection reason (required only if rejecting)..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 bg-slate-50"/>
                  <div className="flex gap-3">
                    <button onClick={() => handleApprove(selectedTask.id)}
                      className="flex-1 py-3 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 flex items-center justify-center gap-2">
                      <ThumbsUp className="w-4 h-4"/> Approve
                    </button>
                    <button onClick={() => handleReject(selectedTask.id)} disabled={!rejectNote.trim()}
                      className="flex-1 py-3 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-40">
                      <ThumbsDown className="w-4 h-4"/> Return
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
