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
import LinkedRecordsPanel  from './components/LinkedRecordsPanel';

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
  const [flaskEndpoints, setFlaskEndpoints] = useState([]);
  const [lnbCount,       setLnbCount]       = useState(0);
  const [actionLoading,  setActionLoading]  = useState(false);
  const [bmrLoading,     setBmrLoading]     = useState(false);
  const [bmrUrl,         setBmrUrl]         = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);
  const [pendingCancel,     setPendingCancel]     = useState(false);
  const [pendingFlaskReject,  setPendingFlaskReject]  = useState(false);
  const [pendingFlaskAdvance, setPendingFlaskAdvance] = useState(null);
  const [selectedFlaskId,    setSelectedFlaskId]    = useState(null);
  const [viewingStage,       setViewingStage]       = useState(null);
  const [editingStage,       setEditingStage]       = useState(null);
  const [lnbByFlask,         setLnbByFlask]         = useState({});

  const fetchAll = useCallback(async () => {
    if (!batchId) return;
    const [batchRes, flasksRes, transRes, empRes, stockRes, lnbRes, epRes] = await Promise.all([
      supabase.from('batches').select('*, formulations(id, name, code, version, ingredients)').eq('id', batchId).single(),
      supabase.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_label'),
      supabase.from('stage_transitions').select('*, employees!stage_transitions_changed_by_fkey(full_name)').eq('batch_id', batchId).order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name, role').eq('is_active', true).order('full_name'),
      supabase.from('inventory_stock').select('*, inventory_items(name, unit, category)').gt('current_quantity', 0).eq('status', 'Available'),
      supabase.from('lab_notebook_entries').select('id, flask_id').eq('batch_id', batchId),
      supabase.from('batch_flask_endpoints').select('total_hours, flask_id').eq('batch_id', batchId),
    ]);
    if (batchRes.data)  setBatch(batchRes.data);
    if (flasksRes.data) setFlasks(flasksRes.data);
    if (transRes.data)  setTransitions(transRes.data);
    if (empRes.data)    setEmployees(empRes.data);
    if (stockRes.data)  setAvailableStock(stockRes.data);
    const lnbEntries = lnbRes.data || [];
    setLnbCount(lnbEntries.length);
    const byFlask = {};
    lnbEntries.forEach(e => { if (e.flask_id) byFlask[e.flask_id] = (byFlask[e.flask_id] || 0) + 1; });
    setLnbByFlask(byFlask);
    if (epRes.data) setFlaskEndpoints(epRes.data);
    if (batchRes.data?.bmr_url) setBmrUrl(batchRes.data.bmr_url);
  }, [batchId, supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (flasks.length > 0 && !selectedFlaskId) {
      setSelectedFlaskId(flasks[0].id);
    }
  }, [flasks, selectedFlaskId]);

  const handleFlaskTransition = useCallback((flaskId, toStage) => {
    if (toStage === 'released' && lnbCount === 0) {
      toast.warn('Cannot release — Lab Notebook is empty.');
      return;
    }
    const flask = flasks.find(f => f.id === flaskId);
    setPendingFlaskAdvance({ flaskId, flaskLabel: flask?.flask_label || flaskId, toStage });
  }, [flasks, lnbCount, toast]);

  const confirmFlaskAdvance = useCallback(async () => {
    if (!pendingFlaskAdvance) return;
    const { flaskId, toStage } = pendingFlaskAdvance;
    setPendingFlaskAdvance(null);
    setActionLoading(true);
    try {
      const { error } = await supabase.from('batch_flasks').update({ current_stage: toStage }).eq('id', flaskId);
      if (error) throw error;
      toast.success(`Trial advanced to ${toStage.replace(/_/g, ' ')}.`);
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setActionLoading(false); }
  }, [pendingFlaskAdvance, supabase, toast, fetchAll]);

  const handleStageTransition = useCallback(async (toStage) => {
    if (actionLoading) return;
    if (toStage === 'released' && lnbCount === 0) {
      toast.warn('Cannot release — Lab Notebook is empty.');
      return;
    }
    setPendingTransition(toStage);
  }, [actionLoading, lnbCount, toast]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const FLASK_STAGE_RANK = ['inoculation','fermentation','straining','extract_addition','qc_hold','released','rejected'];
  const derivedStatus = (() => {
    if (isTerminal) return batch.status;
    if (!isPostSterilisation || flasks.length === 0) return batch.status;
    const allRejected = flasks.every(f => f.status === 'rejected');
    if (allRejected) return 'rejected';
    const activeFlasks = flasks.filter(f => f.status !== 'rejected');
    const maxStage = activeFlasks.reduce((best, f) => {
      const r = FLASK_STAGE_RANK.indexOf(f.current_stage);
      return r > FLASK_STAGE_RANK.indexOf(best) ? f.current_stage : best;
    }, 'inoculation');
    if (maxStage === 'fermentation') return 'fermenting';
    if (maxStage === 'qc_hold') return 'qc-hold';
    if (maxStage === 'released') return 'released';
    if (['straining','extract_addition'].includes(maxStage)) return 'processing';
    return batch.status;
  })();

  const selectedFlask = isPostSterilisation && flasks.length > 0 ? flasks.find(f => f.id === selectedFlaskId) || flasks[0] : null;
  const activeStage = isPostSterilisation ? (selectedFlask?.current_stage || 'inoculation') : batch.current_stage;
  const displayStage = viewingStage || activeStage;
  const CurrentPanel = PANEL_MAP[displayStage] || null;

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
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${derivedStatus==='released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : derivedStatus==='rejected' ? 'bg-red-50 text-red-700 border-red-100' : derivedStatus==='fermenting' ? 'bg-navy/10 text-navy border-navy/20' : derivedStatus==='qc-hold' ? 'bg-rose-50 text-rose-700 border-rose-100' : derivedStatus==='processing' ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{derivedStatus}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <div>
                  {(() => {
                    const maxEpHrs = flaskEndpoints.length > 0
                      ? Math.max(...flaskEndpoints.map(e => e.total_hours || 0))
                      : null;
                    const hrs = maxEpHrs !== null
                      ? maxEpHrs
                      : (new Date() - new Date(batch.start_time)) / 3600000;
                    return (
                      <>
                        <p className="text-[9px] text-gray-400 font-bold uppercase">{maxEpHrs !== null ? 'Fermentation' : 'Age'}</p>
                        <p className="text-xl font-black text-gray-800 tabular-nums">{hrs.toFixed(1)}<span className="text-xs text-gray-400"> hr</span></p>
                      </>
                    );
                  })()}
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
              <div>
                <p className="text-[9px] text-gray-400 font-bold uppercase mb-0.5">Recipe</p>
                <Link href="/formulations" className="font-bold text-gray-800 hover:text-navy hover:underline block">
                  {batch.formulations?.name}
                </Link>
                <p className="text-gray-400">v{batch.formulations?.version}</p>
              </div>
              <div><p className="text-[9px] text-gray-400 font-bold uppercase mb-0.5">Volume / Flasks</p><p className="font-bold text-gray-800">{batch.planned_volume_ml}ml × {batch.num_flasks}</p></div>
            </div>
          </div>

          {/* Stage Timeline */}
          <div className="surface p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Stage Timeline</p>
            <div className="space-y-0.5">
              {STAGES.filter(s => !['released','rejected'].includes(s.id)).map((stage, idx) => {
                let done, curr;
                if (isPostSterilisation) {
                  const flaskStageIdx = selectedFlask
                    ? STAGES.findIndex(s => s.id === selectedFlask.current_stage)
                    : 2;
                  const effectiveIdx = flaskStageIdx < 2 ? 2 : flaskStageIdx;
                  done = idx < 2 || idx < effectiveIdx;
                  curr = idx === effectiveIdx;
                } else {
                  done = idx < currentIdx;
                  curr = idx === currentIdx;
                }
                const isViewing = viewingStage === stage.id;
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.id}
                    onClick={done ? () => { setViewingStage(isViewing ? null : stage.id); setEditingStage(null); } : undefined}
                    className={`flex items-center gap-2.5 py-2 px-3 rounded-lg transition-all ${
                      isViewing ? `${stage.bg} border-2 ${stage.border} ring-2 ring-offset-1 ring-navy/30` :
                      curr ? `${stage.bg} border ${stage.border}` :
                      done ? 'hover:bg-gray-50 cursor-pointer' : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${done ? 'bg-navy border-navy' : curr ? `${stage.bg} ${stage.border}` : 'bg-gray-50 border-gray-200'}`}>
                      {done
                        ? <CheckCircle className="w-3 h-3 text-white"/>
                        : <Icon className={`w-2.5 h-2.5 ${curr ? stage.color : 'text-gray-300'}`}/>}
                    </div>
                    <span className={`text-xs font-bold ${isViewing ? 'text-navy' : curr ? 'text-gray-900' : done ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{stage.label}</span>
                    {isViewing && <span className="ml-auto text-[9px] font-black text-blue-600">VIEWING</span>}
                    {curr && !isViewing && <span className="ml-auto text-[9px] font-black text-navy">ACTIVE</span>}
                    {done && !isViewing && <span className="ml-auto text-[9px] text-gray-300 font-bold">↩</span>}
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
                  onClick={() => { setSelectedFlaskId(f.id); setViewingStage(null); }}
                  disabled={!isPostSterilisation}
                  className={`w-full p-2.5 rounded-xl text-left border transition-all flex flex-col items-start ${selectedFlaskId===f.id?'bg-navy/5 border-navy shadow-sm ring-1 ring-navy':f.status==='rejected'?'bg-red-50 border-red-200 opacity-60':'bg-white hover:bg-gray-50 border-gray-200 hover:border-navy/50'}`}>
                  <div className="flex justify-between items-center w-full">
                    <p className={`text-sm font-black ${f.status==='rejected'?'text-red-500 line-through':selectedFlaskId===f.id?'text-navy':'text-gray-700'}`}>{f.flask_label}</p>
                    {selectedFlaskId===f.id && <div className="w-1.5 h-1.5 bg-navy rounded-full animate-pulse"/>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <p className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${f.status==='rejected'?'bg-red-100 text-red-600':selectedFlaskId===f.id?'bg-navy text-white':'bg-gray-200 text-gray-500'}`}>
                      {f.status==='rejected' ? 'REJECTED' : ((STAGES.find(s => s.id === f.current_stage)?.label) || f.current_stage || 'INOCULATION').toUpperCase()}
                    </p>
                    {lnbByFlask[f.id] > 0 && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 flex items-center gap-0.5">
                        <BookOpen className="w-2.5 h-2.5"/>{lnbByFlask[f.id]}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {!isPostSterilisation && <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10"><FlaskConical className="w-6 h-6 text-amber-500 mb-2 opacity-50"/><span className="text-[10px] text-amber-700 font-bold">Complete Sterilisation to unlock individual trial tracking.</span></div>}
          </div>

          {/* Linked Records (compact — Lab Notebook + BMR only) */}
          <div className="surface p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Quick Links</p>
            <div className="space-y-2">
              <Link href="/lab-notebook" className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-gray-400"/><span className="text-xs font-semibold text-gray-700">Lab Notebook</span></div>
                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${lnbCount>0?'bg-navy text-white':'bg-gray-200 text-gray-500'}`}>{lnbCount}</span>
              </Link>

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
              {(() => {
                const asc = [...transitions].sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
                return asc.map((t, i) => {
                  const next = asc[i+1];
                  const ms = next ? new Date(next.created_at)-new Date(t.created_at) : null;
                  const h  = ms ? Math.floor(ms/3600000) : null;
                  const m  = ms ? Math.floor((ms%3600000)/60000) : null;
                  const dur = h !== null ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : null;
                  return (
                    <div key={t.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 bg-navy rounded-full mt-1.5 shrink-0"/>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-gray-700">{t.from_stage?.replace(/_/g,' ')} → {t.to_stage?.replace(/_/g,' ')}</p>
                          {dur && <span className="text-[9px] font-black text-navy bg-navy/5 px-1.5 py-0.5 rounded">{dur}</span>}
                        </div>
                        <p className="text-gray-400 text-[10px]">{t.employees?.full_name} · {t.created_at ? new Date(t.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — Stage Panel ── */}
        <div>
          {/* View / Edit Mode Banner */}
          {viewingStage && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 mb-4 ${editingStage === viewingStage ? 'bg-amber-50 border border-amber-300' : 'bg-blue-50 border border-blue-200'}`}>
              <div className="flex items-center gap-2">
                <BookOpen className={`w-4 h-4 shrink-0 ${editingStage === viewingStage ? 'text-amber-600' : 'text-blue-600'}`}/>
                <div>
                  {editingStage === viewingStage ? (
                    <>
                      <p className="text-xs font-black text-amber-800">Editing Past Stage — Admin Mode</p>
                      <p className="text-[10px] text-amber-600">Editing <span className="font-bold uppercase">{viewingStage.replace(/_/g,' ')}</span> data. Save within the panel to update.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-black text-blue-800">Viewing Past Stage — Read Only</p>
                      <p className="text-[10px] text-blue-600">You are reviewing <span className="font-bold uppercase">{viewingStage.replace(/_/g,' ')}</span> data. No edits can be made.</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {['admin','ceo','cto'].includes(role) && editingStage !== viewingStage && (
                  <button
                    onClick={() => setEditingStage(viewingStage)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black rounded-lg transition-colors"
                  >
                    Edit Stage
                  </button>
                )}
                {editingStage === viewingStage && (
                  <button
                    onClick={() => setEditingStage(null)}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    Stop Editing
                  </button>
                )}
                <button
                  onClick={() => { setViewingStage(null); setEditingStage(null); }}
                  className="px-3 py-1.5 bg-navy text-white text-[10px] font-black rounded-lg hover:bg-navy-hover transition-colors"
                >
                  ← Return to Current Stage
                </button>
              </div>
            </div>
          )}

          {!viewingStage && isPostSterilisation && selectedFlask && !['released','rejected'].includes(selectedFlask.current_stage) && selectedFlask.status !== 'rejected' && (
            <div className="flex justify-end mb-4">
              <button onClick={() => setPendingFlaskReject(true)} className="px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 font-black rounded-lg text-[10px] uppercase tracking-wider transition-all hover:scale-105">Abort / Reject Trial {selectedFlask.flask_label}</button>
            </div>
          )}

          {CurrentPanel ? (
            <div
              key={`${selectedFlaskId ?? 'batch'}-${displayStage}`}
              className={viewingStage && editingStage !== viewingStage ? 'pointer-events-none opacity-90 select-none' : ''}
            >
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
                readOnly={!!viewingStage && editingStage !== viewingStage}
                batchId={batchId}
              />
            </div>
          ) : (
            <div className="surface p-8 text-center text-gray-400 text-sm">Unknown stage: {batch.current_stage}</div>
          )}
        </div>
      </div>

      {/* Linked Records — full-width cross-module panel */}
      <LinkedRecordsPanel batch={batch} supabase={supabase} />

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

      {/* Flask Advance Confirmation Modal */}
      {pendingFlaskAdvance && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-gray-900 mb-1 text-center">Advance Trial Stage</h3>
            <p className="text-sm text-gray-600 mb-1 text-center">
              Advancing <span className="font-black text-navy">{pendingFlaskAdvance.flaskLabel}</span> to{' '}
              <span className="font-black uppercase">{pendingFlaskAdvance.toStage.replace(/_/g,' ')}</span>
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">This cannot be undone without admin intervention.</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingFlaskAdvance(null)} className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition">Cancel</button>
              <button onClick={confirmFlaskAdvance} disabled={actionLoading} className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {actionLoading ? <Loader className="w-4 h-4 animate-spin"/> : `Advance ${pendingFlaskAdvance.flaskLabel}`}
              </button>
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
