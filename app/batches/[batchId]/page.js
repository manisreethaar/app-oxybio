'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, CheckCircle, AlertTriangle, Clock, Beaker, Droplets,
  Activity, Filter, ShieldCheck, FlaskConical, XCircle, Leaf, BookOpen,
  FileText, Download, Loader, Trash2, ArrowRight, MessageSquare,
  Package, Layers
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const PanelLoading = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="h-4 w-40 rounded bg-slate-200 animate-pulse mb-4" />
    <div className="space-y-3">
      <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
      <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
      <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
    </div>
  </div>
);

const MediaPrepPanel = dynamic(() => import('./components/MediaPrepPanel'), { ssr: false, loading: PanelLoading });
const SterilisationPanel = dynamic(() => import('./components/SterilisationPanel'), { ssr: false, loading: PanelLoading });
const InoculationPanel = dynamic(() => import('./components/InoculationPanel'), { ssr: false, loading: PanelLoading });
const FermentationPanel = dynamic(() => import('./components/FermentationPanel'), { ssr: false, loading: PanelLoading });
const StrainingPanel = dynamic(() => import('./components/StrainingPanel'), { ssr: false, loading: PanelLoading });
const HarvestPanel = dynamic(() => import('./components/HarvestPanel'), { ssr: false, loading: PanelLoading });
const DownstreamPanel = dynamic(() => import('./components/DownstreamPanel'), { ssr: false, loading: PanelLoading });
const ExtractAdditionPanel = dynamic(() => import('./components/ExtractAdditionPanel'), { ssr: false, loading: PanelLoading });
const QCHoldPanel = dynamic(() => import('./components/QCHoldPanel'), { ssr: false, loading: PanelLoading });
const ReleasePanel = dynamic(() => import('./components/ReleasePanel'), { ssr: false, loading: PanelLoading });
const RejectionPanel = dynamic(() => import('./components/RejectionPanel'), { ssr: false, loading: PanelLoading });
const LinkedRecordsPanel = dynamic(() => import('./components/LinkedRecordsPanel'), { ssr: false });

