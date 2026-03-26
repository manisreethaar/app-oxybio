'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { notifyEmployee } from '@/lib/notifyEmployee';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, Loader2, ChevronRight, Activity, Beaker, Droplets, Filter, ShieldCheck, XCircle, Archive, ShoppingCart, Tag } from 'lucide-react';
import Link from 'next/link';

const STAGES = [
  { id: 'media_prep', label: 'Media Prep', icon: Beaker, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { id: 'sterilisation', label: 'Sterilisation', icon: ShieldCheck, color: 'text-slate-600', bg: 'bg-slate-50' },
  { id: 'inoculation', label: 'Inoculation', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'fermentation', label: 'Fermentation', icon: Activity, color: 'text-navy', bg: 'bg-navy/10' },
  { id: 'harvest', label: 'Harvest', icon: Archive, color: 'text-amber-600', bg: 'bg-amber-50' },
  { id: 'downstream', label: 'Downstream', icon: Filter, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
  { id: 'qc_hold', label: 'QC Hold', icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50' },
  { id: 'released', label: 'Released', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'rejected', label: 'Rejected', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' }
];

const PARAMETERS = {
  media_prep: [{ name: 'pH', unit: '', type: 'ph' }, { name: 'Raw Weight', unit: 'kg', type: 'weight' }],
  sterilisation: [{ name: 'Autoclave Temp', unit: '°C', type: 'temp' }, { name: 'Time', unit: 'min', type: 'time' }],
  inoculation: [{ name: 'Seed Volume', unit: 'L', type: 'vol' }, { name: 'Initial OD', unit: '', type: 'od' }],
  fermentation: [{ name: 'pH', unit: '', type: 'ph' }, { name: 'Temperature', unit: '°C', type: 'temp' }, { name: 'DO', unit: '%', type: 'do' }],
  harvest: [{ name: 'Volume Recovered', unit: 'L', type: 'vol' }, { name: 'Cell Density', unit: 'g/L', type: 'density' }],
  downstream: [{ name: 'Flow Rate', unit: 'L/min', type: 'flow' }, { name: 'Purity', unit: '%', type: 'purity' }],
  qc_hold: [{ name: 'Contamination', unit: '/ml', type: 'cont' }, { name: 'Appearance', unit: '', type: 'text' }],
  released: [], rejected: []
};

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [batch, setBatch] = useState(null);
  const [logs, setLogs] = useState([]);
  const [availableStock, setAvailableStock] = useState([]);
  const [paramValue, setParamValue] = useState('');
  const [selectedParam, setSelectedParam] = useState(null);
  const [ingredientStockId, setIngredientStockId] = useState('');
  const [ingredientQty, setIngredientQty] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState({ isTrained: true });
  const [checkingTraining, setCheckingTraining] = useState(false);
  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    const controller = new AbortController();
    if (batchId) {
      Promise.all([fetchBatchDetail(controller.signal), fetchStock(controller.signal)]).catch(() => {});
    }
    return () => { controller.abort(); };
  }, [batchId]);


  useEffect(() => {
    const controller = new AbortController();
    if (employeeProfile && batch?.current_stage) checkTraining(controller.signal);
    return () => { controller.abort(); };
  }, [employeeProfile, batch?.current_stage]);


  const checkTraining = async (signal) => {
    if (role === 'admin') { setTrainingStatus({ isTrained: true }); return; }
    setCheckingTraining(true);
    try {
      const stageToCategory = { media_prep: 'Production', sterilisation: 'Sanitation', inoculation: 'Fermentation', fermentation: 'Fermentation', harvest: 'Production', downstream: 'QC', qc_hold: 'QC', released: 'QA', rejected: 'QA' };
      const category = stageToCategory[batch.current_stage] || 'Fermentation';
      const res = await fetch(`/api/training/check?employeeId=${employeeProfile.id}&category=${category}`, { signal });
      const data = await res.json(); setTrainingStatus(data);
    } catch {} finally { setCheckingTraining(false); }
  };

  const fetchBatchDetail = async (signal) => {
    try {
      const { data: b, error } = await supabase
        .from('batches')
        .select('*, formulations(name, code, version), ph_readings(*, employees(full_name)), lab_logs(*, employees(full_name)), stage_transitions(*, employees(full_name)), inventory_usage(*, inventory_stock(*, inventory_items(name, unit)))')
        .eq('id', batchId)
        .single();
      if (error) throw error;
      if (b) {
        // Also fetch linked LNB entry count
        const { count: lnbCount } = await supabase
          .from('lab_notebook_entries')
          .select('id', { count: 'exact', head: true })
          .eq('batch_id', batchId);
        b._lnbCount = lnbCount || 0;

        const unifiedLogs = [
          ...Array.isArray(b.ph_readings) ? b.ph_readings.map(l => ({ ...l, type: 'ph', parameter_name: 'pH', parameter_value: l.ph_value })) : [],
          ...Array.isArray(b.lab_logs) ? b.lab_logs : []
        ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setBatch(b); setLogs(unifiedLogs);
        const currentParams = PARAMETERS[b.current_stage || 'media_prep'] || [];
        if (!selectedParam && currentParams.length > 0) setSelectedParam(currentParams[0]);
      }
    } catch (err) { console.error('Batch detail fetch error:', err); }
  };


  const fetchStock = async (signal) => {
    try {
      const { data } = await supabase.from('inventory_stock').select('*, inventory_items(name, unit, category)').gt('current_quantity', 0).eq('status', 'Available');
      if (data) setAvailableStock(data);
    } catch (err) { console.error('Fetch stock error:', err); }
  };


  const handleLogData = async (e) => {
    e.preventDefault(); if (!selectedParam || !paramValue || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const isLegacyPh = selectedParam.type === 'ph' && batch.current_stage === 'fermentation';
      const endpoint = isLegacyPh ? '/api/ph/log' : '/api/lab/log';
      const body = isLegacyPh ? { batch_id: batchId, ph_value: parseFloat(paramValue), notes } : { batch_id: batchId, process_type: batch.current_stage, parameter_name: selectedParam.name, parameter_value: parseFloat(paramValue), notes };
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { setParamValue(''); setNotes(''); await fetchBatchDetail(); } else { alert('Failed to log parameter.'); }
    } finally { setIsSubmitting(false); }
  };

  const handleLinkIngredient = async (e) => {
    e.preventDefault(); if (!ingredientStockId || !ingredientQty || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock_id: ingredientStockId, batch_id: batchId, quantity_used: parseFloat(ingredientQty) }) });
      if (res.ok) { setIngredientStockId(''); setIngredientQty(''); await Promise.all([fetchBatchDetail(), fetchStock()]); } else { alert('Failed to link ingredient'); }
    } finally { setIsSubmitting(false); }
  };

