'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AlertTriangle, FlaskConical, CalendarOff, CheckSquare, CalendarDays, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { differenceInHours } from 'date-fns';

export default function AdminDashboard({ employeeId }) {
  const [stats, setStats] = useState({ batches: 0, leaves: 0, tasks: 0, compliance: 0 });
  const [alerts, setAlerts] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [teamPresence, setTeamPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    
    try {
      // Fetch alerts (deviations & overdue)
      const { data: deviations } = await supabase.from('ph_readings').select('batch_id').eq('is_deviation', true).eq('deviation_acknowledged', false);
      const { data: overdues } = await supabase.from('compliance_items').select('id').eq('status', 'overdue');
      
      const newAlerts = [];
      if (deviations?.length > 0) newAlerts.push({ message: `Critical: ${deviations.length} unacknowledged pH deviations!`, type: 'danger', link: '/batches' });
      if (overdues?.length > 0) newAlerts.push({ message: `${overdues.length} compliance items are overdue.`, type: 'warning', link: '/compliance' });
      setAlerts(newAlerts);

      // Fetch active batches
      const { data: batches } = await supabase.from('batches').select(`*, ph_readings(ph_value, is_deviation)`).eq('status', 'fermenting');
      setActiveBatches(batches || []);

      // Fetch leaves pending
      const { data: leaves } = await supabase.from('leave_applications').select('*, employees(full_name)').eq('status', 'pending');
      setPendingLeaves(leaves || []);

      // Fetch stats
      const { data: openTasks } = await supabase.from('tasks').select('id', { count: 'exact' }).eq('status', 'open').eq('priority', 'urgent');
      const { data: compDue } = await supabase.from('compliance_items').select('id', { count: 'exact' }).in('status', ['upcoming', 'in-progress']); 
      
      setStats({
        batches: batches?.length || 0,
        leaves: leaves?.length || 0,
        tasks: openTasks?.length || 0,
        compliance: compDue?.length || 0
      });

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, link }) => (
    <Link href={link} className={`glass-card p-6 rounded-[2rem] flex flex-col justify-between group overflow-hidden relative`}>
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/20 rounded-full blur-2xl group-hover:bg-white/40 transition-all duration-500"></div>
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className={`p-4 rounded-2xl shadow-sm border border-white/50 bg-gradient-to-br ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
        <p className="text-4xl font-black text-slate-800 tracking-tight">{value}</p>
      </div>
    </Link>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      {/* Alert Banner */}
      {alerts.map((alert, i) => (
        <div key={i} className={`p-5 rounded-2xl flex items-center justify-between glass-card shadow-lg ${alert.type === 'danger' ? 'bg-red-500/10 border-red-500/20 text-red-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-700'}`}>
          <div className="flex items-center">
            <AlertTriangle className={`w-6 h-6 mr-4 ${alert.type === 'danger' ? 'animate-bounce' : ''}`} />
            <span className="font-bold text-lg">{alert.message}</span>
          </div>
          <Link href={alert.link} className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-transform active:scale-95 ${alert.type === 'danger' ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white hover:shadow-red-500/25' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-amber-500/25'}`}>
            Take Action
          </Link>
        </div>
      ))}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Batches" value={stats.batches} icon={FlaskConical} color="from-teal-400 to-emerald-500" link="/batches" />
        <StatCard title="Pending Approvals" value={stats.leaves} icon={CalendarOff} color="from-blue-400 to-indigo-500" link="/leave" />
        <StatCard title="Priority Tasks" value={stats.tasks} icon={CheckSquare} color="from-rose-400 to-red-500" link="/tasks" />
        <StatCard title="Compliance Due" value={stats.compliance} icon={CalendarDays} color="from-amber-400 to-orange-500" link="/compliance" />
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Production Panel */}
        <div className="glass-card rounded-[2.5rem] overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-white/40 flex justify-between items-center bg-white/20">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Live Production Hub</h2>
            <Link href="/batches" className="text-sm font-bold text-teal-600 hover:text-teal-800 bg-white/50 px-4 py-2 rounded-xl shadow-sm border border-white/60 transition-all hover:bg-white/80">View Registry</Link>
          </div>
          <div className="p-8 flex-1 bg-white/10">
            {activeBatches.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-white/50 rounded-2xl flex items-center justify-center mb-4 border border-white/60 shadow-sm"><FlaskConical className="w-8 h-8 text-slate-300" /></div>
                <p className="text-slate-500 font-medium">No fermenting batches currently active.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeBatches.map(batch => {
                  const hoursElapsed = differenceInHours(new Date(), new Date(batch.start_time));
                  const latestPh = batch.ph_readings && batch.ph_readings.length > 0 
                    ? batch.ph_readings[batch.ph_readings.length - 1] 
                    : null;
                  
                  return (
                    <div key={batch.id} className="bg-white/60 backdrop-blur-md rounded-3xl p-6 flex flex-col relative overflow-hidden border border-white/60 shadow-sm hover:shadow-md transition-shadow group">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-teal-400 to-cyan-500 rounded-l-3xl"></div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="font-mono text-xs font-bold text-teal-700 mb-1.5 tracking-wider">{batch.batch_id}</p>
                          <p className="font-black text-lg text-slate-800 tracking-tight leading-tight">{batch.variant}</p>
                        </div>
                        <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-white shadow-sm border border-slate-100 text-teal-700">
                          {hoursElapsed}h elapsed
                        </span>
                      </div>
                      <div className="flex items-center mt-auto pt-4 border-t border-slate-200/50">
                        <div className="flex-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Core pH</p>
                          {latestPh ? (
                            <p className={`font-black text-xl tracking-tight ${latestPh.is_deviation ? 'text-red-500' : 'text-emerald-500'}`}>
                              {latestPh.ph_value}
                            </p>
                          ) : (
                            <p className="text-sm font-bold text-slate-300">Pending</p>
                          )}
                        </div>
                        <Link href={`/batches/${batch.id}`} className="px-4 py-2 bg-gradient-to-br from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-sm font-bold rounded-xl shadow-md transition-all active:scale-95 border border-slate-700">
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
    </div>
  );
}
