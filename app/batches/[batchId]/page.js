'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, Loader2, Save, ChevronRight, Activity, Beaker, Thermometer, Droplets } from 'lucide-react';
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
  const [paramValue, setParamValue] = useState('');
  const [selectedParam, setSelectedParam] = useState(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (batchId) fetchBatchDetail();
  }, [batchId]);

  const fetchBatchDetail = async () => {
    const { data: b, error } = await supabase
      .from('batches')
      .select('*, ph_readings(*, employees(full_name)), lab_logs(*, employees(full_name)), stage_transitions(*, employees(full_name))')
      .eq('id', batchId)
      .single();

    if (error || !b) {
      router.replace('/batches');
      return;
    }

    // Unify logs into a single timeline
    const unifiedLogs = [
      ...(b.ph_readings || []).map(l => ({ ...l, type: 'ph', parameter_name: 'pH', parameter_value: l.ph_value })),
      ...(b.lab_logs || [])
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    setBatch(b);
    setLogs(unifiedLogs);
    
    // Set default parameter based on stage
    const currentParams = PARAMETERS[b.current_stage || 'media_prep'] || [];
    if (!selectedParam && currentParams.length > 0) {
      setSelectedParam(currentParams[0]);
    }
  };

  const handleLogData = async (e) => {
    e.preventDefault();
    if (!selectedParam || !paramValue) return;
    setIsSubmitting(true);
    
    try {
      // If it's pH in fermentation, use old API for backward compatibility/logic
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
      } else {
        alert('Failed to log data. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStageTransition = async (toStage) => {
    if (!confirm(`Move batch to ${toStage.toUpperCase()}? This will be recorded in the audit trail.`)) return;
    setActionLoading(true);
    
    try {
      const res = await fetch(`/api/batches/${batchId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          from_stage: batch.current_stage, 
          to_stage: toStage,
          notes: `Transitioned during production run.`
        })
      });
      
      if (res.ok) {
        await fetchBatchDetail();
        // Reset selected param for new stage
        const nextParams = PARAMETERS[toStage] || [];
        if (nextParams.length > 0) setSelectedParam(nextParams[0]);
      } else {
        alert('Failed to transition stage.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || !batch) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-teal-800" />
      </div>
    );
  }

  const currentStageIndex = STAGES.findIndex(s => s.id === (batch.current_stage || 'media_prep'));
  const currentParams = PARAMETERS[batch.current_stage || 'media_prep'] || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <Link href="/batches" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-teal-700 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Production Registry
      </Link>

      {/* Stage Controller */}
      <div className="bg-white rounded-[2rem] border border-gray-200 shadow-sm p-4 overflow-x-auto no-scrollbar">
        <div className="flex items-center justify-between min-w-[800px] px-4">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            
            return (
              <div key={stage.id} className="flex items-center flex-1 last:flex-none">
                <div className={`flex flex-col items-center group relative ${isCurrent ? 'scale-110 z-10' : ''} transition-all`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all 
                    ${isCompleted ? 'bg-teal-500 border-teal-500 text-white' : 
                      isCurrent ? `${stage.bg} border-teal-600 ${stage.color} shadow-lg shadow-teal-100` : 
                      'bg-gray-50 border-gray-200 text-gray-400'}`}>
                    {isCompleted ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest mt-2 
                    ${isCurrent ? 'text-teal-900' : isCompleted ? 'text-teal-600' : 'text-gray-400'}`}>
                    {stage.label}
                  </span>
                  
                  {isCurrent && idx < STAGES.length - 1 && (
                    <button 
                      onClick={() => handleStageTransition(STAGES[idx + 1].id)}
                      disabled={actionLoading}
                      className="absolute -right-16 top-3 p-2 bg-teal-800 text-white rounded-full shadow-md hover:bg-teal-900 transition-all active:scale-90 disabled:opacity-50"
                      title="Promote to next stage"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {idx < STAGES.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-4 rounded-full ${isCompleted ? 'bg-teal-500' : 'bg-gray-100'}`}></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Main Info Card */}
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
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Current State</p>
                  <p className={`font-black text-xl uppercase ${batch.status === 'deviation' ? 'text-red-600' : 'text-teal-700'}`}>{batch.status}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Process Age</p>
                  <p className="font-black text-xl">{( (new Date() - new Date(batch.start_time)) / 3600000 ).toFixed(1)}h</p>
                </div>
              </div>
            </div>
          </div>

          {/* Unified Timeline Table */}
          <div className="bg-white rounded-[2rem] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Activity & Metrics Log</h2>
              <div className="flex gap-2">
                <span className="flex items-center text-[10px] font-bold text-slate-400 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                  <Activity className="w-3 h-3 mr-1.5 text-teal-500" /> Total Logs: {logs.length}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Process / Stage</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Metric Detected</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Operator Signature</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {logs.slice(0, 15).map((log, i) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-5 whitespace-nowrap">
                        <p className="text-sm font-bold text-slate-800">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-[10px] font-bold text-slate-400">{new Date(log.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {log.process_type || 'FERMENTATION'}
                        </span>
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap">
                        <div className="flex items-center">
                          <p className="text-lg font-black text-slate-800 mr-2">{log.parameter_value}</p>
                          <p className="text-xs font-bold text-slate-400 uppercase">{log.parameter_name}</p>
                        </div>
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap">
                        <p className="text-sm font-bold text-slate-700">{log.employees?.full_name || 'System'}</p>
                        {log.notes && <p className="text-[10px] font-medium text-slate-400 italic">&quot;{log.notes}&quot;</p>}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-8 py-12 text-center">
                        <p className="text-slate-400 font-bold italic">No metrics recorded for this batch yet.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="space-y-6">
          {/* Universal Data Entry */}
          {(!batch.status || batch.status === 'fermenting' || batch.status === 'deviation') && (
            <div className="bg-white rounded-[2rem] border border-gray-200 shadow-xl overflow-hidden ring-4 ring-teal-50">
              <div className="px-8 py-6 bg-teal-800 text-white">
                <h2 className="text-lg font-black tracking-tight flex items-center capitalize">
                  <Beaker className="w-5 h-5 mr-3 text-teal-300" /> Log {STAGES[currentStageIndex]?.label}
                </h2>
              </div>
              <form onSubmit={handleLogData} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Select Parameter</label>
                  <div className="grid grid-cols-2 gap-2">
                    {currentParams.map(p => (
                      <button 
                        key={p.type} 
                        type="button"
                        onClick={() => setSelectedParam(p)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all 
                          ${selectedParam?.type === p.type ? 'bg-teal-500 border-teal-500 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-white hover:border-teal-200'}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Detected Value {selectedParam?.unit && `(${selectedParam.unit})`}</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={paramValue}
                      onChange={(e) => setParamValue(e.target.value)}
                      className="w-full pl-6 pr-16 py-4 rounded-2xl bg-slate-50 border-none focus:ring-4 focus:ring-teal-100 text-3xl font-black font-mono tracking-tighter text-slate-800 transition-all shadow-inner"
                      placeholder="0.00"
                      disabled={isSubmitting}
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black tracking-tighter pointer-events-none">
                      {selectedParam?.unit || 'VAL'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Observation / Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-none focus:ring-4 focus:ring-teal-100 text-sm font-medium text-slate-600 shadow-inner"
                    rows="3"
                    placeholder="Enter process observations..."
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !paramValue || !selectedParam}
                  className="w-full py-4 bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white font-black rounded-2xl shadow-lg shadow-teal-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center uppercase tracking-widest text-xs"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Commit to Registry</>}
                </button>
              </form>
            </div>
          )}

          {/* Compliance & Deviations Summary */}
          {batch.status === 'deviation' && (
            <div className="bg-red-50 border border-red-100 rounded-[2rem] p-8 space-y-4">
              <div className="flex items-center text-red-700">
                <AlertTriangle className="w-6 h-6 mr-3 animate-bounce" />
                <h3 className="text-lg font-black tracking-tight">Active Deviation</h3>
              </div>
              <p className="text-sm text-red-600 font-medium leading-relaxed">
                Critical parameter violation detected in <span className="font-black">Fermentation</span> stage. 
                Full NCR process initiated. Monitor log for corrective instructions.
              </p>
              <Link href="/capa" className="block w-full text-center py-3 bg-red-600 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-red-700 transition-all">
                View Investigation
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
