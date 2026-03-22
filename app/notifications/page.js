'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { BellRing, CheckSquare, AlertTriangle, FileWarning, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { differenceInDays } from 'date-fns';

export default function NotificationsPage() {
  const { employeeProfile, role } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    if (employeeProfile) fetchAlerts();
  }, [employeeProfile]);

  const fetchAlerts = async () => {
    setLoading(true);
    const notifications = [];
    try {
      const tasksPromise = supabase
        .from('tasks')
        .select('id, title, priority, due_date')
        .eq('assigned_to', employeeProfile.id)
        .eq('status', 'open')
        .order('due_date', { ascending: true })
        .limit(50);

      const compliancePromise = role === 'admin' 
        ? supabase.from('compliance_items').select('id, title, due_date').neq('status', 'done').order('due_date', { ascending: true }).limit(50)
        : Promise.resolve({ data: null });

      const [tasksRes, complianceRes] = await Promise.all([tasksPromise, compliancePromise]);

      if (tasksRes.data) {
        tasksRes.data.forEach(t => {
          const isOverdue = t.due_date && differenceInDays(new Date(t.due_date), new Date()) < 0;
          notifications.push({
            id: `task-${t.id}`,
            type: 'task',
            title: t.title,
            priority: t.priority,
            isOverdue,
            url: '/tasks',
            icon: isOverdue ? AlertTriangle : CheckSquare,
            color: isOverdue ? 'text-red-600 bg-red-50 border-red-200' : 'text-blue-600 bg-blue-50 border-blue-200'
          });
        });
      }

      if (role === 'admin' && complianceRes.data) {
        complianceRes.data.forEach(c => {
          const isOverdue = c.due_date && differenceInDays(new Date(c.due_date), new Date()) < 0;
          if (isOverdue) {
            notifications.push({
              id: `comp-${c.id}`,
              type: 'compliance',
              title: c.title,
              priority: 'urgent',
              isOverdue: true,
              url: '/compliance',
              icon: FileWarning,
              color: 'text-amber-600 bg-amber-50 border-amber-200'
            });
          }
        });
      }

      notifications.sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
        return 0;
      });

      setAlerts(notifications);
    } catch (err) { console.error('Fetch alerts error:', err); }
    finally { setLoading(false); }
  };


  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Activity & Alerts</h1>
          <p className="text-slate-500 mt-1 font-medium">Pending tasks, system warnings, and direct notifications.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"/>
        </div>
      ) : alerts.length === 0 ? (
        <div className="glass-card rounded-[2rem] p-12 text-center flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-24 h-24 bg-teal-50 rounded-full flex flex-col items-center justify-center mb-6 border border-teal-100 shadow-sm relative text-teal-600">
            <BellRing className="w-10 h-10 mb-1" />
            <span className="absolute top-4 right-4 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></span>
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">You&apos;re All Caught Up</h2>
          <p className="text-slate-500 font-medium max-w-sm mb-8 leading-relaxed">
            No pending tasks or critical system alerts assigned to you.
          </p>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-400 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
            <CheckSquare className="w-4 h-4" /> System monitoring active
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
             const Icon = alert.icon;
             return (
               <Link href={alert.url} key={alert.id} className="block w-full glass-card rounded-2xl p-5 flex items-center justify-between hover:shadow-md hover:-translate-y-0.5 transition-all outline-none focus:ring-2 focus:ring-teal-500">
                 <div className="flex items-center gap-4">
                   <div className={`p-3 rounded-xl border ${alert.color}`}>
                     <Icon className="w-6 h-6" />
                   </div>
                   <div>
                     <div className="flex items-center gap-2 mb-1">
                       <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${alert.isOverdue ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                         {alert.isOverdue ? 'Overdue' : 'Pending'}
                       </span>
                       {alert.priority && (
                         <span className={`text-[10px] font-black uppercase tracking-widest ${alert.priority === 'urgent' ? 'text-rose-600' : 'text-slate-400'}`}>
                           {alert.priority} Priority
                         </span>
                       )}
                     </div>
                     <h3 className="text-base font-black text-slate-800 leading-tight">{alert.title}</h3>
                     <p className="text-xs font-medium text-slate-500 mt-1 capitalize">{alert.type} Action Required</p>
                   </div>
                 </div>
                 <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
               </Link>
             );
          })}
        </div>
      )}
    </div>
  );
}
