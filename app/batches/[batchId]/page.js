'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, AlertTriangle, Clock, Beaker, Droplets,
  Activity, Filter, ShieldCheck, FlaskConical, XCircle, Leaf, BookOpen,
  FileText, Download, Loader, Trash2
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import MediaPrepPanel      from './components/MediaPrepPanel';
import SterilisationPanel  from './components/SterilisationPanel';
import InoculationPanel    from './components/InoculationPanel';
import FermentationPanel   from './components/FermentationPanel';
import StrainingPanel      from './components/StrainingPanel';
import ExtractAdditionPanel from './components/ExtractAdditionPanel';
import QCHoldPanel         from './components/QCHoldPanel';
import ReleasePanel        from './components/ReleasePanel';
import RejectionPanel      from './components/RejectionPanel';

const STAGES = [
  { id: 'media_prep',       label: 'Media Prep',       icon: Beaker,      color: 'text-indigo-600', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  { id: 'sterilisation',    label: 'Sterilisation',    icon: ShieldCheck, color: 'text-slate-600',  bg: 'bg-slate-50',   border: 'border-slate-200'  },
  { id: 'inoculation',      label: 'Inoculation',      icon: Droplets,    color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  { id: 'fermentation',     label: 'Fermentation',     icon: Activity,    color: 'text-navy',       bg: 'bg-navy/10',    border: 'border-navy/30'    },
  { id: 'straining',        label: 'Straining',        icon: Filter,      color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200'  },
  { id: 'extract_addition', label: 'Extract Addition', icon: Leaf,        color: 'text-fuchsia-600',bg: 'bg-fuchsia-50', border: 'border-fuchsia-200'},
  { id: 'qc_hold',          label: 'QC Hold',          icon: Clock,       color: 'text-rose-600',   bg: 'bg-rose-50',    border: 'border-rose-200'   },
  { id: 'released',         label: 'Released',         icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200'},
  { id: 'rejected',         label: 'Rejected',         icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
];

const PANEL_MAP = {
  media_prep: MediaPrepPanel, sterilisation: SterilisationPanel,
  inoculation: InoculationPanel, fermentation: FermentationPanel,
  straining: StrainingPanel, extract_addition: ExtractAdditionPanel,
  qc_hold: QCHoldPanel, released: ReleasePanel, rejected: RejectionPanel,
};

export default function BatchDetailPage() {
  const { batchId }  = useParams();
  const { role, employeeProfile, canDo, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast        = useToast();
  const supabase     = useMemo(() => createClient(), []);

  const [batch,          setBatch]          = useState(null);
  const [flasks,         setFlasks]         = useState([]);
  const [transitions,    setTransitions]    = useState([]);
  const [employees,      setEmployees]      = useState([]);
  const [availableStock, setAvailableStock] = useState([]);
  const [lnbCount,       setLnbCount]       = useState(0);
  const [actionLoading,  setActionLoading]  = useState(false);
  const [bmrLoading,     setBmrLoading]     = useState(false);
  const [bmrUrl,         setBmrUrl]         = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);
  const [pendingCancel,     setPendingCancel]     = useState(false);
  const [pendingFlaskReject, setPendingFlaskReject] = useState(false);
  const [selectedFlaskId,   setSelectedFlaskId]   = useState(null);

  const fetchAll = useCallback(async () => {
    if (!batchId) return;
    const [batchRes, flasksRes, transRes, empRes, stockRes, lnbRes] = await Promise.all([
      supabase.from('batches').select('*, formulations(name, code, version, ingredients)').eq('id', batchId).single(),
      supabase.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label'),
      supabase.from('stage_transitions').select('*, employees!stage_transitions_changed_by_fkey(full_name)').eq('batch_id', batchId).order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name, role').eq('is_active', true).order('full_name'),
      supabase.from('inventory_stock').select('*, inventory_items(name, unit, category)').gt('current_quantity', 0).eq('status', 'Available'),
      supabase.from('lab_notebook_entries').select('id', { count: 'exact', head: true }).eq('batch_id', batchId),
    ]);
    if (batchRes.data)  setBatch(batchRes.data);
    if (flasksRes.data) setFlasks(flasksRes.data);
    if (transRes.data)  setTransitions(transRes.data);
    if (empRes.data)    setEmployees(empRes.data);
    if (stockRes.data)  setAvailableStock(stockRes.data);
    setLnbCount(lnbRes.count || 0);
    // Restore existing BMR URL if already generated
    if (batchRes.data?.bmr_url) setBmrUrl(batchRes.data.bmr_url);
  }, [batchId, supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (flasks.length > 0 && !selectedFlaskId) {
      setSelectedFlaskId(flasks[0].id);
    }
  }, [flasks, selectedFlaskId]);

  const handleFlaskTransition = useCallback(async (flaskId, toStage) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from('batch_flasks').update({ current_stage: toStage }).eq('id', flaskId);
      if (error) throw error;
      toast.success(`Trial advanced to ${toStage.replace(/_/g, ' ')}.`);
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setActionLoading(false); }
  }, [supabase, toast, fetchAll]);

  const handleStageTransition = useCallback(async (toStage) => {
    if (actionLoading) return;
    if (toStage === 'released' && lnbCount === 0) {
      toast.warn('Cannot release — Lab Notebook is empty.');
      return;
    }
    setPendingTransition(toStage);
  }, [actionLoading, lnbCount, toast]);

  // Direct transition — skips confirmation modal.
  // Used by panels that have their own save+advance button (e.g. InoculationPanel).
  const handleDirectTransition = useCallback(async (toStage) => {
    if (actionLoading) return;
    if (toStage === 'released' && lnbCount === 0) {
      toast.warn('Cannot release — Lab Notebook is empty.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/stage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_stage: batch?.current_stage, to_stage: toStage }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Stage transition failed.'); return; }
      toast.success(`Advanced to ${toStage.replace(/_/g, ' ')}.`);
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally       { setActionLoading(false); }
  }, [actionLoading, lnbCount, batchId, batch, toast, fetchAll]);

  const confirmStageTransition = async () => {
    if (!pendingTransition || actionLoading) return;
    const toStage = pendingTransition;
    setPendingTransition(null);
    setActionLoading(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/stage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_stage: batch.current_stage, to_stage: toStage }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Stage transition failed.'); return; }
      toast.success(`Advanced to ${toStage.replace(/_/g, ' ')}.`);
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally       { setActionLoading(false); }
  };

  const handleExportBMR = useCallback(async () => {
    if (bmrLoading) return;
    setBmrLoading(true);
    try {
      const res  = await fetch(`/api/batches/${batchId}/bmr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBmrUrl(data.signed_url);
      toast.success('BMR generated and saved to Document Vault.');
      if (data.signed_url) window.open(data.signed_url, '_blank');
    } catch (err) { toast.error('BMR generation failed: ' + err.message); }
    finally      { setBmrLoading(false); }
  }, [batchId, bmrLoading]);


  const handleCancelBatch = useCallback(async () => {
    setPendingCancel(true);
  }, []);

  const confirmCancelBatch = async () => {
    setPendingCancel(false);
    try {
      const res  = await fetch(`/api/batches?id=${batchId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Batch cancelled. Materials restored.');
      router.push('/batches');
    } catch (err) {
      toast.error('Failed to cancel batch: ' + err.message);
    }
  };

  if (authLoading || !batch) return <div className="p-8 text-center text-gray-400 animate-pulse">Loading batch...</div>;

  const currentIdx  = STAGES.findIndex(s => s.id === batch.current_stage);
  const isTerminal  = ['released', 'rejected'].includes(batch.status);
  const isPostSterilisation = currentIdx > 1 || batch.current_stage === 'inoculation' || batch.status === 'fermenting';
  
  const selectedFlask = isPostSterilisation && flasks.length > 0 ? flasks.find(f => f.id === selectedFlaskId) || flasks[0] : null;
  const activeStage = isPostSterilisation ? (selectedFlask?.current_stage || 'inoculation') : batch.current_stage;
  const CurrentPanel = PANEL_MAP[activeStage] || null;

  return (
    <div className="page-container">
      <Link href="/batches" className="inline-flex items-center text-xs font-semibold text-gray-500 hover:text-navy mb-4">
        <ArrowLeft className="w-3.5 h-3.5 mr-1"/> Back to Registry
      </Link>

      {lnbCount === 0 && ['qc_hold','straining','extract_addition'].includes(batch.current_stage) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0"/>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">Lab Notebook is empty</p>
            <p className="text-xs text-amber-600">Cannot release without LNB entries.</p>
          </div>
          <Link href="/lab-notebook" className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg">Open LNB →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-4">

          {/* Batch Header */}
          <div className="surface p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-mono text-lg font-black text-gray-900 tracking-wider">{batch.batch_id}</p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {batch.sku_target && batch.sku_target !== 'Unassigned' && (
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${batch.sku_target==='CLARITY' ? 'bg-blue-50 text-blue-700 border-blue-200' : batch.sku_target==='MOMENTUM' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{batch.sku_target}</span>
                  )}
                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-gray-100 text-gray-600 border border-gray-200 uppercase">{batch.experiment_type}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${isTerminal && batch.status==='released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : isTerminal ? 'bg-red-50 text-red-700 border-red-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{batch.status}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Age</p>
                  <p className="text-xl font-black text-gray-800 tabular-nums">{((new Date()-new Date(batch.start_time))/3600000).toFixed(1)}<span className="text-xs text-gray-400"> hr</span></p>
                </div>
                {!isTerminal && ['admin','ceo','cto'].includes(role) && (
                  <button
                    onClick={handleCancelBatch}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-red-600 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                    title="Cancel this batch and restore inventory"
                  >
                    <Trash2 className="w-3 h-3"/> Cancel Batch
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100 text-xs">
              <div><p className="text-[9px] text-gray-400 font-bold uppercase mb-0.5">Recipe</p><p className="font-bold text-gray-800">{batch.formulations?.name}</p><p className="text-gray-400">v{batch.formulations?.version}</p></div>
              <div><p className="text-[9px] text-gray-400 font-bold uppercase mb-0.5">Volume / Flasks</p><p className="font-bold text-gray-800">{batch.planned_volume_ml}ml × {batch.num_flasks}</p></div>
            </div>
          </div>

          {/* Stage Timeline */}
          <div className="surface p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Stage Timeline</p>
            <div className="space-y-0.5">
              {STAGES.filter(s => !['released','rejected'].includes(s.id)).map((stage, idx) => {
                const done = idx < currentIdx;  const curr = idx === currentIdx;
                const Icon = stage.icon;
                return (
                  <div key={stage.id} className={`flex items-center gap-2.5 py-2 px-3 rounded-lg ${curr ? `${stage.bg} border ${stage.border}` : ''}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${done && !isPostSterilisation ? 'bg-navy border-navy' : curr && !isPostSterilisation ? `${stage.bg} ${stage.border}` : 'bg-gray-50 border-gray-200'}`}>
                      {done && !isPostSterilisation ? <CheckCircle className="w-3 h-3 text-white"/> : <Icon className={`w-2.5 h-2.5 ${(curr && !isPostSterilisation) || isPostSterilisation ? stage.color : 'text-gray-300'}`}/>}
                    </div>
                    <span className={`text-xs font-bold ${curr && !isPostSterilisation ? 'text-gray-900' : done && !isPostSterilisation ? 'text-gray-400 line-through' : 'text-gray-300'}`}>{stage.label}</span>
                    {curr && !isPostSterilisation && <span className="ml-auto text-[9px] font-black text-navy">ACTIVE</span>}
                    {isPostSterilisation && stage.id !== 'media_prep' && stage.id !== 'sterilisation' && (
                      <span className="ml-auto text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded">Trial Mode</span>
                    )}
                  </div>
                );
              })}
              {isTerminal && (
                <div className={`flex items-center gap-2.5 py-2 px-3 rounded-lg mt-1 ${batch.status==='released'?'bg-emerald-50 border border-emerald-200':'bg-red-50 border border-red-200'}`}>
                  {batch.status==='released'?<CheckCircle className="w-4 h-4 text-emerald-600"/>:<XCircle className="w-4 h-4 text-red-600"/>}
                  <span className={`text-xs font-black uppercase ${batch.status==='released'?'text-emerald-700':'text-red-700'}`}>{batch.status}</span>
                </div>
              )}
            </div>
          </div>

          {/* Flask Cards */}
          <div className="surface p-4 border-2 border-navy/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-navy/5 rounded-bl-[100px] -z-10"/>
            <p className="text-[10px] font-black text-navy uppercase tracking-widest mb-3 flex items-center gap-1"><FlaskConical className="w-3 h-3"/>Trials Tracking</p>
            <div className="space-y-2">
              {flasks.map(f => (
                <button 
                  key={f.id} 
                  onClick={() => setSelectedFlaskId(f.id)}
                  disabled={!isPostSterilisation}
                  className={`w-full p-2.5 rounded-xl text-left border transition-all flex flex-col items-start ${selectedFlaskId===f.id?'bg-navy/5 border-navy shadow-sm ring-1 ring-navy':f.status==='rejected'?'bg-red-50 border-red-200 opacity-60':'bg-white hover:bg-gray-50 border-gray-200 hover:border-navy/50'}`}>
                  <div className="flex justify-between items-center w-full">
                    <p className={`text-sm font-black ${f.status==='rejected'?'text-red-500 line-through':selectedFlaskId===f.id?'text-navy':'text-gray-700'}`}>{f.flask_label}</p>
                    {selectedFlaskId===f.id && <div className="w-1.5 h-1.5 bg-navy rounded-full animate-pulse"/>}
                  </div>
                  <p className={`text-[9px] font-bold uppercase mt-1 px-1.5 py-0.5 rounded flex items-center gap-1 ${f.status==='rejected'?'bg-red-100 text-red-600':selectedFlaskId===f.id?'bg-navy text-white':'bg-gray-200 text-gray-500'}`}>
                    {f.status==='rejected' ? 'REJECTED' : (STAGE_LABELS[f.current_stage] || f.current_stage || 'INOCULATION')}
                  </p>
                </button>
              ))}
            </div>
            {!isPostSterilisation && <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10"><FlaskConical className="w-6 h-6 text-amber-500 mb-2 opacity-50"/><span className="text-[10px] text-amber-700 font-bold">Complete Sterilisation to unlock individual trial tracking.</span></div>}
          </div>

          {/* Linked Records */}
          <div className="surface p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Linked Records</p>
            <div className="space-y-2">
              <Link href="/lab-notebook" className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-gray-400"/><span className="text-xs font-semibold text-gray-700">Lab Notebook</span></div>
                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${lnbCount>0?'bg-navy text-white':'bg-gray-200 text-gray-500'}`}>{lnbCount}</span>
              </Link>

              {/* BMR Export — shown once batch is in QC hold or terminal */}
              {['qc_hold','released','rejected'].includes(batch?.current_stage) && (
                <div className="space-y-2">
                  <button
                    onClick={handleExportBMR}
                    disabled={bmrLoading}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-navy/5 hover:bg-navy/10 border border-navy/15 transition-colors disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      {bmrLoading ? <Loader className="w-3.5 h-3.5 text-navy animate-spin"/> : <FileText className="w-3.5 h-3.5 text-navy"/>}
                      <span className="text-xs font-black text-navy">{bmrLoading ? 'Generating…' : bmrUrl ? 'Regenerate BMR' : 'Export BMR PDF'}</span>
                    </div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase">GMP</span>
                  </button>
                  {bmrUrl && (
                    <a href={`/api/batches/${batchId}/bmr?download=true`} target="_blank"
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                      <div className="flex items-center gap-2"><Download className="w-3.5 h-3.5 text-emerald-600"/><span className="text-xs font-black text-emerald-700">Download BMR</span></div>
                      <span className="text-[9px] font-bold text-emerald-500 uppercase">PDF</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stage History */}
          <div className="surface p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Stage History</p>
            <div className="space-y-2.5">
              {transitions.length===0 && <p className="text-xs text-gray-400 text-center py-2">No transitions yet.</p>}
              {transitions.map(t => (
                <div key={t.id} className="flex items-start gap-2 text-xs">
                  <div className="w-1.5 h-1.5 bg-navy rounded-full mt-1.5 shrink-0"/>
                  <div>
                    <p className="font-bold text-gray-700">{t.from_stage?.replace(/_/g,' ')} → {t.to_stage?.replace(/_/g,' ')}</p>
                    <p className="text-gray-400 text-[10px]">{t.employees?.full_name} · {t.created_at ? new Date(t.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — Stage Panel ── */}
        <div>
          {isPostSterilisation && selectedFlask && !['released','rejected'].includes(selectedFlask.current_stage) && selectedFlask.status !== 'rejected' && (
            <div className="flex justify-end mb-4">
              <button onClick={() => setPendingFlaskReject(true)} className="px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 font-black rounded-lg text-[10px] uppercase tracking-wider transition-all hover:scale-105">Abort / Reject Trial {selectedFlask.flask_label}</button>
            </div>
          )}
          {CurrentPanel ? (
            <CurrentPanel
              batch={batch} flasks={flasks} 
              activeFlask={selectedFlask}
              employees={employees}
              availableStock={availableStock} role={role} canDo={canDo}
              employeeProfile={employeeProfile} supabase={supabase}
              onDataSaved={fetchAll}
              onAdvanceStage={handleDirectTransition}
              onAdvanceFlaskStage={selectedFlask ? (toStage) => handleFlaskTransition(selectedFlask.id, toStage) : null}
              actionLoading={actionLoading}
            />
          ) : (
            <div className="surface p-8 text-center text-gray-400 text-sm">Unknown stage: {batch.current_stage}</div>
          )}
        </div>
      </div>

      {/* Transition Modal */}
      {pendingTransition && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Advance Stage</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Are you sure you want to advance this batch to <strong className="uppercase">{pendingTransition.replace(/_/g, ' ')}</strong>?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingTransition(null)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmStageTransition}
                className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-hover transition w-full inline-flex items-center justify-center gap-2"
                disabled={actionLoading}
              >
                {actionLoading ? <Loader className="w-4 h-4 animate-spin"/> : 'Advance Stage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {pendingCancel && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-red-600 mb-2 text-center">Cancel Entire Batch</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Are you sure you want to cancel this ENTIRE batch and delete all its records? Inventory items used will be placed back into circulation.</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingCancel(false)} className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold">Nevermind</button>
              <button onClick={confirmCancelBatch} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm">Yes, Cancel Batch</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Trial Modal */}
      {pendingFlaskReject && selectedFlask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-red-600 mb-2 text-center">Abort & Reject Trial</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Are you sure you want to forcibly reject <strong>{selectedFlask.flask_label}</strong> at its current stage? This cannot be undone.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingFlaskReject(false)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Nevermind
              </button>
              <button 
                onClick={() => { setPendingFlaskReject(false); handleFlaskTransition(selectedFlask.id, 'rejected'); }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm"
              >
                Yes, Reject Trial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