const STAGES = [
  { id: 'media_prep',       label: 'Media Prep',       icon: Beaker,      color: 'text-slate-600', bg: 'bg-slate-50',  border: 'border-slate-200' },
  { id: 'sterilisation',    label: 'Sterilisation',    icon: ShieldCheck, color: 'text-slate-600',  bg: 'bg-slate-50',   border: 'border-slate-200'  },
  { id: 'inoculation',      label: 'Inoculation',      icon: Droplets,    color: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200'   },
  { id: 'fermentation',     label: 'Fermentation',     icon: Activity,    color: 'text-navy',       bg: 'bg-navy/10',    border: 'border-navy/30'    },
  { id: 'harvest',          label: 'Harvest',          icon: Package,     color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200', supplementary: true },
  { id: 'straining',        label: 'Straining',        icon: Filter,      color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200'  },
  { id: 'extract_addition', label: 'Extract Addition', icon: Leaf,        color: 'text-slate-600',bg: 'bg-slate-50', border: 'border-slate-200'},
  { id: 'downstream',       label: 'Downstream',       icon: Layers,      color: 'text-slate-600', bg: 'bg-slate-50',  border: 'border-slate-200', supplementary: true },
  { id: 'qc_hold',          label: 'QC Hold',          icon: Clock,       color: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200'   },
  { id: 'released',         label: 'Released',         icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200'},
  { id: 'rejected',         label: 'Rejected',         icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'    },
];

const PANEL_MAP = {
  media_prep: MediaPrepPanel, sterilisation: SterilisationPanel,
  inoculation: InoculationPanel, fermentation: FermentationPanel,
  harvest: HarvestPanel, straining: StrainingPanel,
  extract_addition: ExtractAdditionPanel, downstream: DownstreamPanel,
  qc_hold: QCHoldPanel, released: ReleasePanel, rejected: RejectionPanel,
};

const STAGE_CHECKLIST_MAP = {
  media_prep:       'Media Preparation',
  sterilisation:    'Sterilisation',
  inoculation:      'Inoculation',
  fermentation:     'fermentation readings',
  straining:        'Straining',
  extract_addition: 'extract',
  qc_hold:          'QC Hold',
  released:         'Release or Reject',
  rejected:         'Release or Reject',
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
  const [lnbEntryId,     setLnbEntryId]     = useState(null);
  const [actionLoading,  setActionLoading]  = useState(false);
  const [bmrLoading,     setBmrLoading]     = useState(false);
  const [bmrUrl,         setBmrUrl]         = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);
  const [pendingCancel,     setPendingCancel]     = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [pendingFlaskReject,  setPendingFlaskReject]  = useState(false);
  const [pendingFlaskAdvance, setPendingFlaskAdvance] = useState(null);
  const [selectedFlaskId,    setSelectedFlaskId]    = useState(null);
  const [viewingStage,       setViewingStage]       = useState(null);
  const [editingStage,       setEditingStage]       = useState(null);
  const stagePanelRef = useRef(null);

  // The Stage Timeline nav sits below the stage panel on mobile (panel first,
  // since it's the primary actionable content). Tapping a past stage there
  // otherwise updates the panel out of view above the user's scroll position —
  // bring it back into view instead of leaving them looking at a stale spot.
  useEffect(() => {
    if (viewingStage) {
      stagePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [viewingStage]);
  const [lnbByFlask,         setLnbByFlask]         = useState({});
  const [flaskInoculations,  setFlaskInoculations]  = useState([]);
  const [loadError,          setLoadError]          = useState(false);

  const [showQuickLog,    setShowQuickLog]    = useState(false);
  const [quickLogFlaskId, setQuickLogFlaskId] = useState('');
  const [quickPh,         setQuickPh]         = useState('');
  const [quickTemp,       setQuickTemp]       = useState('');
  const [quickOd,         setQuickOd]         = useState('');
  const [quickVisual,     setQuickVisual]     = useState('Clear');
  const [quickLogSaving,  setQuickLogSaving]  = useState(false);

  const fetchAll = useCallback(async () => {
    if (!batchId) return;
    setLoadError(false);
    try {
      // Single server-side API call — uses admin client (no RLS), runs all
      // 7 sub-queries in parallel on the server, and returns in one response.
      // This eliminates 6 extra client->Supabase round-trips and RLS overhead.
      const res = await withTimeout(
        fetch(`/api/batches/${batchId}/details`, { cache: 'no-store' }),
        20000,
        'Batch detail load timed out'
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load batch');

      setBatch(json.batch);
      setFlasks(json.flasks);
      setTransitions(json.transitions);
      setEmployees(json.employees);
      setAvailableStock(json.availableStock);
      const lnbEntries = json.lnbEntries || [];
      setLnbCount(lnbEntries.length);
      setLnbEntryId(lnbEntries[0]?.id || null);
      const byFlask = {};
      lnbEntries.forEach(e => { if (e.flask_id) byFlask[e.flask_id] = (byFlask[e.flask_id] || 0) + 1; });
      setLnbByFlask(byFlask);
      setFlaskEndpoints(json.flaskEndpoints);
      if (json.batch?.bmr_url) setBmrUrl(json.batch.bmr_url);
    } catch (err) {
      console.error('Batch detail fetch error:', err);
      setLoadError(true);
    }
  }, [batchId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (flasks.length > 0 && !selectedFlaskId) {
      setSelectedFlaskId(flasks[0].id);
    }
  }, [flasks, selectedFlaskId]);

  // Fetch inoculation data for overtime detection when batch is fermenting
  useEffect(() => {
    if (!batch || !batchId) return;
    const fermentingFlasks = flasks.filter(f => f.current_stage === 'fermentation' && f.status !== 'rejected');
    if (fermentingFlasks.length === 0) {
      setFlaskInoculations([]);
      return;
    }
    supabase
      .from('batch_flask_inoculations')
      .select('flask_id, t_zero_time, planned_fermentation_hrs')
      .eq('batch_id', batchId)
      .then(({ data }) => {
        setFlaskInoculations(data || []);
      });
  }, [flasks, batch, batchId, supabase]);

  // Compute overtime flasks from inoculation data
  const overtimeFlasksComputed = useMemo(() => {
    if (!flaskInoculations.length) return [];
    const now = Date.now();
    const overtime = [];
    for (const inoc of flaskInoculations) {
      if (!inoc.t_zero_time || !inoc.planned_fermentation_hrs) continue;
      const hoursElapsed = (now - new Date(inoc.t_zero_time)) / 3600000;
      if (hoursElapsed > inoc.planned_fermentation_hrs) {
        const flask = flasks.find(f => f.id === inoc.flask_id);
        if (flask && flask.status !== 'rejected' && flask.current_stage === 'fermentation') {
          overtime.push({ ...flask, label: flask.flask_label, hoursElapsed, plannedHrs: inoc.planned_fermentation_hrs });
        }
      }
    }
    return overtime;
  }, [flaskInoculations, flasks]);

  const tickTaskChecklist = useCallback(async (completedStage) => {
    const keyword = STAGE_CHECKLIST_MAP[completedStage];
    if (!keyword) return;
    const { data: task } = await supabase.from('tasks').select('id, checklist').eq('batch_id', batchId).maybeSingle();
    if (!task?.checklist?.length) return;
    const updated = task.checklist.map(item =>
      item.text?.toLowerCase().includes(keyword.toLowerCase()) ? { ...item, done: true } : item
    );
    await supabase.from('tasks').update({ checklist: updated }).eq('id', task.id).catch(() => {});
  }, [supabase, batchId]);

  const handleFlaskTransition = useCallback((flaskId, toStage) => {
    if (toStage === 'released' && lnbCount === 0) {
      toast.warn('Cannot release — Lab Notebook is empty.');
      return;
    }
    const flask = flasks.find(f => f.id === flaskId);
    setPendingFlaskAdvance({ flaskId, flaskLabel: flask?.flask_label || flaskId, toStage, fromStage: flask?.current_stage });
  }, [flasks, lnbCount, toast]);

  const confirmFlaskAdvance = useCallback(async () => {
    if (!pendingFlaskAdvance) return;
    const { flaskId, toStage, fromStage } = pendingFlaskAdvance;
    setPendingFlaskAdvance(null);
    setActionLoading(true);
    try {
      // Update flask stage + status (rejected locks it; released stays 'active' until ReleasePanel confirms)
      const flaskStatus = toStage === 'rejected' ? 'rejected' : 'active';
      const { error } = await supabase.from('batch_flasks')
        .update({ current_stage: toStage, status: flaskStatus })
        .eq('id', flaskId);
      if (error) throw error;

      // Keep batch.current_stage in sync with the most-advanced flask (excluding released/rejected terminal update)
      if (batch?.id && toStage !== 'rejected') {
        const FLASK_RANKS = ['inoculation','fermentation','harvest','straining','extract_addition','downstream','qc_hold','released'];
        const newRank  = FLASK_RANKS.indexOf(toStage);
        const batchRank = FLASK_RANKS.indexOf(batch.current_stage);
        if (newRank > batchRank) {
          let newBatchStatus = 'processing';
          if (toStage === 'fermentation') newBatchStatus = 'fermenting';
          else if (toStage === 'qc_hold') newBatchStatus = 'qc-hold';
          const { error: batchErr } = await supabase.from('batches')
            .update({ current_stage: toStage, status: newBatchStatus })
            .eq('id', batch.id);
          if (batchErr) throw batchErr;
        }
      }

      toast.success(`Trial advanced to ${toStage.replace(/_/g, ' ')}.`);
      setViewingStage(null);
      setEditingStage(null);
      tickTaskChecklist(fromStage).catch(() => {});
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setActionLoading(false); }
  }, [pendingFlaskAdvance, supabase, toast, fetchAll, tickTaskChecklist, batch]);

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
      tickTaskChecklist(batch.current_stage).catch(() => {});
      // Notify CEO/CTO when batch reaches QC Hold
      if (toStage === 'qc_hold') {
        const ceoCtoCandidates = employees.filter(e => ['ceo','cto','admin'].includes(e.role));
        const notifRows = ceoCtoCandidates.map(e => ({
          employee_id: e.id,
          title: `QC Hold — ${batch.batch_id} ready for review`,
          message: `Batch ${batch.batch_id} has reached QC Hold stage. Review results and make a release decision.`,
          link: `/batches/${batchId}`,
        }));
        if (notifRows.length > 0) {
          supabase.from('notifications').insert(notifRows).then(()=>{}).catch(()=>{});
        }
      }
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

  const handleStartBatch = useCallback(async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start batch');
      toast.success('Batch started at Media Prep.');
      fetchAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, batchId, fetchAll, toast]);

  const handleCancelBatch = useCallback(async () => {
    setArchiveReason('');
    setPendingCancel(true);
  }, []);

  const confirmCancelBatch = async () => {
    if (!archiveReason.trim()) {
      toast.error('Please provide a reason for archiving.');
      return;
    }
    setPendingCancel(false);
    try {
      const res  = await fetch(`/api/batches?id=${batchId}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive_reason: archiveReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message || 'Batch archived.');
      router.push('/batches');
    } catch (err) {
      toast.error('Failed to archive batch: ' + err.message);
    }
  };

  if (loadError && !batch) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 font-bold text-sm max-w-md">
          Couldn&apos;t load this batch. Your connection may be slow or unavailable.
        </div>
        <button onClick={fetchAll} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider rounded-lg">Retry</button>
      </div>
    );
  }

  if (!batch) return <div className="p-8 text-center text-slate-400 animate-pulse">Loading batch...</div>;

  const currentIdx  = STAGES.findIndex(s => s.id === batch.current_stage);
  const isScheduled = ['planned', 'scheduled'].includes(batch.status) && !batch.current_stage;
  const isTerminal  = ['released', 'rejected'].includes(batch.status);
  const isPostSterilisation = !isScheduled && (currentIdx > 1 || batch.current_stage === 'inoculation' || batch.status === 'fermenting');

  const FLASK_STAGE_RANK = ['inoculation','fermentation','harvest','straining','extract_addition','downstream','qc_hold','released','rejected'];
  const derivedStatus = (() => {
    if (isTerminal) return batch.status;
    if (isScheduled) return 'scheduled';
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
    if (['straining','extract_addition','downstream'].includes(maxStage)) return 'processing';
    return batch.status;
  })();

  const selectedFlask = isPostSterilisation && flasks.length > 0 ? flasks.find(f => f.id === selectedFlaskId) || flasks[0] : null;
  const activeStage = isScheduled ? null : (isPostSterilisation ? (selectedFlask?.current_stage || 'inoculation') : batch.current_stage);
  const displayStage = viewingStage || activeStage;
  const CurrentPanel = PANEL_MAP[displayStage] || null;

  const fermentingFlasks = flasks.filter(f => f.current_stage === 'fermentation' && f.status === 'active');

  const handleQuickLogSubmit = async () => {
    if (!quickPh) return;
    setQuickLogSaving(true);
    try {
      const elapsed = null;
      const { error } = await supabase.from('batch_fermentation_readings').insert({
        batch_id: batch.id,
        flask_id: quickLogFlaskId,
        flask_label: flasks.find(f => f.id === quickLogFlaskId)?.flask_label,
        ph: parseFloat(quickPh),
        incubator_temp_c: quickTemp ? parseFloat(quickTemp) : null,
        optical_density: quickOd ? parseFloat(quickOd) : null,
        visual_appearance: quickVisual,
        logged_at: new Date().toISOString(),
        is_ph_alarm: parseFloat(quickPh) < 3.75 || parseFloat(quickPh) > 6.5,
        logged_by: employeeProfile?.id,
      });
      if (error) throw error;
      const label = flasks.find(f => f.id === quickLogFlaskId)?.flask_label || quickLogFlaskId;
      toast.success(`Reading logged for ${label}`);
      setShowQuickLog(false);
      setQuickPh('');
      setQuickTemp('');
      setQuickOd('');
      setQuickVisual('Clear');
      fetchAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQuickLogSaving(false);
    }
  };

  return (
    <div className="page-container">
      <Link href="/batches" className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-navy mb-4">
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

      {overtimeFlasksComputed.length > 0 && (
        <div className="card p-4 bg-amber-50 border-amber-300 border flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0"/>
          <div>
            <p className="text-sm font-bold text-amber-800">Fermentation overtime: {overtimeFlasksComputed.map(f => f.label).join(', ')}</p>
            <p className="text-xs text-amber-700">Planned duration exceeded. Declare endpoint or extend planned time.</p>
          </div>
        </div>
      )}

      {/* Batch Header — always at top on all screen sizes */}
      <div className="card p-4 md:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-mono text-lg font-black text-slate-900 tracking-wider">{batch.batch_id}</p>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {batch.sku_target && batch.sku_target !== 'Unassigned' && (
                <span className={`px-2 py-0.5 rounded text-xs font-black uppercase border ${batch.sku_target==='CLARITY' ? 'bg-slate-50 text-slate-700 border-slate-200' : batch.sku_target==='MOMENTUM' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{batch.sku_target}</span>
              )}
              <span className="px-2 py-0.5 rounded text-xs font-black bg-slate-100 text-slate-600 border border-slate-200 uppercase">{batch.experiment_type}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-black uppercase border ${derivedStatus==='released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : derivedStatus==='rejected' ? 'bg-red-50 text-red-700 border-red-100' : derivedStatus==='fermenting' ? 'bg-navy/10 text-navy border-navy/20' : derivedStatus==='qc-hold' ? 'bg-red-50 text-red-700 border-red-100' : derivedStatus==='processing' ? 'bg-slate-50 text-slate-700 border-slate-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{derivedStatus}</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div>
              {(() => {
                const maxEpHrs = flaskEndpoints.length > 0
                  ? Math.max(...flaskEndpoints.map(e => e.total_hours || 0))
                  : null;
                const hrs = isScheduled
                  ? 0
                  : maxEpHrs !== null
                  ? maxEpHrs
                  : (new Date() - new Date(batch.start_time)) / 3600000;
                return (
                  <>
                    <p className="text-xs text-slate-400 font-bold uppercase">{isScheduled ? 'Scheduled' : maxEpHrs !== null ? 'Fermentation' : 'Age'}</p>
                    <p className="text-xl font-black text-slate-800 tabular-nums">{hrs.toFixed(1)}<span className="text-xs text-slate-400"> hr</span></p>
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/messages?pin_type=batch&pin_id=${batch.batch_id}&pin_title=${encodeURIComponent('Batch ' + batch.batch_id)}`)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                title="Discuss this batch"
              >
                <MessageSquare className="w-3 h-3"/> Discuss
              </button>
              {!isTerminal && ['admin','ceo','cto'].includes(role) && (
                <button
                  onClick={handleCancelBatch}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-red-600 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                  title="Archive this batch"
                >
                  <Trash2 className="w-3 h-3"/> Archive Batch
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Recipe</p>
            <Link href="/formulations" className="font-bold text-slate-800 hover:text-navy hover:underline block">
              {batch.formulations?.name}
            </Link>
            <p className="text-slate-400">v{batch.formulations?.version}</p>
          </div>
          <div><p className="text-xs text-slate-400 font-bold uppercase mb-0.5">Volume / Flasks</p><p className="font-bold text-slate-800">{batch.planned_volume_ml}ml × {batch.num_flasks}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* ── LEFT COLUMN — sidebar (stage nav + flask cards) ── */}
        {/* order-2/lg:order-1: on mobile panel content shows first, sidebar shows below */}
        <div className="space-y-4 order-2 lg:order-1">

          {/* Stage Timeline */}
          <div className="card p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Stage Timeline</p>
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
                      done ? 'hover:bg-slate-50 cursor-pointer' : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${done ? 'bg-navy border-navy' : curr ? `${stage.bg} ${stage.border}` : 'bg-slate-50 border-slate-200'}`}>
                      {done
                        ? <CheckCircle className="w-3 h-3 text-white"/>
                        : <Icon className={`w-2.5 h-2.5 ${curr ? stage.color : 'text-slate-300'}`}/>}
                    </div>
                    <span className={`text-xs font-bold ${isViewing ? 'text-navy' : curr ? 'text-slate-900' : done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{stage.label}</span>
                    {isViewing && <span className="ml-auto text-xs font-black text-slate-600">VIEWING</span>}
                    {curr && !isViewing && <span className="ml-auto text-xs font-black text-navy">ACTIVE</span>}
                    {done && !isViewing && <span className="ml-auto text-xs text-slate-300 font-bold">↩</span>}
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
          <div className="card p-4 border-2 border-navy/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-navy/5 rounded-bl-[100px] -z-10"/>
            <p className="text-xs font-black text-navy uppercase tracking-widest mb-3 flex items-center gap-1"><FlaskConical className="w-3 h-3"/>Trials Tracking</p>
            <div className="space-y-2">
              {flasks.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFlaskId(f.id); setViewingStage(null); }}
                  disabled={!isPostSterilisation}
                  className={`w-full p-2.5 rounded-xl text-left border transition-all flex flex-col items-start ${selectedFlaskId===f.id?'bg-navy/5 border-navy shadow-sm ring-1 ring-navy':f.status==='rejected'?'bg-red-50 border-red-200 opacity-60':'bg-white hover:bg-slate-50 border-slate-200 hover:border-navy/50'}`}>
                  <div className="flex justify-between items-center w-full">
                    <p className={`text-sm font-black ${f.status==='rejected'?'text-red-500 line-through':selectedFlaskId===f.id?'text-navy':'text-slate-700'}`}>{f.flask_label}</p>
                    {selectedFlaskId===f.id && <div className="w-1.5 h-1.5 bg-navy rounded-full animate-pulse"/>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <p className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${f.status==='rejected'?'bg-red-100 text-red-600':selectedFlaskId===f.id?'bg-navy text-white':'bg-slate-200 text-slate-500'}`}>
                      {f.status==='rejected' ? 'REJECTED' : isScheduled ? 'PLANNED' : ((STAGES.find(s => s.id === f.current_stage)?.label) || f.current_stage || 'INOCULATION').toUpperCase()}
                    </p>
                    {lnbByFlask[f.id] > 0 && (
                      <span className="text-xs font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 flex items-center gap-0.5">
                        <BookOpen className="w-2.5 h-2.5"/>{lnbByFlask[f.id]}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {!isPostSterilisation && <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10"><FlaskConical className="w-6 h-6 text-amber-500 mb-2 opacity-50"/><span className="text-xs text-amber-700 font-bold">{isScheduled ? 'Start batch to unlock stage tracking.' : 'Complete Sterilisation to unlock individual trial tracking.'}</span></div>}
          </div>

          {/* Linked Records (compact — Lab Notebook + BMR only) */}
          <div className="card p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Quick Links</p>
            <div className="space-y-2">
              <Link href={lnbEntryId ? `/lab-notebook/${lnbEntryId}` : '/lab-notebook'} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-slate-400"/><span className="text-xs font-semibold text-slate-700">Lab Notebook</span></div>
                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${lnbCount>0?'bg-navy text-white':'bg-slate-200 text-slate-500'}`}>{lnbCount}</span>
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
                    <span className="text-xs font-bold text-slate-400 uppercase">GMP</span>
                  </button>
                  {bmrUrl && (
                    <a href={`/api/batches/${batchId}/bmr?download=true`} target="_blank"
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                      <div className="flex items-center gap-2"><Download className="w-3.5 h-3.5 text-emerald-600"/><span className="text-xs font-black text-emerald-700">Download BMR</span></div>
                      <span className="text-xs font-bold text-emerald-500 uppercase">PDF</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stage History */}
          <div className="card p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Stage History</p>
            <div className="space-y-2.5">
              {transitions.length===0 && <p className="text-xs text-slate-400 text-center py-2">No transitions yet.</p>}
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
                          <p className="font-bold text-slate-700">{t.from_stage?.replace(/_/g,' ')} → {t.to_stage?.replace(/_/g,' ')}</p>
                          {dur && <span className="text-xs font-black text-navy bg-navy/5 px-1.5 py-0.5 rounded">{dur}</span>}
                        </div>
                        <p className="text-slate-400 text-xs">{t.employees?.full_name} · {t.created_at ? new Date(t.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — Stage Panel (shows first on mobile) ── */}
        <div className="order-1 lg:order-2" ref={stagePanelRef}>
          {/* View / Edit Mode Banner */}
          {viewingStage && (
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 mb-4 ${editingStage === viewingStage ? 'bg-amber-50 border border-amber-300' : 'bg-slate-50 border border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <BookOpen className={`w-4 h-4 shrink-0 ${editingStage === viewingStage ? 'text-amber-600' : 'text-slate-600'}`}/>
                <div>
                  {editingStage === viewingStage ? (
                    <>
                      <p className="text-xs font-black text-amber-800">Editing Past Stage — Admin Mode</p>
                      <p className="text-xs text-amber-600">Editing <span className="font-bold uppercase">{viewingStage.replace(/_/g,' ')}</span> data. Save within the panel to update.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-black text-slate-800">Viewing Past Stage — Read Only</p>
                      <p className="text-xs text-slate-600">You are reviewing <span className="font-bold uppercase">{viewingStage.replace(/_/g,' ')}</span> data. No edits can be made.</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {['admin','ceo','cto'].includes(role) && editingStage !== viewingStage && (
                  <button
                    onClick={() => setEditingStage(viewingStage)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-lg transition-colors"
                  >
                    Edit Stage
                  </button>
                )}
                {editingStage === viewingStage && (
                  <button
                    onClick={() => setEditingStage(null)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-black rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Stop Editing
                  </button>
                )}
                <button
                  onClick={() => { setViewingStage(null); setEditingStage(null); }}
                  className="px-3 py-1.5 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover transition-colors"
                >
                  ← Return to Current Stage
                </button>
              </div>
            </div>
          )}

          {!viewingStage && isPostSterilisation && selectedFlask && !['released','rejected'].includes(selectedFlask.current_stage) && selectedFlask.status !== 'rejected' && (
            <div className="flex justify-end mb-4">
              <button onClick={() => setPendingFlaskReject(true)} className="px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 font-black rounded-lg text-xs uppercase tracking-wider transition-all hover:scale-105">Abort / Reject Trial {selectedFlask.flask_label}</button>
            </div>
          )}

          {isScheduled ? (
            <div className="card p-8 text-center">
              <Clock className="w-8 h-8 text-navy mx-auto mb-3" />
              <p className="text-sm font-black text-slate-900 uppercase tracking-wider">Batch Scheduled</p>
              <p className="text-xs text-slate-500 mt-1 mb-5">Start this batch when production begins. The first active stage will be Media Prep.</p>
              <button
                onClick={handleStartBatch}
                disabled={actionLoading}
                className="inline-flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white text-xs font-black rounded-lg disabled:opacity-60"
              >
                {actionLoading ? 'Starting...' : 'Start Batch'} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </button>
            </div>
          ) : CurrentPanel ? (
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
            <div className="card p-8 text-center text-slate-400 text-sm">Unknown stage: {batch.current_stage}</div>
          )}
        </div>
      </div>

      {/* Linked Records — full-width cross-module panel */}
      <LinkedRecordsPanel batch={batch} supabase={supabase} />

      {/* Transition Modal */}
      {pendingTransition && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Advance Stage</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">Are you sure you want to advance this batch to <strong className="uppercase">{pendingTransition.replace(/_/g, ' ')}</strong>?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingTransition(null)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
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

      {/* Archive Modal */}
      {pendingCancel && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-red-600 mb-2 text-center">Archive Entire Batch</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">This hides the batch from active lists. Permanent delete is available only from Archived.</p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Archiving</label>
              <input
                type="text"
                placeholder="Required..."
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-red-500"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPendingCancel(false)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold">Nevermind</button>
              <button disabled={!archiveReason.trim()} onClick={confirmCancelBatch} className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-sm">Archive Batch</button>
            </div>
          </div>
        </div>
      )}

      {/* Flask Advance Confirmation Modal */}
      {pendingFlaskAdvance && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 mb-1 text-center">Advance Trial Stage</h3>
            <p className="text-sm text-slate-600 mb-1 text-center">
              Advancing <span className="font-black text-navy">{pendingFlaskAdvance.flaskLabel}</span> to{' '}
              <span className="font-black uppercase">{pendingFlaskAdvance.toStage.replace(/_/g,' ')}</span>
            </p>
            <p className="text-xs text-slate-400 text-center mb-5">This cannot be undone without admin intervention.</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingFlaskAdvance(null)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition">Cancel</button>
              <button onClick={confirmFlaskAdvance} disabled={actionLoading} className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {actionLoading ? <Loader className="w-4 h-4 animate-spin"/> : `Advance ${pendingFlaskAdvance.flaskLabel}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Trial Modal */}
      {pendingFlaskReject && selectedFlask && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-red-600 mb-2 text-center">Abort & Reject Trial</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">Are you sure you want to forcibly reject <strong>{selectedFlask.flask_label}</strong> at its current stage? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingFlaskReject(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
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

      {/* Quick Log Modal */}
      {showQuickLog && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-slate-900 mb-4">Quick Fermentation Reading</h3>

            {/* Flask selector */}
            <div className="mb-3">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Flask</label>
              <select
                value={quickLogFlaskId}
                onChange={e => setQuickLogFlaskId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy/30"
              >
                {fermentingFlasks.map(f => (
                  <option key={f.id} value={f.id}>{f.flask_label}</option>
                ))}
              </select>
            </div>

            {/* pH — required */}
            <div className="mb-3">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">pH <span className="text-red-500">*</span></label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="14"
                value={quickPh}
                onChange={e => setQuickPh(e.target.value)}
                placeholder="e.g. 4.20"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
              {quickPh && (parseFloat(quickPh) < 3 || parseFloat(quickPh) > 6) && (
                <p className="text-xs text-red-600 font-bold mt-0.5">⚠ pH out of range — alarm will be flagged</p>
              )}
            </div>

            {/* Incubator Temp */}
            <div className="mb-3">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Incubator Temp °C <span className="text-slate-300">(optional)</span></label>
              <input
                type="number"
                step="0.1"
                value={quickTemp}
                onChange={e => setQuickTemp(e.target.value)}
                placeholder="e.g. 30.0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
            </div>

            {/* OD 600nm */}
            <div className="mb-3">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">OD 600nm <span className="text-slate-300">(optional)</span></label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quickOd}
                onChange={e => setQuickOd(e.target.value)}
                placeholder="e.g. 1.25"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
            </div>

            {/* Visual */}
            <div className="mb-5">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Visual Appearance</label>
              <select
                value={quickVisual}
                onChange={e => setQuickVisual(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy/30"
              >
                {['Clear', 'Turbid', 'Foamy', 'Settling', 'Other'].map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowQuickLog(false); setQuickPh(''); setQuickTemp(''); setQuickOd(''); setQuickVisual('Clear'); }}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickLogSubmit}
                disabled={!quickPh || quickLogSaving}
                className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {quickLogSaving ? <Loader className="w-4 h-4 animate-spin"/> : 'Log Reading'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
