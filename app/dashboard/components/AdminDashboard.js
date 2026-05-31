'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { AlertTriangle, FlaskConical, CalendarOff, CheckSquare, CalendarDays, Settings, X, Users, Download, ShieldAlert, Calendar, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { differenceInHours } from 'date-fns';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

const ProductionYieldChart = dynamic(() => import('@/components/charts/ProductionYieldChart'), { ssr: false });
const StorageWidget = dynamic(() => import('@/components/StorageWidget'), { ssr: false });

export default function AdminDashboard({ employeeId }) {
  const toast = useToast();
  const [stats, setStats] = useState({ batches: 0, leaves: 0, tasks: 0, compliance: 0, mispunches: 0 });
  const [alerts, setAlerts] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [thresholds, setThresholds] = useState({ minPh: 4.0, maxPh: 7.8, tempMax: 35 });
  const [chartData, setChartData] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ checkedIn: 0, total: 0 });
  const [pendingMispunches, setPendingMispunches] = useState([]);
  const [reviewingMispunch, setReviewingMispunch] = useState(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [pendingQuickApprove, setPendingQuickApprove] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [lowStock, setLowStock] = useState([]);
  const [calibDue, setCalibDue] = useState([]);
  const [openCapa, setOpenCapa] = useState([]);
  const [qcHoldBatches, setQcHoldBatches] = useState([]);
  const [qcHoldDismissed, setQcHoldDismissed] = useState(false);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const supabase = useMemo(() => createClient(), []);

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
      const res = await fetch('/api/admin/dashboard-stats');
      const result = await res.json();
      
      if (result.success) {
        const { stats, leaves, mispunches, activeBatches, chartData } = result.data;
        
        setStats({
          batches:    stats.activeBatches,
          leaves:     stats.pendingLeaves,
          tasks:      stats.urgentTasks,
          compliance: stats.upcomingCompliance,
          mispunches: mispunches?.length ?? 0,
        });
        setChartData(chartData);
        setActiveBatches(activeBatches);
        setAttendanceStats({ checkedIn: stats.checkedInToday, total: stats.totalEmployees });
        setPendingMispunches(mispunches);
        
        // Set alerts for unacknowledged deviations
        if (stats.unacknowledgedDeviations > 0) {
          setAlerts([{ type: 'deviation', count: stats.unacknowledgedDeviations, message: 'Unacknowledged pH deviations need attention', link: '/compliance' }]);
        }
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOperationalAlerts = useCallback(async () => {
    try {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const [stockRes, calibRes, capaRes, qcHoldRes, leavesRes] = await Promise.all([
        // Server-side filter low stock directly ΓÇö no more limit(50) then slice(5)
        supabase.from('inventory_stock').select('id, current_quantity, min_stock_level, unit, item:inventory_items(id, name)').not('min_stock_level', 'is', null).gt('min_stock_level', 0).filter('current_quantity', 'lt', 'min_stock_level').limit(5),
        supabase.from('equipment').select('id, name, calibration_due_date').lte('calibration_due_date', sevenDaysFromNow.toISOString().split('T')[0]).not('calibration_due_date', 'is', null).limit(5),
        supabase.from('deviations').select('id, title, severity, status, batch_id, batches(id, batch_id)').neq('status', 'Closed').order('created_at', { ascending: false }).limit(5),
        supabase.from('batches').select('id, batch_id, current_stage, status, formulations(name)').is('archived_at', null).eq('current_stage', 'qc_hold').not('status', 'in', '("released","rejected")').order('created_at', { ascending: false }),
        supabase.from('leave_applications').select('id, leave_type, start_date, end_date, employee:employees(full_name)').eq('status', 'pending').order('created_at', { ascending: true }).limit(5),
      ]);
      setLowStock(stockRes.data || []);
      setCalibDue(calibRes.data || []);
      setOpenCapa(capaRes.data || []);
      setQcHoldBatches(qcHoldRes.data || []);
      setPendingLeaves(leavesRes.data || []);
    } catch (err) { console.error('Operational alerts fetch error:', err); }
  }, [supabase]);

  useEffect(() => {
    fetchDashboardData(true);
    fetchThresholds();
    fetchOperationalAlerts();

    // Realtime: re-fetch KPIs when batches, tasks, or leaves change
    const channel = supabase
      .channel('admin-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' },         () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' },           () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_applications' }, () => { fetchDashboardData(); fetchOperationalAlerts(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchOperationalAlerts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMispunchReview = async (action, selectedMispunch = reviewingMispunch) => {
    if (!selectedMispunch) return;
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
                logId: selectedMispunch.id,
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
          <p className="text-xs text-gray-500">Live Operational Overview ΓÇö {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
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

      {/* Live Production Chart */}
      <div className="surface p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-gray-900 tracking-tight">Production Yield ΓÇö Last 6 Months</h3>
          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded uppercase tracking-widest">Live Data</span>
        </div>
        <div className="h-72 w-full min-w-0">
          <ProductionYieldChart data={chartData} />
        </div>
        {chartData.every(d => d.Released === 0 && d.Rejected === 0) && (
          <p className="text-center text-xs text-gray-400 font-medium mt-2">No completed batches yet ΓÇö data will populate as batches are released or rejected.</p>
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
              {(() => {
                const BATCH_STAGES = ['media_prep','sterilisation','inoculation','fermentation','qc_hold','released'];
                const STAGE_LABEL  = { media_prep:'Media Prep', sterilisation:'Sterilisation', inoculation:'Inoculation', fermentation:'Fermentation', qc_hold:'QC Hold', released:'Released' };
                const STAGE_COLOR  = { media_prep:'bg-indigo-100 text-indigo-700', sterilisation:'bg-blue-100 text-blue-700', inoculation:'bg-violet-100 text-violet-700', fermentation:'bg-teal-100 text-teal-700', qc_hold:'bg-rose-100 text-rose-700', released:'bg-emerald-100 text-emerald-700' };
                return activeBatches.map(batch => {
                  const hoursElapsed = differenceInHours(new Date(), new Date(batch.created_at || new Date()));
                  const latestPh = batch.ph_readings?.[batch.ph_readings.length - 1];
                  const stageIdx = BATCH_STAGES.indexOf(batch.current_stage);
                  const progress = stageIdx >= 0 ? Math.round(((stageIdx + 1) / BATCH_STAGES.length) * 100) : 0;
                  return (
                    <div key={batch.id} className="border border-gray-200 rounded-xl p-4 flex flex-col hover:border-gray-300 transition-colors bg-white relative">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-mono text-xs font-bold text-gray-400 mb-1">{batch.batch_id}</p>
                          <p className="font-bold text-gray-900 tracking-tight text-sm leading-tight">{batch.variant}</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black bg-gray-100 text-gray-600 border border-gray-200">{hoursElapsed}H</span>
                      </div>
                      <div className="mb-3">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${STAGE_COLOR[batch.current_stage] || 'bg-gray-100 text-gray-500'}`}>
                          {STAGE_LABEL[batch.current_stage] || batch.current_stage || 'Unknown'}
                        </span>
                        <div className="mt-2 w-full bg-gray-100 rounded-full h-1">
                          <div className="bg-navy rounded-full h-1 transition-all" style={{ width: `${progress}%` }}/>
                        </div>
                      </div>
                      <div className="flex items-center mt-auto pt-3 border-t border-gray-100 justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">pH</p>
                          <p className={`font-black text-lg ${latestPh?.is_deviation ? 'text-red-500' : 'text-emerald-600'}`}>
                            {latestPh?.ph_value || 'ΓÇö'}
                          </p>
                        </div>
                        <Link href={`/batches/${batch.id}`} className="px-3 py-1.5 bg-navy text-white text-xs font-bold rounded-lg hover:bg-navy-hover shadow-sm">
                          Open Batch
                        </Link>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* QC Hold ΓÇö Awaiting Release Decision */}
      {qcHoldBatches.length > 0 && !qcHoldDismissed && (
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200 flex justify-between items-center bg-amber-50">
            <h2 className="text-base font-bold text-amber-900 tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600"/>
              ΓÜá Awaiting Release Decision
              <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 text-white text-[11px] font-black">{qcHoldBatches.length}</span>
            </h2>
            <button onClick={() => setQcHoldDismissed(true)} className="text-amber-400 hover:text-amber-700 transition-colors" aria-label="Dismiss">
              <X className="w-4 h-4"/>
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {qcHoldBatches.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-black text-amber-900">{b.batch_id}</p>
                    {b.formulations?.name && <p className="text-[11px] text-amber-700 font-semibold truncate mt-0.5">{b.formulations.name}</p>}
                  </div>
                  <Link href={`/batches/${b.id}`} className="ml-3 shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black rounded-lg shadow-sm transition-colors whitespace-nowrap">
                    Review ΓåÆ
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Operational Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="surface p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500"/> Low Stock Alerts
          </h3>
          {lowStock.length === 0 ? (
            <p className="text-xs text-gray-400 py-2 text-center">All stock levels OK.</p>
          ) : (
            <div className="space-y-1.5">
              {lowStock.map(item => (
                <Link key={item.id} href={`/inventory?search=${encodeURIComponent(item.item?.name || '')}`} className="flex justify-between items-center p-2 bg-amber-50 rounded-lg border border-amber-100 hover:bg-amber-100 transition-colors">
                  <span className="text-xs font-bold text-amber-800 truncate">{item.item?.name}</span>
                  <span className="text-[10px] font-black text-amber-600 whitespace-nowrap ml-2 bg-amber-100 px-1.5 py-0.5 rounded">{item.current_quantity ?? 'ΓÇö'} {item.unit}</span>
                </Link>
              ))}
              <Link href="/inventory" className="block text-center text-xs font-bold text-amber-600 hover:underline mt-1 pt-1 border-t border-amber-100">View Inventory ΓåÆ</Link>
            </div>
          )}
        </div>

        <div className="surface p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-500"/> Calibration Due
          </h3>
          {calibDue.length === 0 ? (
            <p className="text-xs text-gray-400 py-2 text-center">No overdue calibrations.</p>
          ) : (
            <div className="space-y-1.5">
              {calibDue.map(eq => {
                const isOverdue = new Date(eq.calibration_due_date) < new Date();
                return (
                  <Link key={eq.id} href="/equipment" className={`flex justify-between items-center p-2 rounded-lg border hover:opacity-90 transition-colors ${isOverdue ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                    <span className={`text-xs font-bold truncate ${isOverdue ? 'text-red-800' : 'text-amber-800'}`}>{eq.name}</span>
                    <span className={`text-[10px] font-black whitespace-nowrap ml-2 px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{new Date(eq.calibration_due_date).toLocaleDateString()}</span>
                  </Link>
                );
              })}
              <Link href="/equipment" className="block text-center text-xs font-bold text-blue-600 hover:underline mt-1 pt-1 border-t border-gray-100">View Equipment ΓåÆ</Link>
            </div>
          )}
        </div>

        <div className="surface p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500"/> Open CAPA Items
          </h3>
          {openCapa.length === 0 ? (
            <p className="text-xs text-gray-400 py-2 text-center">No open deviations.</p>
          ) : (
            <div className="space-y-1.5">
              {openCapa.map(dev => (
                <div key={dev.id} className="p-2 bg-red-50 rounded-lg border border-red-100 space-y-1">
                  <Link href="/capa" className="flex justify-between items-center hover:opacity-80 transition-opacity">
                    <span className="text-xs font-bold text-red-800 truncate">{dev.title}</span>
                    <span className={`text-[9px] font-black whitespace-nowrap ml-2 px-1.5 py-0.5 rounded ${dev.severity === 'Critical' ? 'bg-red-200 text-red-800' : dev.severity === 'Major' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{dev.severity}</span>
                  </Link>
                  {dev.batches && (
                    <Link href={`/batches/${dev.batches.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white text-teal-700 text-[9px] font-black rounded border border-teal-100 hover:bg-teal-50 transition-colors">
                      Batch {dev.batches.batch_id}
                    </Link>
                  )}
                </div>
              ))}
              <Link href="/capa" className="block text-center text-xs font-bold text-red-600 hover:underline mt-1 pt-1 border-t border-red-100">View CAPA Manager ΓåÆ</Link>
            </div>
          )}
        </div>
      </div>

      {/* Pending Leave Approvals */}
      {pendingLeaves.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 flex justify-between items-center bg-amber-50/40">
            <h2 className="text-base font-bold text-amber-900 tracking-tight flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-amber-600" />
              Pending Leave Approvals
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black">{pendingLeaves.length}</span>
            </h2>
            <Link href="/leave" className="text-xs font-bold text-amber-700 hover:underline">Manage All ΓåÆ</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingLeaves.map(l => (
              <div key={l.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50/50 transition-colors">
                <div>
                  <p className="text-sm font-bold text-gray-900">{l.employee?.full_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {l.leave_type} ┬╖ {new Date(l.start_date).toLocaleDateString('en-IN')} ΓÇô {new Date(l.end_date).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <Link href="/leave" className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black rounded-lg shadow-sm transition-colors whitespace-nowrap">
                  Review ΓåÆ
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

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
                      onClick={() => setPendingQuickApprove(log)}
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
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Max Temperature Limit (┬░C)</label>
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

      {/* Quick Approve Modal */}
      {pendingQuickApprove && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Quick Approve Mispunch</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Are you sure you want to approve <strong className="text-emerald-600">{pendingQuickApprove.mispunch_requested_hours}h</strong> for <strong>{pendingQuickApprove.employees?.full_name}</strong>?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingQuickApprove(null)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const selectedMispunch = pendingQuickApprove;
                  setReviewingMispunch(selectedMispunch);
                  setPendingQuickApprove(null);
                  await handleMispunchReview('approve', selectedMispunch);
                }}
                disabled={actionLoading}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition w-full"
              >
                {actionLoading ? 'Approving...' : 'Γ£ô Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* System Storage Widget */}
      <StorageWidget />

    </div>
  );
}
