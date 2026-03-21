'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { CheckSquare, CalendarOff, Activity, CalendarDays } from 'lucide-react';
import Link from 'next/link';

export default function StaffDashboard({ employeeId, role }) {
  const [tasks, setTasks] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchStaffData();
  }, []);

  const fetchStaffData = async () => {
    setLoading(true);
    
    try {
      // Fetch my tasks due today or urgent
      const { data: myTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', employeeId)
        .in('status', ['open', 'in-progress'])
        .order('due_date', { ascending: true })
        .limit(5);
      
      setTasks(myTasks || []);

      // Fetch my leave balance conceptually
      const { data: myLeaves } = await supabase
        .from('leave_applications')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('status', 'approved');
      
      setLeaves(myLeaves || []);

    } catch (error) {
      console.error('Error fetching staff dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <div className="md:col-span-2 space-y-8">
        {/* Quick Actions (Staff version) */}
        <div className="glass-card rounded-[2rem] p-8 flex flex-col sm:flex-row items-center justify-between border-none relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-400/20 blur-3xl rounded-full translate-x-1/3 -translate-y-1/3"></div>
          <div className="relative z-10 mb-6 sm:mb-0 text-center sm:text-left">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Ready to Log Data?</h2>
            <p className="text-slate-500 font-medium">Capture real-time pH metrics and shift activities instantly.</p>
          </div>
          <Link href="/activity" className="relative z-10 w-full sm:w-auto px-8 py-4 bg-gradient-to-br from-teal-500 to-cyan-600 text-white font-black rounded-2xl hover:from-teal-400 hover:to-cyan-500 transition-all flex items-center justify-center shadow-lg shadow-teal-500/20 active:scale-95">
            <Activity className="w-5 h-5 mr-3" /> Initiate Activity
          </Link>
        </div>

        {/* My Tasks */}
        <div className="glass-card rounded-[2rem] border border-white/40 overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-white/40 bg-white/20">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Active Operations</h2>
          </div>
          <div className="p-0 bg-white/10 flex-1">
            {tasks.length === 0 ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center h-full">
                <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center mb-4 border border-white/60 shadow-sm">
                  <CheckSquare className="w-10 h-10 text-slate-300" />
                </div>
                <p className="font-bold text-lg">Platform Operations Status Nominal.</p>
                <p className="text-sm">No critical action items assigned.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/20">
                {tasks.map(task => (
                  <li key={task.id} className="p-6 hover:bg-white/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between group">
                    <div className="mb-4 sm:mb-0">
                      <p className="text-lg font-black tracking-tight text-slate-800 mb-2">{task.title}</p>
                      <div className="flex flex-wrap items-center text-xs text-slate-500 gap-2">
                        <span className={`px-3 py-1.25 rounded-md font-bold border 
                          ${task.priority === 'urgent' ? 'bg-red-500/10 text-red-600 border-red-500/20' : 
                            task.priority === 'high' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 
                            'bg-blue-500/10 text-blue-600 border-blue-500/20'}`}>
                          {task.priority.toUpperCase()} PRIORITY
                        </span>
                        <span className="font-semibold px-3 py-1.25 bg-white/50 rounded-md border border-white/60">T - {new Date(task.due_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Link href="/tasks" className="w-full sm:w-auto text-center px-6 py-2.5 bg-white/60 font-black text-teal-700 hover:bg-white rounded-xl shadow-sm border border-white transition-all active:scale-95 group-hover:shadow-md">
                      Engage
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Leave Balance Widget */}
        <div className="glass-card rounded-[2rem] border border-white/40 overflow-hidden">
          <div className="px-8 py-6 border-b border-white/40 bg-white/20">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Time Off Balances</h2>
          </div>
          <div className="p-8 space-y-6 bg-white/10">
            <div className="flex justify-between items-end pb-4 border-b border-white/30">
              <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">Casual Leave</span>
              <span className="text-2xl font-black text-slate-800 leading-none">10 <span className="text-sm text-slate-400 font-semibold">/ 12</span></span>
            </div>
            <div className="flex justify-between items-end pb-4 border-b border-white/30">
              <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">Medical Leave</span>
              <span className="text-2xl font-black text-slate-800 leading-none">5 <span className="text-sm text-slate-400 font-semibold">/ 6</span></span>
            </div>
            <div className="flex justify-between items-end pb-4 border-b border-white/30">
              <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">Earned Leave</span>
              <span className="text-2xl font-black text-slate-800 leading-none">10 <span className="text-sm text-slate-400 font-semibold">/ 15</span></span>
            </div>
            <Link href="/leave" className="mt-8 block w-full py-3.5 text-center text-sm font-black text-slate-700 bg-white/60 border border-white rounded-xl hover:bg-white transition-all shadow-sm active:scale-95">
              Submit Requisition
            </Link>
          </div>
        </div>
        
      </div>
    </div>
  );
}
