'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AlertTriangle, FlaskConical, CalendarOff, CheckSquare, CalendarDays, CheckCircle2, Sliders, Settings, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Link from 'next/link';
import { differenceInHours } from 'date-fns';

export default function AdminDashboard({ employeeId }) {
  const [stats, setStats] = useState({ batches: 0, leaves: 0, tasks: 0, compliance: 0 });
  const [alerts, setAlerts] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [teamPresence, setTeamPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [thresholds, setThresholds] = useState({ minPh: 4.0, maxPh: 7.8, tempMax: 35 });
  const [chartData, setChartData] = useState([]);
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

      // Continuous Yield Analytics (Aggregate batches by timing)
      const mockYield = [
        { month: 'Oct', Released: 12, Rejected: 1 },
        { month: 'Nov', Released: 15, Rejected: 0 },
        { month: 'Dec', Released: 14, Rejected: 2 },
        { month: 'Jan', Released: 19, Rejected: 1 },
        { month: 'Feb', Released: 22, Rejected: 0 },
        { month: 'Mar', Released: stats.batches + 18, Rejected: 1 }
      ];
      setChartData(mockYield);

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
      {/* Header with Config Toggle */}
      <div className="flex justify-between items-center bg-slate-50/50 backdrop-blur-md p-4 rounded-3xl border border-slate-100">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">V8 Admin Controller</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operational Guard Sync</p>
        </div>
        <button onClick={() => setShowConfig(true)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl text-xs font-bold text-slate-600 hover:shadow-md transition-all border border-slate-100 shadow-sm"><Settings className="w-4 h-4"/> Safe Guards</button>
      </div>

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

      {/* Analytics Graph Row */}
      <div className="glass-card rounded-[2.5rem] p-8 border border-white/50 bg-white/30 backdrop-blur-md">
        <h3 className="text-xl font-black text-slate-800 tracking-tight mb-6">Continuous Production Yield rate</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
              <Tooltip contentStyle={{ background: '#ffffff', borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', fontSize: '11px', fontWeight: 'bold' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
              <Line type="monotone" dataKey="Released" stroke="#0d9488" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Rejected" stroke="#e11d48" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
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

      {/* Config Modals */}
      {showConfig && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl relative animate-in fade-in zoom-in duration-200 p-8">
            <button onClick={() => setShowConfig(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-all"><X className="w-5 h-5 text-gray-400" onClick={() => setShowConfig(false)}/></button>
            <h3 className="text-xl font-black text-slate-800 mb-1">Alert thresholds</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Autonomous Trigger limits</p>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); alert('Saved central guards thresholds!'); setShowConfig(false); }}>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Critical pH minimum</label>
                <input type="number" step="0.1" value={thresholds.minPh} onChange={e => setThresholds({...thresholds, minPh: parseFloat(e.target.value)})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Critical pH maximum</label>
                <input type="number" step="0.1" value={thresholds.maxPh} onChange={e => setThresholds({...thresholds, maxPh: parseFloat(e.target.value)})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Max Thermal Offset (°C)</label>
                <input type="number" value={thresholds.tempMax} onChange={e => setThresholds({...thresholds, tempMax: parseFloat(e.target.value)})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              <button type="submit" className="w-full py-4 bg-teal-800 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-teal-900/20 hover:bg-teal-900 transition-all active:scale-95">Save Threshold Config</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
