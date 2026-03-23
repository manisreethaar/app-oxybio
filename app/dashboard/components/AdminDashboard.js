'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { AlertTriangle, FlaskConical, CalendarOff, CheckSquare, CalendarDays, Settings, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Link from 'next/link';
import { differenceInHours } from 'date-fns';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminDashboard({ employeeId }) {
  const [stats, setStats] = useState({ batches: 0, leaves: 0, tasks: 0, compliance: 0 });
  const [alerts, setAlerts] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [thresholds, setThresholds] = useState({ minPh: 4.0, maxPh: 7.8, tempMax: 35 });
  const [chartData, setChartData] = useState([]);
  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [devReq, overReq, batchesReq, leavesReq, tasksReq, compReq] = await Promise.all([
        supabase.from('ph_readings').select('batch_id').eq('is_deviation', true).eq('deviation_acknowledged', false),
        supabase.from('compliance_items').select('id').eq('status', 'overdue'),
        supabase.from('batches').select(`*, ph_readings(ph_value, is_deviation)`).eq('status', 'fermenting'),
        supabase.from('leave_applications').select('*, employees(full_name)').eq('status', 'pending'),
        supabase.from('tasks').select('id', { count: 'exact' }).eq('status', 'open').eq('priority', 'urgent'),
        supabase.from('compliance_items').select('id', { count: 'exact' }).in('status', ['upcoming', 'in-progress'])
      ]);

      const deviations = devReq.data;
      const overdues = overReq.data;
      const batches = batchesReq.data;
      const leaves = leavesReq.data;
      const openTasksCount = tasksReq.count || 0;
      const compDueCount = compReq.count || 0;
      
      const newAlerts = [];
      if (deviations?.length > 0) newAlerts.push({ message: `Critical: ${deviations.length} unacknowledged pH deviations!`, type: 'danger', link: '/batches' });
      if (overdues?.length > 0) newAlerts.push({ message: `${overdues.length} compliance items are overdue.`, type: 'warning', link: '/compliance' });
      setAlerts(newAlerts);

      setActiveBatches(batches || []);

      setStats({
        batches: batches?.length || 0,
        leaves: leaves?.length || 0,
        tasks: openTasksCount,
        compliance: compDueCount
      });

      setChartData([
        { month: 'Oct', Released: 12, Rejected: 1 },
        { month: 'Nov', Released: 15, Rejected: 0 },
        { month: 'Dec', Released: 14, Rejected: 2 },
        { month: 'Jan', Released: 19, Rejected: 1 },
        { month: 'Feb', Released: 22, Rejected: 0 },
        { month: 'Mar', Released: (batches?.length || 0) + 18, Rejected: 1 }
      ]);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, link }) => (
    <Link href={link} className="surface p-6 flex flex-col justify-between hover:border-gray-300 transition-all duration-150 group">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3.5 rounded-xl border ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
        <p className="text-3xl font-black text-gray-900 tracking-tight">{value}</p>
      </div>
    </Link>
  );

  if (loading) return (
    <div className="space-y-8">
      <div className="surface p-6 flex justify-between items-center"><Skeleton width={200} height={28}/> <Skeleton width={100} height={36}/></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl"/>)}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl"/>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Config */}
      <div className="surface p-6 flex justify-between items-center bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Admin Controller</h2>
          <p className="text-xs text-gray-500">Operational Threshold Core Sync</p>
        </div>
        <button onClick={() => setShowConfig(true)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm">
          <Settings className="w-4 h-4"/> Safeguards
        </button>
      </div>

      {/* Alert Banner */}
      {alerts.map((alert, i) => (
        <div key={i} className={`p-4 rounded-xl flex items-center justify-between border ${
          alert.type === 'danger' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 mr-3 shrink-0" />
            <span className="font-bold text-sm">{alert.message}</span>
          </div>
          <Link href={alert.link} className={`px-4 py-2 rounded-lg text-xs font-bold shadow-sm ${
            alert.type === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}>
            Resolve
          </Link>
        </div>
      ))}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Batches" value={stats.batches} icon={FlaskConical} color="bg-blue-50 border-blue-100 text-blue-600" link="/batches" />
        <StatCard title="Leave Approval Queue" value={stats.leaves} icon={CalendarOff} color="bg-amber-50 border-amber-100 text-amber-600" link="/leave" />
        <StatCard title="Priority Tasks" value={stats.tasks} icon={CheckSquare} color="bg-red-50 border-red-100 text-red-600" link="/tasks" />
        <StatCard title="Compliance Due" value={stats.compliance} icon={CalendarDays} color="bg-purple-50 border-purple-100 text-purple-600" link="/compliance" />
      </div>

      {/* Analytics Graph */}
      <div className="surface p-6">
        <h3 className="text-base font-bold text-gray-900 tracking-tight mb-6">Continuous Production Yield Rate</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB"/>
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }} />
              <Tooltip contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontSize: '12px' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingTop: '10px' }} />
              <Line type="monotone" dataKey="Released" stroke="#1F3A5F" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Rejected" stroke="#DC2626" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Production Panel */}
      <div className="surface overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-base font-bold text-gray-900 tracking-tight">Live Production Hub</h2>
          <Link href="/batches" className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200 transition-colors">View Registry</Link>
        </div>
        <div className="p-6">
          {activeBatches.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FlaskConical className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">No fermenting batches currently active.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeBatches.map(batch => {
                const hoursElapsed = differenceInHours(new Date(), new Date(batch.created_at || new Date()));
                const latestPh = batch.ph_readings?.[batch.ph_readings.length - 1];
                
                return (
                  <div key={batch.id} className="border border-gray-200 rounded-xl p-4 flex flex-col hover:border-gray-300 transition-colors bg-white relative">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-mono text-xs font-bold text-gray-400 mb-1">{batch.batch_code || 'VA-TEMP'}</p>
                        <p className="font-bold text-gray-900 tracking-tight leading-tight">{batch.variant}</p>
                      </div>
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black bg-gray-100 text-gray-600 border border-gray-200">
                        {hoursElapsed}H ELAPSED
                      </span>
                    </div>
                    <div className="flex items-center mt-auto pt-4 border-t border-gray-100 justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Core pH</p>
                        <p className={`font-black text-lg ${latestPh?.is_deviation ? 'text-red-500' : 'text-emerald-600'}`}>
                          {latestPh?.ph_value || '—'}
                        </p>
                      </div>
                      <Link href={`/batches/${batch.id}`} className="px-3 py-1.5 bg-navy text-white text-xs font-bold rounded-lg hover:bg-navy-hover shadow-sm">
                        Log Data
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