const handleStageTransition = async (toStage) => {
  if (actionLoading) return;

  // Hard LNB gate — cannot release without notebook entries
  if (toStage === 'released' && batch._lnbCount === 0) {
    alert('⛔ Cannot release batch. Lab Notebook is empty. Document your experiment in the LNB before releasing.');
    return;
  }

  // First stage start — single confirm, inventory check
  if (batch.status === 'planned' && toStage === 'media_prep') {
    if (!confirm('Start batch? This will validate inventory.')) return;
    setActionLoading(true);
    try {
      const resCheck = await fetch(`/api/inventory/check?batch_id=${batchId}`);
      const checkData = await resCheck.json();
      if (!checkData.ok) {
        alert('Insufficient inventory. Cannot start batch.');
        setActionLoading(false);
        return;
      }
      await fetch(`/api/batches/${batchId}/start`, { method: 'POST' });
    } catch (err) {
      alert('Error starting batch');
      setActionLoading(false);
      return;
    }
    // fall through to stage transition below
  }

  if (!confirm(`Move batch to ${toStage.toUpperCase().replace('_', ' ')}?`)) {
    setActionLoading(false);
    return;
  }
  setActionLoading(true);

  try {
    const res = await fetch(`/api/batches/${batchId}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_stage: batch.current_stage, to_stage: toStage })
    });
    if (res.ok) await fetchBatchDetail();
  } finally {
    setActionLoading(false);
  }
};

  if (authLoading || !batch) return <div className="p-8 text-center text-gray-400 font-medium">Synchronizing node detail...</div>;

  const currentStageIndex = STAGES.findIndex(s => s.id === (batch.current_stage || 'media_prep'));
  const currentParams = PARAMETERS[batch.current_stage || 'media_prep'] || [];

  return (
    <div className="page-container">
      <Link href="/batches" className="inline-flex items-center text-xs font-semibold text-gray-500 hover:text-navy transition-colors"><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Registry</Link>

      {/* LNB Warning Banner — shown when approaching completion with no LNB entries */}
      {batch._lnbCount === 0 && ['harvest', 'downstream', 'qc_hold'].includes(batch.current_stage) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">Lab Notebook is empty</p>
            <p className="text-xs text-amber-700 mt-0.5">This batch cannot be completed without LNB entries. Document observations before proceeding.</p>
          </div>
          <Link href="/lab-notebook" className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700">Open LNB →</Link>
        </div>
      )}
      <div className="surface p-4 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[700px] px-2">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon; const isCompleted = idx < currentStageIndex; const isCurrent = idx === currentStageIndex;
            return (
              <div key={stage.id} className="flex items-center flex-1 last:flex-none">
                <div className={`flex flex-col items-center flex-1 relative ${isCurrent ? 'scale-105' : ''} transition-all`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${isCompleted ? 'bg-navy border-navy text-white' : isCurrent ? 'bg-navy/5 border-navy text-navy shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider mt-1.5 ${isCurrent ? 'text-gray-900 font-black' : 'text-gray-400'}`}>{stage.label}</span>
                  {isCurrent && idx < STAGES.length - 1 && (() => {
                    const nextStage = STAGES[idx + 1].id;
                    const lnbBlocked = nextStage === 'released' && batch._lnbCount === 0;
                    const trainingBlocked = !trainingStatus.isTrained;
                    const isBlocked = lnbBlocked || trainingBlocked;
                    return (
                      <button 
                        onClick={() => { if (trainingBlocked) { alert('Training Required.'); return; } handleStageTransition(nextStage); }} 
                        disabled={actionLoading}
                        title={lnbBlocked ? 'LNB required before release' : trainingBlocked ? 'Training required' : `Move to ${nextStage}`}
                        className={`absolute -right-10 top-2.5 p-1 text-white rounded-full shadow-sm transition-all active:scale-95 disabled:opacity-50 ${lnbBlocked ? 'bg-red-500 animate-pulse' : trainingBlocked ? 'bg-gray-300' : 'bg-navy hover:bg-navy-hover'}`}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    );
                  })()}
                </div>
                {idx < STAGES.length - 1 && <div className={`h-0.5 flex-1 mx-2 rounded-full ${isCompleted ? 'bg-navy' : 'bg-gray-100'}`}></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="surface p-6 relative">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold font-mono text-gray-900 tracking-wider mb-1">{batch.batch_id}</h1>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-gray-900 text-white text-[9px] font-bold rounded-md uppercase tracking-wider">{batch.variant}</span>
                  <span className="text-xs font-semibold text-gray-500">Volume: {batch.volume_litres || '—'}L</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 text-right">
                <div><p className="text-[10px] font-bold uppercase text-gray-400 mb-0.5">Status</p><p className={`font-black text-base uppercase ${batch.status === 'deviation' ? 'text-red-600' : 'text-navy'}`}>{batch.status}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-400 mb-0.5">Process Age</p><p className="font-black text-base text-gray-800">{((new Date() - new Date(batch.start_time)) / 3600000).toFixed(1)}H</p></div>
              </div>
            </div>
          </div>

          {/* Traceability */}
          <div className="surface overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50"><h2 className="text-sm font-bold text-gray-900 tracking-tight">Material Traceability (Lots Used)</h2><Tag className="w-4 h-4 text-gray-400" /></div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead><tr className="bg-gray-50/50"><th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ingredient</th><th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lot #</th><th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Qty Used</th></tr></thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {batch.inventory_usage?.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/20"><td className="px-6 py-3 text-xs font-semibold text-gray-800">{u.inventory_stock?.inventory_items?.name}</td><td className="px-6 py-3 font-mono text-xs text-navy font-bold">{u.inventory_stock?.supplier_batch_number || 'UN-LOT'}</td><td className="px-6 py-3 font-bold text-xs text-gray-800">{u.quantity_used} {u.inventory_stock?.inventory_items?.unit}</td></tr>
                  ))}
                  {(!batch.inventory_usage || batch.inventory_usage.length === 0) && <tr><td colSpan="3" className="px-6 py-6 text-center text-xs text-gray-400 font-medium">No materials linked yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Log */}
          <div className="surface overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center"><h2 className="text-sm font-bold text-gray-900 tracking-tight">Activity & Metrics Log</h2><Activity className="w-4 h-4 text-gray-400" /></div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead><tr className="bg-gray-50/50"><th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Timestamp</th><th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stage</th><th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Metric</th><th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Operator</th></tr></thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/20"><td className="px-6 py-3 text-xs font-semibold text-gray-800">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-6 py-3"><span className="text-[9px] font-bold uppercase border bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded-md">{log.process_type || 'FERM'}</span></td><td className="px-6 py-3 text-xs font-bold text-gray-900">{log.parameter_value} <span className="text-[9px] text-gray-400 ml-0.5">{log.parameter_name}</span></td><td className="px-6 py-3 text-xs text-gray-500 font-semibold">{log.employees?.full_name || 'System'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Main Log Dialog */}
          <div className="surface overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 tracking-tight capitalize">Log Metrics</h2>
              {!trainingStatus.isTrained && <span className="bg-red-50 text-red-600 border border-red-100 text-[9px] font-black px-1.5 py-0.5 rounded-md animate-pulse">Training Required</span>}
            </div>

            {!trainingStatus.isTrained ? (
              <div className="p-6 bg-gray-50 text-center flex flex-col items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <div><p className="text-xs font-bold text-gray-900">Sign SOP required</p><p className="text-[10px] text-gray-500 mt-0.5">Read category signature in docs manual to unlock access node entry.</p></div>
              </div>
            ) : (
              <form onSubmit={handleLogData} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {currentParams.map(p => (
                    <button key={p.type} type="button" onClick={() => setSelectedParam(p)} className={`py-1.5 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-colors ${selectedParam?.type === p.type ? 'bg-navy border-navy text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{p.name}</button>
                  ))}
                </div>
                <div className="relative">
                  <input type="number" step="0.01" required value={paramValue} onChange={(e) => setParamValue(e.target.value)} className="w-full pl-4 pr-12 py-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-accent outline-none text-2xl font-black font-mono tracking-tighter text-gray-800" placeholder="0.00" disabled={isSubmitting} />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 font-bold text-xs">{selectedParam?.unit || 'VAL'}</div>
                </div>
                <button type="submit" disabled={isSubmitting || !paramValue || !selectedParam} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg shadow-sm text-xs uppercase tracking-wider">Commit Metric</button>
              </form>
            )}
          </div>

          {/* Ingredient Link */}
          <div className="surface overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center"><ShoppingCart className="w-4 h-4 mr-1.5 text-gray-400" /><h3 className="text-sm font-bold text-gray-900 tracking-tight">Add Materials</h3></div>
            <form onSubmit={handleLinkIngredient} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Select Lot</label>
                <select required value={ingredientStockId} onChange={(e) => setIngredientStockId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none bg-white font-semibold text-gray-800 text-sm">
                  <option value="">Select available lot...</option>
                  {availableStock.map(s => <option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number || 'UN-LOT'} | Avail: {s.current_quantity}{s.inventory_items?.unit}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Quantity</label>
                <input type="number" step="0.01" required value={ingredientQty} onChange={(e) => setIngredientQty(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none" placeholder="0.00" />
              </div>
              <button type="submit" disabled={isSubmitting || !ingredientStockId} className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg text-xs uppercase tracking-wider shadow-sm">Link Lot to Batch</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
