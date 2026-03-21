'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, Loader2, Save, ChevronRight, Activity, Beaker, Thermometer, Droplets, ShoppingCart, Tag } from 'lucide-react';
import Link from 'next/link';

const STAGES = [
  { id: 'media_prep', label: 'Media Prep', icon: Beaker, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { id: 'formulation', label: 'Formulation', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'fermentation', label: 'Fermentation', icon: Activity, color: 'text-teal-600', bg: 'bg-teal-50' },
  { id: 'thermal', label: 'Thermal Processing', icon: Thermometer, color: 'text-orange-600', bg: 'bg-orange-50' },
  { id: 'qc', label: 'Quality Control', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' }
];

const PARAMETERS = {
  media_prep: [{ name: 'pH', unit: '', type: 'ph' }, { name: 'Temperature', unit: '°C', type: 'temp' }],
  formulation: [{ name: 'Brix', unit: '°Bx', type: 'brix' }, { name: 'Viscosity', unit: 'cP', type: 'viscosity' }],
  fermentation: [{ name: 'pH', unit: '', type: 'ph' }, { name: 'Temperature', unit: '°C', type: 'temp' }, { name: 'OD600', unit: '', type: 'od' }],
  thermal: [{ name: 'Hold Temp', unit: '°C', type: 'temp' }, { name: 'Hold Time', unit: 'min', type: 'time' }],
  qc: [{ name: 'Final Brix', unit: '°Bx', type: 'brix' }, { name: 'Contamination', unit: '/ml', type: 'cont' }]
};

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const router = useRouter();
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
  const supabase = createClient();

  useEffect(() => {
    if (batchId) {
      fetchBatchDetail();
      fetchStock();
    }
  }, [batchId]);

  useEffect(() => {
    if (employeeProfile && batch?.current_stage) {
      checkTraining();
    }
  }, [employeeProfile, batch?.current_stage]);

  const checkTraining = async () => {
    if (role === 'admin') {
      setTrainingStatus({ isTrained: true });
      return;
    }
    setCheckingTraining(true);
    try {
      const stageToCategory = {
        media_prep: 'Fermentation',
        formulation: 'Fermentation',
        fermentation: 'Fermentation',
        thermal: 'QC',
        qc: 'QC'
      };
      const category = stageToCategory[batch.current_stage] || 'Fermentation';
      const res = await fetch(`/api/training/check?employeeId=${employeeProfile.id}&category=${category}`);
      const data = await res.json();
      setTrainingStatus(data);
    } catch (err) {
      console.error("Training check failed:", err);
    } finally {
      setCheckingTraining(false);
    }
  };

  const fetchBatchDetail = async () => {
    const { data: b, error } = await supabase
      .from('batches')
      .select('*, ph_readings(*, employees(full_name)), lab_logs(*, employees(full_name)), stage_transitions(*, employees(full_name)), inventory_usage(*, inventory_stock(*, inventory_items(name, unit)))')
      .eq('id', batchId)
      .single();

    if (error || !b) {
      router.replace('/batches');
      return;
    }

    const unifiedLogs = [
      ...(b.ph_readings || []).map(l => ({ ...l, type: 'ph', parameter_name: 'pH', parameter_value: l.ph_value })),
      ...(b.lab_logs || [])
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    setBatch(b);
    setLogs(unifiedLogs);
    
    const currentParams = PARAMETERS[b.current_stage || 'media_prep'] || [];
    if (!selectedParam && currentParams.length > 0) {
      setSelectedParam(currentParams[0]);
    }
  };

  const fetchStock = async () => {
    const { data } = await supabase
      .from('inventory_stock')
      .select('*, inventory_items(name, unit, category)')
      .gt('current_quantity', 0)
      .eq('status', 'Available');
    if (data) setAvailableStock(data);
  };

  const handleLogData = async (e) => {
    e.preventDefault();
    if (!selectedParam || !paramValue) return;
    setIsSubmitting(true);
    try {
      const isLegacyPh = selectedParam.type === 'ph' && batch.current_stage === 'fermentation';
      const endpoint = isLegacyPh ? '/api/ph/log' : '/api/lab/log';
      const body = isLegacyPh 
        ? { batch_id: batchId, ph_value: parseFloat(paramValue), notes }
        : { batch_id: batchId, process_type: batch.current_stage, parameter_name: selectedParam.name, parameter_value: parseFloat(paramValue), notes };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setParamValue('');
        setNotes('');
        await fetchBatchDetail();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkIngredient = async (e) => {
    e.preventDefault();
    if (!ingredientStockId || !ingredientQty) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_id: ingredientStockId, batch_id: batchId, quantity_used: parseFloat(ingredientQty) })
      });
      if (res.ok) {
        setIngredientStockId('');
        setIngredientQty('');
        await fetchBatchDetail();
        await fetchStock();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to link ingredient');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStageTransition = async (toStage) => {
    if (!confirm(`Move batch to ${toStage.toUpperCase()}? This will be recorded in the audit trail.`)) return;
    setActionLoading(true);
    const res = await fetch(`/api/batches/${batchId}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_stage: batch.current_stage, to_stage: toStage, notes: `Transitioned during production run.` })
    });
    if (res.ok) {
      await fetchBatchDetail();
      const nextParams = PARAMETERS[toStage] || [];
      if (nextParams.length > 0) setSelectedParam(nextParams[0]);
    }
    setActionLoading(false);
  };

  if (authLoading || !batch) return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-10 h-10 animate-spin text-teal-800" /></div>;

  const currentStageIndex = STAGES.findIndex(s => s.id === (batch.current_stage || 'media_prep'));
  const currentParams = PARAMETERS[batch.current_stage || 'media_prep'] || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <Link href="/batches" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-teal-700 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Production Registry
      </Link>

      <div className="bg-white rounded-[2rem] border border-gray-200 shadow-sm p-4 overflow-x-auto no-scrollbar">
        <div className="flex items-center justify-between min-w-[800px] px-4">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            return (
              <div key={stage.id} className="flex items-center flex-1 last:flex-none">
                <div className={`flex flex-col items-center group relative ${isCurrent ? 'scale-110 z-10' : ''} transition-all`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all ${isCompleted ? 'bg-teal-500 border-teal-500 text-white' : isCurrent ? `${stage.bg} border-teal-600 ${stage.color} shadow-lg shadow-teal-100` : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                    {isCompleted ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest mt-2 ${isCurrent ? 'text-teal-900' : isCompleted ? 'text-teal-600' : 'text-gray-400'}`}>{stage.label}</span>
                  {isCurrent && idx < STAGES.length - 1 && (
                    <button 
                      onClick={() => {
                        if (!trainingStatus.isTrained) {
                          alert(`Training Required: Please sign the latest SOP for this stage before promoting.`);
                          return;
                        }
                        handleStageTransition(STAGES[idx + 1].id);
                      }} 
                      disabled={actionLoading} 
                      className={`absolute -right-16 top-3 p-2 text-white rounded-full shadow-md transition-all active:scale-90 disabled:opacity-50 ${!trainingStatus.isTrained ? 'bg-slate-400 cursor-not-allowed' : 'bg-teal-800 hover:bg-teal-900'}`}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {idx < STAGES.length - 1 && <div className={`h-0.5 flex-1 mx-4 rounded-full ${isCompleted ? 'bg-teal-500' : 'bg-gray-100'}`}></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[2rem] border border-gray-200 shadow-sm p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-teal-50 rounded-full translate-x-1/2 -translate-y-1/2 blur-3xl"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black text-teal-950 font-mono tracking-tighter mb-2">{batch.batch_id}</h1>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-full uppercase tracking-widest">{batch.variant}</span>
                  <span className="text-sm font-bold text-slate-500">Volume: {batch.volume_litres}L</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8 text-right">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Status</p>
                  <p className={`font-black text-xl uppercase ${batch.status === 'deviation' ? 'text-red-600' : 'text-teal-700'}`}>{batch.status}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Process Age</p>
                  <p className="font-black text-xl">{( (new Date() - new Date(batch.start_time)) / 3600000 ).toFixed(1)}h</p>
                </div>
              </div>
            </div>
          </div>

          {/* New Ingredients Used Table */}
          <div className="bg-white rounded-[2rem] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Material Traceability (Lots Used)</h2>
              <Tag className="w-5 h-5 text-teal-600" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingredient</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier Lot #</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty Used</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Logged At</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {batch.inventory_usage?.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4 whitespace-nowrap font-bold text-slate-800">{u.inventory_stock?.inventory_items?.name}</td>
                      <td className="px-8 py-4 whitespace-nowrap font-mono text-sm text-teal-700">{u.inventory_stock?.supplier_batch_number || 'UNKNOWN'}</td>
                      <td className="px-8 py-4 whitespace-nowrap font-black text-slate-800">{u.quantity_used} {u.inventory_stock?.inventory_items?.unit}</td>
                      <td className="px-8 py-4 whitespace-nowrap text-xs text-slate-400 font-bold uppercase">{new Date(u.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {(!batch.inventory_usage || batch.inventory_usage.length === 0) && (
                    <tr><td colSpan="4" className="px-8 py-8 text-center text-slate-400 italic">No materials linked to this batch yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Activity & Metrics Log</h2>
              <Activity className="w-5 h-5 text-teal-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Process / Stage</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Metric</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Operator</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-5 whitespace-nowrap">
                        <p className="text-sm font-bold text-slate-800">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded">{log.process_type || 'FERMENTATION'}</span>
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap font-black text-slate-800">{log.parameter_value} <span className="text-[10px] text-slate-400 ml-1">{log.parameter_name}</span></td>
                      <td className="px-8 py-5 whitespace-nowrap text-sm font-bold text-slate-700">{log.employees?.full_name || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Dynamic Data Logger */}
          <div className="bg-white rounded-[2rem] border border-gray-200 shadow-xl overflow-hidden ring-4 ring-teal-50">
            <div className={`px-8 py-6 bg-teal-800 text-white flex items-center justify-between`}>
              <div className="flex items-center">
                <Beaker className="w-5 h-5 mr-3 text-teal-300" />
                <h2 className="text-lg font-black tracking-tight capitalize">Log {STAGES[currentStageIndex]?.label}</h2>
              </div>
              {!trainingStatus.isTrained && <span className="bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-lg animate-pulse uppercase tracking-widest">Training Required</span>}
            </div>
            
            {!trainingStatus.isTrained ? (
              <div className="p-8 bg-slate-50 flex flex-col items-center text-center gap-4">
                <AlertTriangle className="w-10 h-10 text-amber-500" />
                <div>
                  <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Access Restricted</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    You must read and sign the <b>{trainingStatus.version ? `v${trainingStatus.version}` : 'latest'}</b> SOP for this category before logging data.
                  </p>
                </div>
                <Link href="/sops" className="text-[10px] font-black uppercase text-teal-700 hover:text-teal-800 border-b-2 border-teal-700 pb-0.5">Go to SOP Library</Link>
              </div>
            ) : (
              <form onSubmit={handleLogData} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-2">
                {currentParams.map(p => (
                  <button key={p.type} type="button" onClick={() => setSelectedParam(p)} className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedParam?.type === p.type ? 'bg-teal-500 border-teal-500 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-white'}`}>{p.name}</button>
                ))}
              </div>
              <div className="relative">
                <input type="number" step="0.01" required value={paramValue} onChange={(e) => setParamValue(e.target.value)} className="w-full pl-6 pr-16 py-4 rounded-2xl bg-slate-50 border-none focus:ring-4 focus:ring-teal-100 text-3xl font-black font-mono tracking-tighter text-slate-800 shadow-inner" placeholder="0.00" disabled={isSubmitting} />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black tracking-tighter">{selectedParam?.unit || 'VAL'}</div>
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-none focus:ring-4 focus:ring-teal-100 text-sm font-medium text-slate-600 shadow-inner" rows="2" placeholder="Observation notes..." disabled={isSubmitting} />
              <button type="submit" disabled={isSubmitting || !paramValue || !selectedParam} className="w-full py-4 bg-teal-800 text-white font-black rounded-2xl shadow-lg hover:bg-teal-900 transition-all uppercase tracking-widest text-[10px]">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Commit Metric'}
              </button>
              </form>
            )}
          </div>

          {/* Ingredient Linker */}
          <div className="bg-white rounded-[2rem] border border-gray-200 shadow-lg overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 bg-slate-50 flex items-center">
              <ShoppingCart className="w-4 h-4 mr-2 text-slate-600" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Add Materials</h3>
            </div>
            <form onSubmit={handleLinkIngredient} className="p-8 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Select Lot (In-Stock)</label>
                <select required value={ingredientStockId} onChange={(e) => setIngredientStockId(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-4 focus:ring-teal-100 text-xs font-bold transition-all">
                  <option value="">Select available lot...</option>
                  {availableStock.map(s => (
                    <option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number || 'UN-LOT'} | Avail: {s.current_quantity}{s.inventory_items?.unit}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Quantity Used</label>
                <input type="number" step="0.01" required value={ingredientQty} onChange={(e) => setIngredientQty(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none ring-1 ring-gray-100 focus:ring-4 focus:ring-teal-100 text-sm font-bold shadow-inner" placeholder="0.00" />
              </div>
              <button type="submit" disabled={isSubmitting || !ingredientStockId} className="w-full py-3 bg-slate-800 text-white font-black rounded-xl uppercase tracking-widest text-[10px] hover:bg-slate-900 transition-all">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link Lot to Batch'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
