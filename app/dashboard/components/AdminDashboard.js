'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { AlertTriangle, FlaskConical, CalendarOff, CheckSquare, CalendarDays, Settings, X, Package, Users, Download, ShieldAlert, Calendar, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
const ProductionYieldChart = dynamic(() => import('@/components/charts/ProductionYieldChart'), { ssr: false });
import Link from 'next/link';
import { differenceInHours } from 'date-fns';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminDashboard({ employeeId }) {
  const toast = useToast();
  const [stats, setStats] = useState({ batches: 0, leaves: 0, tasks: 0, compliance: 0 });
  const [alerts, setAlerts] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [thresholds, setThresholds] = useState({ minPh: 4.0, maxPh: 7.8, tempMax: 35 });
  const [chartData, setChartData] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ checkedIn: 0, total: 0 });
  const [pendingMispunches, setPendingMispunches] = useState([]);
  const [reviewingMispunch, setReviewingMispunch] = useState(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetchDashboardData(true);
    fetchThresholds();
  }, []);

  const fetchThresholds = async () => {
    try {
      const res = await fetch('/api/admin/thresholds');
      const data = await res.json();
      if (data.success) {
        setThresholds(data.data);
      }
    } catch (err) {
      console.error('Failed to load thresholds:', err);
    }
  };

  const saveThresholds = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Thresholds saved successfully');
        setShowConfig(false);
      } else {
        toast.error(data.error || 'Failed to save thresholds');
      }
    } catch (err) {
      toast.error('Failed to save thresholds');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchDashboardData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const results = await Promise.all([
        supabase.from('ph_readings').select('batch_id').eq('is_deviation', true).eq('deviation_acknowledged', false),
        supabase.from('compliance_items').select('id').eq('status', 'overdue'),
        supabase.from('batches').select('*, ph_readings(ph_value, is_deviation)').not('status', 'in', '("released","rejected")'),
        supabase.from('leave_applications').select('*, employees(full_name)').eq('status', 'pending'),
        supabase.from('tasks').select('id', { count: 'exact' }).eq('status', 'open').eq('priority', 'urgent'),
        supabase.from('compliance_items').select('id', { count: 'exact' }).in('status', ['upcoming', 'in-progress']),
        supabase.from('batches').select('status, created_at').in('status', ['released', 'rejected']).order('created_at', { ascending: true }),
        supabase.from('inventory_stock').select('*, inventory_items(name, unit, min_stock_level)').eq('status', 'Available').gt('current_quantity', 0),
        supabase.from('attendance_log').select('id').eq('date', todayStr),
        supabase.from('employees').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('attendance_log').select('*, employees(full_name)').eq('mispunch_status', 'pending')
      ]);

      const [devReq, overReq, batchesReq, leavesReq, tasksReq, compReq, batchHistoryReq, invStockReq, attendanceReq, totalEmpsReq, mispunchesReq] = results;
      
      const deviations = devReq.data;
      const overdues = overReq.data;
      const batches = batchesReq.data;
      const leaves = leavesReq.data;
      const openTasksCount = tasksReq.count || 0;
      const compDueCount = compReq.count || 0;
      const mispunches = mispunchesReq.data || [];

      // Build real chart data — group by month
      const batchHistory = batchHistoryReq.data || [];
      const monthMap = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthMap[key] = { month: key, Released: 0, Rejected: 0 };
      }
      batchHistory.forEach(b => {
        const key = new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (monthMap[key]) {
          if (b.status === 'released') monthMap[key].Released++;
          else if (b.status === 'rejected') monthMap[key].Rejected++;
        }
      });
      setChartData(Object.values(monthMap));

      // Build inventory alerts for low stock
      const invStock = invStockReq.data || [];
      const lowStock = invStock.filter(s => {
        const minLevel = parseFloat(s.inventory_items?.min_stock_level || 0);
        return minLevel > 0 && parseFloat(s.current_quantity) <= minLevel;
      });
      // Also check expiring within 30 days
      const soonExpiring = invStock.filter(s => {
        if (!s.expiry_date) return false;
        const daysLeft = Math.floor((new Date(s.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return daysLeft >= 0 && daysLeft <= 30;
      });
      setInventoryAlerts({ lowStock: lowStock.length, expiring: soonExpiring.length });

      // Attendance
      setAttendanceStats({
        checkedIn: (attendanceReq.data || []).length,
        total: totalEmpsReq.count || 0
      });

      const newAlerts = [];
      if (deviations?.length > 0) newAlerts.push({ message: `Critical: ${deviations.length} unacknowledged pH deviation(s)!`, type: 'danger', link: '/batches' });
      if (overdues?.length > 0) newAlerts.push({ message: `${overdues.length} compliance item(s) are overdue.`, type: 'warning', link: '/compliance' });
      if (lowStock.length > 0) newAlerts.push({ message: `${lowStock.length} inventory item(s) below minimum threshold.`, type: 'warning', link: '/inventory' });
      setAlerts(newAlerts);

      setActiveBatches(batches || []);
      setStats({
        batches: batches?.length || 0,
        leaves: leaves?.length || 0,
        tasks: openTasksCount,
        compliance: compDueCount,
        mispunches: mispunches.length
      });
      setPendingMispunches(mispunches);

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMispunchReview = async (action) => {
    if (!reviewingMispunch) return;
    if (action === 'reject' && (!rejectRemark || rejectRemark.trim().length < 5)) {
        toast.warn("Please provide a valid rejection remark (min 5 characters).");
        return;
    }
    setActionLoading(true);
    try {
        const res = await fetch('/api/mispunch/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                logId: reviewingMispunch.id,
                action,
                remark: action === 'reject' ? rejectRemark : undefined
            })
        });
        if (!res.ok) throw new Error((await res.json()).error || "Review failed");
        
        setReviewingMispunch(null);
        setRejectRemark('');
        fetchDashboardData();
        toast.success(`Mispunch successfully ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (err) {
        toast.error(err.message);
    } finally {
        setActionLoading(false);
    }
  };


  const StatCard = ({ title, value, icon: Icon, color, link, subtitle }) => (
    <Link href={link} className="surface p-6 flex flex-col justify-between hover:border-gray-300 transition-all duration-150 group">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3.5 rounded-xl border ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {subtitle && <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded">{subtitle}</span>}
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
      {/* Header */}
      <div className="surface p-6 flex justify-between items-center bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Admin Controller</h2>
          <p className="text-xs text-gray-500">Live Operational Overview — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
             onClick={async () => {
                const res = await fetch('/api/reports/attendance');
                if (res.ok) {
                   const blob = await res.blob();
                   const url = window.URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.href = url;
                   a.download = `Global_Attendance_${new Date().toISOString().split('T')[0]}.csv`;
                   document.body.appendChild(a);
                   a.click();
                   a.remove();
                } else { toast.error("Export failed."); }
             }}
             className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-sm transition-all"
          >
            <Download className="w-4 h-4"/> Export Logs
          </button>
          <button onClick={() => setShowConfig(true)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm transition-all">
            <Settings className="w-4 h-4"/> Safeguards
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {alerts.map((alert, i) => (
        <div key={i} className={`p-4 rounded-xl flex items-center justify-between border ${alert.type === 'danger' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 mr-3 shrink-0" />
            <span className="font-bold text-sm">{alert.message}</span>
          </div>
          <Link href={alert.link} className={`px-4 py-2 rounded-lg text-xs font-bold shadow-sm ${alert.type === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
            Resolve
          </Link>
        </div>
      ))}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Batches" value={stats.batches} icon={FlaskConical} color="bg-blue-50 border-blue-100 text-blue-600" link="/batches" />
        <StatCard title="Leave Queue" value={stats.leaves} icon={CalendarOff} color="bg-amber-50 border-amber-100 text-amber-600" link="/leave" />
        <StatCard title="Mispunch Queue" value={stats.mispunches} icon={ShieldAlert} color="bg-red-50 border-red-100 text-red-600" link="/dashboard" subtitle={stats.mispunches > 0 ? "Action Required" : null} />
        <StatCard title="Urgent Tasks" value={stats.tasks} icon={CheckSquare} color="bg-orange-50 border-orange-100 text-orange-600" link="/tasks" />
        <StatCard
          title="Present Today"
          value={`${attendanceStats.checkedIn}/${attendanceStats.total}`}
          icon={Users}
          color="bg-emerald-50 border-emerald-100 text-emerald-600"
          link="/attendance"
          subtitle="Live"
        />
      </div>

      {/* Inventory Summary Row */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/inventory?filter=low" className="surface p-5 flex items-center gap-4 hover:border-gray-300 transition-all">
          <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
            <Package className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Low Stock Items</p>
            <p className={`text-3xl font-black tracking-tight ${inventoryAlerts.lowStock > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{inventoryAlerts.lowStock || 0}</p>
          </div>
        </Link>
        <Link href="/inventory?filter=expiring" className="surface p-5 flex items-center gap-4 hover:border-gray-300 transition-all">
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
            <CalendarDays className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Expiring &lt;30 Days</p>
            <p className={`text-3xl font-black tracking-tight ${inventoryAlerts.expiring > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{inventoryAlerts.expiring || 0}</p>
          </div>
        </Link>
      </div>

      {/* Live Production Chart */}
      <div className="surface p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-gray-900 tracking-tight">Production Yield — Last 6 Months</h3>
          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded uppercase tracking-widest">Live Data</span>
        </div>
        <div className="h-72">
          <ProductionYieldChart data={chartData} />
        </div>
        {chartData.every(d => d.Released === 0 && d.Rejected === 0) && (
          <p className="text-center text-xs text-gray-400 font-medium mt-2">No completed batches yet — data will populate as batches are released or rejected.</p>
        )}
      </div>

      {/* Production Panel */}
      <div className="surface overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-base font-bold text-gray-900 tracking-tight">Live Production Hub</h2>
          <Link href="/batches" className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200 transition-colors">View All</Link>
        </div>
        <div className="p-6">
          {activeBatches.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FlaskConical className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">No active batches running.</p>
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
                        <p className="font-mono text-xs font-bold text-gray-400 mb-1">{batch.batch_id}</p>
                        <p className="font-bold text-gray-900 tracking-tight text-sm leading-tight">{batch.variant}</p>
                      </div>
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black bg-gray-100 text-gray-600 border border-gray-200">{hoursElapsed}H</span>
                    </div>
                    <div className="flex items-center mt-auto pt-4 border-t border-gray-100 justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">pH</p>
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

      {/* Mispunch Review Section */}
      {pendingMispunches.length > 0 && (
        <div className="surface overflow-hidden flex flex-col border-red-100">
           <div className="px-6 py-4 border-b border-red-100 flex justify-between items-center bg-red-50/30">
            <h2 className="text-base font-bold text-red-900 tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Pending Mispunch Reconciliations
            </h2>
          </div>
          <div className="p-6">
            <div className="grid gap-4">
              {pendingMispunches.map(log => (
                <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-50 rounded-lg">
                       <Calendar className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{log.employees?.full_name}</p>
                      <p className="text-[10px] text-gray-500 font-medium">Log Date: {new Date(log.date).toLocaleDateString()} | Requested: <strong className="text-navy">{log.mispunch_requested_hours}h</strong></p>
                      <p className="text-xs text-slate-600 mt-1 italic">&quot;{log.mispunch_reason}&quot;</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setReviewingMispunch(log); setRejectRemark(''); }}
                      className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50"
                    >
                      Process
                    </button>
                    <button 
                      onClick={async () => {
                        if (confirm(`Approve ${log.mispunch_requested_hours}h for ${log.employees?.full_name}?`)) {
                          setReviewingMispunch(log);
                          await handleMispunchReview('approve');
                        }
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-sm"
                    >
                      Quick Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mispunch Modal */}
      <AnimatePresence>
        {reviewingMispunch && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Review Mispunch Request</h3>
                    <p className="text-xs text-gray-500 mt-1">Requested by {reviewingMispunch.employees?.full_name}</p>
                  </div>
                  <button onClick={() => setReviewingMispunch(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                 <div className="bg-navy/5 p-4 rounded-xl border border-navy/10">
                    <p className="text-[10px] font-black text-navy uppercase tracking-widest mb-1.5">User Statement</p>
                    <p className="text-sm text-gray-700 italic">&quot;{reviewingMispunch.mispunch_reason}&quot;</p>
                    <div className="mt-4 flex items-center justify-between">
                       <span className="text-xs font-bold text-gray-500">Requested Hours:</span>
                       <span className="text-base font-black text-navy px-3 py-1 bg-white rounded-lg border border-navy/10">{reviewingMispunch.mispunch_requested_hours}H</span>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Rejection Remark (Required only for rejection)</label>
                    <textarea 
                      placeholder="e.g. Employee actually left early per CCTV evidence..."
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none text-sm min-h-[100px] resize-none"
                      value={rejectRemark}
                      onChange={e => setRejectRemark(e.target.value)}
                    />
                 </div>
              </div>

              <div className="p-4 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => handleMispunchReview('reject')}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-white text-red-600 font-bold rounded-lg border border-red-200 text-sm flex items-center justify-center hover:bg-red-50 transition-colors"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject Request'}
                </button>
                <button 
                  onClick={() => handleMispunchReview('approve')}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center justify-center disabled:opacity-50 text-sm transition-colors"
                >
                   {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve Reconciliation'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Safeguards Modal */}
      <AnimatePresence>
        {showConfig && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl max-w-sm w-full p-6 relative shadow-xl border border-gray-100"
            >
              <button onClick={() => setShowConfig(false)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              <h2 className="text-base font-bold text-gray-900 mb-1 tracking-tight">Safeguard Thresholds</h2>
              <p className="text-xs text-gray-500 mb-4">Set operational boundaries for automated alerts.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Minimum pH Warning</label>
                  <input type="number" step="0.1" value={thresholds.minPh} onChange={e => setThresholds({...thresholds, minPh: parseFloat(e.target.value)})} className="w-full border border-gray-200 rounded-lg p-2 outline-none font-semibold text-sm"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Maximum pH Warning</label>
                  <input type="number" step="0.1" value={thresholds.maxPh} onChange={e => setThresholds({...thresholds, maxPh: parseFloat(e.target.value)})} className="w-full border border-gray-200 rounded-lg p-2 outline-none font-semibold text-sm"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Max Temperature Limit (°C)</label>
                  <input type="number" value={thresholds.tempMax} onChange={e => setThresholds({...thresholds, tempMax: parseInt(e.target.value)})} className="w-full border border-gray-200 rounded-lg p-2 outline-none font-semibold text-sm"/>
                </div>
                <button onClick={saveThresholds} disabled={actionLoading} className="w-full py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg text-xs uppercase tracking-wider shadow-sm mt-2 flex items-center justify-center gap-2">
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Apply Thresholds
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
