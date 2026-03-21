'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CheckSquare, Clock, AlertTriangle, Plus, Search, CheckCircle2 } from 'lucide-react';
import { differenceInDays } from 'date-fns';

export default function TasksPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  
  // Form states
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', assigned_to: '', due_date: '', priority: 'low' });
  
  // Complete modal
  const [completingTask, setCompletingTask] = useState(null);
  const [completionNote, setCompletionNote] = useState('');

  const supabase = createClient();

  useEffect(() => {
    if (employeeProfile) fetchTasks();
  }, [employeeProfile]);

  const fetchTasks = async () => {
    setLoading(true);
    let query = supabase.from('tasks').select('*, assigned_user:employees!tasks_assigned_to_fkey(full_name), creator:employees!tasks_assigned_by_fkey(full_name)').order('due_date', { ascending: true });
    
    if (role !== 'admin') {
      query = query.eq('assigned_to', employeeProfile.id);
    } else {
      const { data: emps } = await supabase.from('employees').select('id, full_name').eq('is_active', true);
      setEmployees(emps || []);
    }

    const { data } = await query;
    setTasks(data || []);
    setLoading(false);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('tasks').insert({
      ...newTask,
      assigned_by: employeeProfile.id,
      status: 'open'
    });
    
    if (!error) {
      // Fire Push Notification in background
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_to: newTask.assigned_to,
          title: "New Task: " + newTask.priority.toUpperCase() + " Priority",
          body: newTask.title,
          url: "/tasks"
        })
      }).catch(err => console.error("Push trigger failed:", err));

      setShowCreate(false);
      setNewTask({ title: '', description: '', assigned_to: '', due_date: '', priority: 'low' });
      fetchTasks();
    }
  };

  const updateTaskStatus = async (id, newStatus) => {
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    fetchTasks();
  };

  const completeTask = async (e) => {
    e.preventDefault();
    await supabase.from('tasks').update({ 
      status: 'done',
      completion_note: completionNote,
      completed_at: new Date().toISOString()
    }).eq('id', completingTask.id);
    
    setCompletingTask(null);
    setCompletionNote('');
    fetchTasks();
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading tasks...</div>;

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (assigneeFilter !== 'All' && t.assigned_to !== assigneeFilter) return false;
    return true;
  });

  const overdueCount = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && differenceInDays(new Date(t.due_date), new Date()) < 0).length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {role === 'admin' && overdueCount > 0 && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center text-red-800">
            <AlertTriangle className="w-6 h-6 mr-3" />
            <span className="font-bold text-lg">You have {overdueCount} overdue active task(s).</span>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Task Management</h1>
          <p className="text-gray-500 mt-1">Assign, track, and complete daily operational objectives.</p>
        </div>
        {role === 'admin' && (
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm">
            <Plus className="w-5 h-5 mr-1" /> Assign New Task
          </button>
        )}
      </div>

      {showCreate && role === 'admin' && (
        <form onSubmit={handleCreateTask} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Assign Task</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Task Title *</label>
              <input type="text" required value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" placeholder="e.g., Prepare 100L fermenter for Batch VA-2026" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
              <textarea value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} rows="2" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" placeholder="Requirements or SOP links..."></textarea>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Assign To *</label>
              <select required value={newTask.assigned_to} onChange={e => setNewTask({...newTask, assigned_to: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500">
                <option value="">Select team member...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Due Date *</label>
                <input type="date" required value={newTask.due_date} onChange={e => setNewTask({...newTask, due_date: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Priority *</label>
                <select required value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-3 border-t border-gray-100 pt-6">
            <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-5 py-2 text-sm font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 shadow-sm">Assign Task</button>
          </div>
        </form>
      )}

      {/* Filters (Admin) */}
      {role === 'admin' && (
        <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 w-full sm:w-48">
            <option value="All">All Statuses</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
            <option value="overdue">Overdue</option>
          </select>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 w-full sm:w-64">
            <option value="All">All Assignees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
      )}

      {/* Task Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTasks.map(task => {
          const isOverdue = task.status !== 'done' && task.status !== 'cancelled' && differenceInDays(new Date(task.due_date), new Date()) < 0;
          
          return (
            <div key={task.id} className={`bg-white rounded-2xl border p-6 flex flex-col shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${isOverdue ? 'border-red-300 bg-red-50/10' : 'border-gray-200'}`}>
              <div className={`absolute top-0 left-0 w-1 h-full ${task.status === 'done' ? 'bg-green-500' : task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-amber-500' : 'bg-blue-400'}`}></div>
              
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                  task.priority === 'urgent' ? 'bg-red-100 text-red-800 border-red-200' : 
                  task.priority === 'high' ? 'bg-amber-100 text-amber-800 border-amber-200' : 
                  'bg-blue-50 text-blue-700 border-blue-100'
                }`}>
                  {task.priority} Priority
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  task.status === 'done' ? 'bg-green-100 text-green-800' : 
                  task.status === 'in-progress' ? 'bg-purple-100 text-purple-800' : 
                  'bg-gray-100 text-gray-600'
                }`}>
                  {task.status}
                </span>
              </div>
              
              <h3 className={`text-lg font-bold mb-2 ${task.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{task.title}</h3>
              {task.description && <p className="text-sm text-gray-600 mb-4 line-clamp-2">{task.description}</p>}
              
              <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
                  {role === 'admin' && <span>Assignee: <strong className="text-gray-800">{task.assigned_user?.full_name}</strong></span>}
                  {role !== 'admin' && <span>By: <strong className="text-gray-800">{task.creator?.full_name}</strong></span>}
                  <span className={`flex items-center ${isOverdue ? 'text-red-600 font-bold' : ''}`}>
                    <Clock className="w-3 h-3 mr-1" /> {new Date(task.due_date).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              {role !== 'admin' && task.status === 'open' && (
                <button onClick={() => updateTaskStatus(task.id, 'in-progress')} className="mt-4 w-full py-2 bg-teal-50 text-teal-800 font-semibold text-sm rounded-lg hover:bg-teal-100 border border-teal-100 transition-colors">
                  Start Work
                </button>
              )}
              {role !== 'admin' && task.status === 'in-progress' && (
                <button onClick={() => setCompletingTask(task)} className="mt-4 w-full py-2 bg-green-600 text-white font-semibold text-sm rounded-lg hover:bg-green-700 transition-colors flex justify-center items-center">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Complete
                </button>
              )}
              {role === 'admin' && task.status === 'done' && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-700 italic border border-gray-200">
                  <span className="font-semibold non-italic not-italic block mb-1">Completion Note:</span>
                  {task.completion_note || 'Task recorded as completed.'} - {new Date(task.completed_at).toLocaleDateString()}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Completion Modal */}
      {completingTask && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={completeTask} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Complete Task</h3>
            <p className="text-sm text-gray-600 mb-4">Please provide a brief summary of what was done to complete <strong className="text-gray-900">&quot;{completingTask.title}&quot;</strong>.</p>
            <textarea required value={completionNote} onChange={e => setCompletionNote(e.target.value)} rows="3" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 mb-6 text-sm" placeholder="Notes, readings, or results..."></textarea>
            <div className="flex justify-end space-x-3">
              <button type="button" onClick={() => setCompletingTask(null)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg border border-gray-300">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg flex items-center"><CheckCircle2 className="w-4 h-4 mr-2"/> Submit</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
