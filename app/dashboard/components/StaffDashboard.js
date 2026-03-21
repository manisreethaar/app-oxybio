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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        {/* Quick Actions (Staff version) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-between shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Quick Action</h2>
            <p className="text-sm text-gray-500">Record your activities or lab notes.</p>
          </div>
          <Link href="/activity" className="px-6 py-2.5 bg-teal-800 text-white font-medium rounded-xl hover:bg-teal-900 transition-colors shadow-md shadow-teal-900/10 flex items-center">
            <Activity className="w-4 h-4 mr-2" /> Log Activity
          </Link>
        </div>

        {/* My Tasks */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">My Tasks</h2>
          </div>
          <div className="p-0">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <CheckSquare className="w-8 h-8 text-gray-300 mb-3" />
                <p>No open tasks assigned to you right now.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {tasks.map(task => (
                  <li key={task.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-1">{task.title}</p>
                      <div className="flex items-center text-xs text-gray-500">
                        <span className={`px-2 py-0.5 rounded-md font-medium mr-2 
                          ${task.priority === 'urgent' ? 'bg-red-100 text-red-700' : 
                            task.priority === 'high' ? 'bg-amber-100 text-amber-700' : 
                            'bg-blue-100 text-blue-700'}`}>
                          {task.priority.toUpperCase()}
                        </span>
                        <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Link href="/tasks" className="text-sm font-medium text-teal-600 hover:text-teal-800">
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Leave Balance Widget */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">My Leave Balance</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">Casual Leave (CL)</span>
              <span className="font-bold text-gray-900">10 <span className="text-xs text-gray-400 font-normal">/ 12</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">Sick Leave (SL)</span>
              <span className="font-bold text-gray-900">5 <span className="text-xs text-gray-400 font-normal">/ 6</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">Earned Leave (EL)</span>
              <span className="font-bold text-gray-900">10 <span className="text-xs text-gray-400 font-normal">/ 15</span></span>
            </div>
            <Link href="/leave" className="mt-4 block w-full py-2 text-center text-sm font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100">
              Apply Leave
            </Link>
          </div>
        </div>
        
      </div>
    </div>
  );
}
