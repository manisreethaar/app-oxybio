'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { CheckSquare, Activity } from 'lucide-react';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

export default function StaffDashboard({ employeeProfile }) {
  const employeeId = employeeProfile?.id;
  const limits = {
    casual: employeeProfile?.casual_leave_balance || 12,
    medical: employeeProfile?.medical_leave_balance || 6,
    earned: employeeProfile?.earned_leave_balance || 15
  };

  const [tasks, setTasks] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [leaveStats, setLeaveStats] = useState({ casual: 0, medical: 0, earned: 0 });
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    fetchStaffData(true);
  }, []);

  const fetchStaffData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const [tasksRes, leavesRes, batchesRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('assigned_to', employeeId).in('status', ['open', 'in-progress']).order('due_date', { ascending: true }).limit(5),
        supabase.from('leave_applications').select('leave_type, start_date, end_date').eq('employee_id', employeeId).eq('status', 'approved'),
        supabase.from('batches').select('id, batch_id, current_stage, product_name').neq('status', 'completed').limit(3)
      ]);

      setTasks(tasksRes.data || []);
      setActiveBatches(batchesRes.data || []);
      
      let c = 0, m = 0, e = 0;
      (leavesRes.data || []).forEach(l => {
        if (!l.start_date || !l.end_date) return;
        const days = Math.ceil((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / (1000 * 3600 * 24)) + 1;
        if (l.leave_type === 'Casual') c += days;
        if (l.leave_type === 'Sick') m += days;
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in duration-300">
      <div className="md:col-span-2 space-y-8">
        {/* Quick Actions (Staff Version) */}
        <div className="surface p-8 flex flex-col sm:flex-row items-center justify-between">
          <div className="mb-4 sm:mb-0 text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Ready to Log Data?</h2>
            <p className="text-sm text-gray-500">Capture real-time pH metrics and shift activities instantly.</p>
          </div>
          <Link href="/activity" className="px-5 py-3 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl flex items-center justify-center shadow-sm transition-colors text-sm">
            <Activity className="w-4 h-4 mr-2" /> Initiate Activity
          </Link>
        </div>

        {/* Innovation 3: Contextual Batch Prompting */}
        {activeBatches.length > 0 && (
          <div className="bg-white border-l-4 border-navy p-6 rounded-xl shadow-sm space-y-4">
             <div className="flex items-center justify-between">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Contextual Operational Prompt</h2>
                <span className="bg-navy text-white text-[10px] font-black px-2 py-0.5 rounded animate-pulse">ACTION REQUIRED</span>
             </div>
             {activeBatches.map(batch => {
                const nextStepMap = {
                  'media_prep': 'Initialize Fermentation Cycle',
                  'fermentation': 'Conduct Sampling & QA Analysis',
                  'testing': 'Finalize QC & Package Approval',
                  'formulation': 'Validate Ingredient Ratios'
                };
                return (
                  <div key={batch.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 group hover:border-navy transition-all">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Batch {batch.batch_id} · {batch.product_name || 'Generic'}</p>
                      <p className="text-sm font-black text-gray-900">Next Action: {nextStepMap[batch.current_stage] || 'Monitor Process Status'}</p>
                    </div>
                    <Link href={`/batches`} className="text-[10px] font-black text-navy bg-white border border-gray-200 px-3 py-2 rounded-lg group-hover:bg-navy group-hover:text-white group-hover:border-navy transition-all">
                      GO TO BATCH
                    </Link>
                  </div>
                )
             })}
          </div>
        )}

        {/* My Tasks */}
        <div className="surface overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Active Operations</h2>
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
                          task.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-100' : 
                          'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {task.priority.toUpperCase()}
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
      </div>

      <div className="space-y-8">
        {/* Leave Balance Widget */}
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">Time Off Balances</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-end pb-3 border-b border-gray-100">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Casual Leave</span>
              <span className="text-xl font-black text-gray-900">{limits.casual - leaveStats.casual} <span className="text-xs text-gray-400 font-semibold">/ {limits.casual}</span></span>
            </div>
            <div className="flex justify-between items-end pb-3 border-b border-gray-100">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Medical Leave</span>
              <span className="text-xl font-black text-gray-900">{limits.medical - leaveStats.medical} <span className="text-xs text-gray-400 font-semibold">/ {limits.medical}</span></span>
            </div>
            <div className="flex justify-between items-end pb-3 border-b border-gray-100">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Earned Leave</span>
              <span className="text-xl font-black text-gray-900">{limits.earned - leaveStats.earned} <span className="text-xs text-gray-400 font-semibold">/ {limits.earned}</span></span>
            </div>
            <Link href="/leave" className="mt-6 block w-full py-2.5 text-center text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
              Submit Requisition
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
