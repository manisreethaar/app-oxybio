'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  FlaskConical, Plus, AlertTriangle, ArrowRight, Loader2, X,
  CheckCircle2, Trash2, Clock, Beaker, Activity, Users, Calendar,
  ChevronRight, Zap, Search, Archive, LayoutGrid, List, Columns,
  ShieldCheck, Droplets, Filter, Leaf
} from 'lucide-react';
import { format, differenceInHours, differenceInDays } from 'date-fns';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import CreatorBadge from '@/components/ui/CreatorBadge';
import EditRequestButton from '@/components/ui/EditRequestButton';
import MobilePageHeader from '@/components/ui/MobilePageHeader';

// ─── Stage Config ────────────────────────────────────────────
const STAGE_ORDER = [
  'media_prep', 'sterilisation', 'inoculation', 'fermentation',
  'straining', 'extract_addition', 'qc_hold', 'released', 'rejected'
];
const STAGE_LABELS = {
  media_prep:       'Media Prep',
  sterilisation:    'Sterilisation',
  inoculation:      'Inoculation',
  fermentation:     'Fermentation',
  straining:        'Straining',
  extract_addition: 'Extract Addition',
  qc_hold:          'QC Hold',
  released:         'Released',
  rejected:         'Rejected',
};

// ─── SKU Badge Colors ─────────────────────────────────────────
const SKU_COLORS = {
  CLARITY:    'bg-slate-50 text-slate-700 border-slate-200',
  MOMENTUM:   'bg-amber-50 text-amber-700 border-amber-200',
  VITALITY:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  Unassigned: 'bg-slate-100 text-slate-500 border-slate-200',
};

// ─── Status Colors ────────────────────────────────────────────
const STATUS_COLORS = {
  scheduled:   'bg-slate-50 text-slate-700 border-slate-100',
  planned:     'bg-slate-50 text-slate-700 border-slate-100',
  active:       'bg-amber-50 text-amber-700 border-amber-100', // legacy DB value
  'in-progress':'bg-amber-50 text-amber-700 border-amber-100', // DB canonical value
  in_progress:  'bg-amber-50 text-amber-700 border-amber-100', // code alias
  fermenting:  'bg-amber-50 text-amber-700 border-amber-100',
  qc_hold:     'bg-slate-50 text-slate-700 border-slate-100',
  'qc-hold':   'bg-slate-50 text-slate-700 border-slate-100',
  released:    'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected:    'bg-red-50 text-red-700 border-red-100',
  deviation:   'bg-red-50 text-red-700 border-red-100',
};

// ─── Validation Schema ───────────────────────────────────────
const TERMINAL_STATUSES = ['released', 'rejected'];
const SCHEDULED_STATUSES = ['planned', 'scheduled'];

function normaliseStatus(value) {
  return (value || '').toString().toLowerCase();
}

function getBatchDisposition(batch) {
  const status = normaliseStatus(batch.status);
  const currentStage = normaliseStatus(batch.current_stage);
  if (TERMINAL_STATUSES.includes(status)) return status;
  if (TERMINAL_STATUSES.includes(currentStage)) return currentStage;

  const flasks = batch.batch_flasks || [];
  if (flasks.length === 0) return status;

  const liveFlasks = flasks.filter(f => normaliseStatus(f.status) !== 'rejected');
  if (liveFlasks.length === 0) return 'rejected';

  const allLiveReleased = liveFlasks.every(f => {
    const flaskStatus = normaliseStatus(f.status);
    const flaskStage = normaliseStatus(f.current_stage);
    return flaskStatus === 'released' || flaskStage === 'released';
  });

  return allLiveReleased ? 'released' : status;
}

function normaliseBatchForList(batch) {
  const disposition = getBatchDisposition(batch);
  if (!TERMINAL_STATUSES.includes(disposition)) return batch;

  return {
    ...batch,
    status: disposition,
    current_stage: disposition,
  };
}

function isScheduledBatch(batch) {
  return SCHEDULED_STATUSES.includes(normaliseStatus(batch.status)) && !batch.current_stage;
}

const batchSchema = z.object({
  formulation_id:    z.string().uuid('Select an approved formulation'),
  experiment_type:   z.string().min(1, 'Select experiment type'),
  sku_target:        z.string().default('Unassigned'),
  planned_volume_ml: z.preprocess(Number, z.number().positive('Enter a valid volume')),
  num_flasks:        z.preprocess(Number, z.number().int().min(1).max(10).default(3)),
  planned_start_date: z.string().optional(),
  notes:             z.string().optional(),
});

export default function BatchesPage() {
  const { employeeProfile, role, isAdmin, canDo, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [activeBatches,    setActiveBatches]    = useState([]);
  const [history,          setHistory]          = useState([]);
  const [archivedBatches,  setArchivedBatches]  = useState([]);
  const [isAlert,          setIsAlert]          = useState(false);
  const [loadingBatches,   setLoadingBatches]   = useState(true);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [formulations,     setFormulations]     = useState([]);
  const [experimentTypes,  setExperimentTypes]  = useState([]);
  const [skuTargets,       setSkuTargets]       = useState([]);
  const [creatingBatch,    setCreatingBatch]    = useState(false);
  const [batchError,       setBatchError]       = useState(null); // { message, warnings }
  const [cancelConfirmId,  setCancelConfirmId]  = useState(null);
  const [archiveReason,    setArchiveReason]    = useState('');
  const [statusFilter,     setStatusFilter]     = useState('active');
  const [searchTerm,       setSearchTerm]       = useState('');
  const [sortOrder,        setSortOrder]        = useState('newest');
  const [pendingIds,       setPendingIds]       = useState(new Set());
  const [viewMode,         setViewMode]         = useState('kanban');

  useEffect(() => {
    const saved = localStorage.getItem('batches_view_mode');
    if (saved && ['kanban', 'grid', 'table'].includes(saved)) {
      setViewMode(saved);
    }
  }, []);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('batches_view_mode', mode);
  };

  const getBatchEffectiveStage = (batch) => {
    if (isScheduledBatch(batch)) return null;
    const batchStageIdx = STAGE_ORDER.indexOf(batch.current_stage);
    const BATCH_ONLY_STAGES = ['media_prep', 'sterilisation'];
    const maxFlaskIdx = BATCH_ONLY_STAGES.includes(batch.current_stage)
      ? -1
      : (batch.batch_flasks || [])
          .filter(f => f.status !== 'rejected')
          .reduce((best, f) => Math.max(best, STAGE_ORDER.indexOf(f.current_stage)), -1);
    const effectiveIdx = Math.max(batchStageIdx, maxFlaskIdx);
    return effectiveIdx >= 0 ? STAGE_ORDER[effectiveIdx] : batch.current_stage;
  };

  const renderBatchCard = (batch, compact = false) => {
    const hasAlarm = batch.batch_fermentation_readings?.some(r => r.is_ph_alarm || r.is_temp_alarm);
    const flasks   = batch.batch_flasks || [];
    const maxEpHrs = batch._maxEpHrs ?? null;
    const hours = maxEpHrs !== null
      ? maxEpHrs.toFixed(1)
      : batch.start_time
        ? ((new Date() - new Date(batch.start_time)) / 3600000).toFixed(1)
        : '0.0';
    const hrsLabel = maxEpHrs !== null ? 'Fermentation' : 'Age';

    const isScheduled = isScheduledBatch(batch);
    const effectiveIdx = STAGE_ORDER.indexOf(getBatchEffectiveStage(batch));
    const derivedStage = effectiveIdx >= 0 ? STAGE_ORDER[effectiveIdx] : batch.current_stage;
    const currentIdx = isScheduled ? -1 : effectiveIdx;

    const isStatusStale = SCHEDULED_STATUSES.includes(normaliseStatus(batch.status)) && effectiveIdx >= 0;
    const displayStatus = isScheduled ? 'scheduled'
      : isStatusStale ? (STAGE_LABELS[derivedStage] || 'in progress').toLowerCase()
      : batch.status;

    return (
      <div
        key={batch.id}
        className={`card overflow-hidden flex flex-col hover:border-slate-300 transition-all ${compact ? 'min-w-[280px] w-[280px] snap-center shrink-0' : ''} ${hasAlarm ? 'border-red-300 ring-1 ring-red-200' : ''}`}
      >
        <div className={`px-5 py-4 flex justify-between items-start border-b border-slate-100 bg-slate-50/40 ${compact ? 'px-4 py-3' : ''}`}>
          <div>
            <p className="font-mono text-sm font-black text-slate-900 tracking-wider mb-1.5">{batch.batch_id}</p>
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${SKU_COLORS[batch.sku_target] || SKU_COLORS.Unassigned}`}>
                {batch.sku_target}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                {batch.experiment_type}
              </span>
              {!compact && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${hasAlarm ? 'bg-red-100 text-red-700 border-red-200 animate-pulse' : STATUS_COLORS[normaliseStatus(batch.status)] || STATUS_COLORS['in_progress'] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {hasAlarm ? '⚠ Alarm' : displayStatus}
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">{hrsLabel}</p>
            <p className="text-lg font-black text-slate-800 tabular-nums">{hours}<span className="text-[10px] font-bold text-slate-400"> hr</span></p>
            {!compact && isAdmin ? (
              <div className="flex gap-2">
                <button onClick={e => { e.preventDefault(); setArchiveReason(''); setCancelConfirmId(batch.id); }} className="p-1.5 rounded bg-slate-100 text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-all border border-slate-200" title="Archive Batch"><Archive className="w-3 h-3"/></button>
                <button onClick={e => { e.preventDefault(); handlePermanentDeleteBatch(batch.id); }} className="p-1.5 rounded bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-slate-200" title="Permanently Delete Batch"><Trash2 className="w-3 h-3"/></button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={`px-5 pt-3 pb-2 ${compact ? 'px-4 pt-2 pb-1.5' : ''}`}>
          <div className="flex items-center gap-0.5 mb-1">
            {STAGE_ORDER.slice(0, 7).map((stage, idx) => (
              <div
                key={stage}
                title={STAGE_LABELS[stage]}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  currentIdx >= 7 || idx < currentIdx  ? 'bg-navy' :
                  idx === currentIdx ? 'bg-amber-500 animate-pulse' :
                  'bg-slate-100'
                }`}
              />
            ))}
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {isScheduled ? 'Scheduled' : (STAGE_LABELS[derivedStage] || derivedStage)}
          </p>
        </div>

        <div className={`px-5 py-2 border-t border-slate-50 flex items-center gap-2 ${compact ? 'px-4 py-1.5' : ''}`}>
          <FlaskConical className="w-3 h-3 text-slate-400 shrink-0"/>
          <div className="flex gap-1 flex-wrap">
            {flasks.map(f => (
              <span
                key={f.id}
                className={`px-1 py-0.5 rounded text-[10px] font-black uppercase border ${f.status === 'active' ? 'bg-navy/5 text-navy border-navy/20' : f.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200 line-through' : f.status === 'planned' ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
              >
                {f.flask_label}
              </span>
            ))}
            {flasks.length === 0 && <span className="text-[10px] text-slate-400">No flasks</span>}
          </div>
          <span className="ml-auto text-[10px] text-slate-400 font-semibold">{batch.planned_volume_ml}ml</span>
        </div>

        <div className={`px-5 py-1.5 border-t border-slate-50 flex items-center gap-1.5 ${compact ? 'px-4 py-1' : ''}`}>
          <span className="text-[10px] text-slate-400 font-bold uppercase">Recipe:</span>
          <span className="text-[10px] font-bold text-slate-700 truncate max-w-[120px]">{batch.formulations?.name || '—'}</span>
          <span className="text-[10px] text-slate-400">v{batch.formulations?.version}</span>
        </div>

        {isScheduled ? (
          <button
            onClick={() => handleStartBatch(batch.id)}
            disabled={creatingBatch}
            className="w-full py-2.5 mt-auto flex justify-center items-center text-xs font-bold transition-colors border-t border-slate-100 bg-slate-50/50 hover:bg-slate-100 text-navy disabled:opacity-60"
          >
            Start Batch <ArrowRight className="w-3 h-3 ml-1.5"/>
          </button>
        ) : (
          <Link
            href={`/batches/${batch.id}`}
            className={`w-full py-2.5 mt-auto flex justify-center items-center text-xs font-bold transition-colors border-t border-slate-100 ${hasAlarm ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-slate-50/50 hover:bg-slate-100 text-navy'}`}
          >
            {hasAlarm ? '⚠ Review Alarm' : 'Continue Batch'} <ArrowRight className="w-3 h-3 ml-1.5"/>
          </Link>
        )}
      </div>
    );
  };

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      experiment_type:   'F1',
      sku_target:        'Unassigned',
      planned_volume_ml: 250,
      num_flasks:        3,
    },
  });

  const watchExperimentType = watch('experiment_type');
  const watchFormulationId  = watch('formulation_id');
  const [batchIdPreview, setBatchIdPreview] = useState('');
  // 1B: Combobox state for formulation picker
  const [formulationSearch,   setFormulationSearch]   = useState('');
  const [formulationDropOpen, setFormulationDropOpen] = useState(false);
  const searchParams = useSearchParams();

  // 2C: Auto-open from R&D handoff — reads ?prefill= base64 JSON
  useEffect(() => {
    const prefill = searchParams?.get('prefill');
    if (!prefill) return;
    try {
      const data = JSON.parse(atob(prefill));
      if (data.notes) setValue('notes', data.notes);
      setShowNewBatchModal(true);
    } catch {
      // malformed — ignore silently
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!watchFormulationId) { setBatchIdPreview(''); return; }
    let cancelled = false;
    fetch(`/api/batches?formulation_id=${watchFormulationId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.batch_id) setBatchIdPreview(d.batch_id); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [watchFormulationId]);

  // ─── Data Fetching ─────────────────────────────────────────
  const fetchBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const [activeRes, completedRes, archivedRes] = await Promise.all([
        supabase
          .from('batches')
          .select(`
            id, batch_id, experiment_type, sku_target, status, current_stage,
            planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team, has_alarm, archived_at,
            created_by, creator:employees!batches_created_by_fkey(id, full_name, initials),
            formulations(name, code, version),
            batch_flasks(id, flask_label, status, current_stage)
          `)
          .is('archived_at', null)
          .not('status', 'in', '("released","rejected")')
          .order('created_at', { ascending: false }),
        supabase
          .from('batches')
          .select(`
            id, batch_id, experiment_type, sku_target, status, current_stage,
            planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team, has_alarm, archived_at,
            created_by, creator:employees!batches_created_by_fkey(id, full_name, initials),
            formulations(name, code, version),
            batch_flasks(id, flask_label, status, current_stage)
          `)
          .is('archived_at', null)
          .in('status', ['released', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('batches')
          .select(`
            id, batch_id, experiment_type, sku_target, status, current_stage,
            planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team, has_alarm, archived_at,
            created_by, creator:employees!batches_created_by_fkey(id, full_name, initials),
            formulations(name, code, version),
            batch_flasks(id, flask_label, status, current_stage)
          `)
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
      ]);

      const fetchedActive = (activeRes.data || []).map(normaliseBatchForList);
      const fetchedCompleted = (completedRes.data || []).map(normaliseBatchForList);
      const active = fetchedActive.filter(b => !TERMINAL_STATUSES.includes(b.status));
      const completedById = new Map();
      [...fetchedCompleted, ...fetchedActive.filter(b => TERMINAL_STATUSES.includes(b.status))]
        .forEach(b => completedById.set(b.id, b));
      const completed = Array.from(completedById.values());

      // Fetch endpoints separately (nested select requires explicit FK in schema)
      let epMap = {};
      if (active.length > 0) {
        const { data: epData } = await supabase
          .from('batch_flask_endpoints')
          .select('batch_id, total_hours')
          .in('batch_id', active.map(b => b.id));
        (epData || []).forEach(ep => {
          if (ep.total_hours != null && (epMap[ep.batch_id] == null || ep.total_hours > epMap[ep.batch_id])) {
            epMap[ep.batch_id] = ep.total_hours;
          }
        });
      }
      const activeWithEp = active.map(b => ({ ...b, _maxEpHrs: epMap[b.id] ?? null }));

      // has_alarm is set by DB trigger on reading insert — no need to scan readings
      const hasAlarm = activeWithEp.some(b => b.has_alarm === true);

      setIsAlert(hasAlarm);
      setActiveBatches(activeWithEp);
      setHistory(completed);
      setArchivedBatches((archivedRes.data || []).map(normaliseBatchForList));
    } catch (err) {
      console.error('Fetch batches error:', err);
    } finally {
      setLoadingBatches(false);
    }
  }, [supabase]);

  const fetchFormulations = useCallback(async () => {
    const { data } = await supabase
      .from('formulations')
      .select('id, name, code, version, status')
      .eq('status', 'Approved')
      .order('name');
    if (data) setFormulations(data);
  }, [supabase]);

  const fetchBatchOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/batch-options');
      const json = await res.json();
      if (json.success) {
        setExperimentTypes(json.data.experiment_types || []);
        setSkuTargets(json.data.sku_targets || []);
      }
    } catch {}
  }, []);

  const fetchPendingIds = async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  };

  useEffect(() => {
    fetchBatches(); fetchFormulations(); fetchBatchOptions(); fetchPendingIds();

    // Realtime — batch stage advances, flask updates, new batches appear live
    const channel = supabase.channel('batches_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, () => fetchBatches())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_flasks' }, () => fetchBatches())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchBatches, fetchFormulations, fetchBatchOptions]);

  // ─── Batch Creation ────────────────────────────────────────
  const handleBatchSubmit = async (data) => {
    setBatchError(null);
    setCreatingBatch(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (!res.ok) {
        const detailText = resData.details
          ? Object.entries(resData.details)
              .filter(([, value]) => value?._errors?.length)
              .map(([field, value]) => `${field}: ${value._errors.join(', ')}`)
              .join(' | ')
          : '';
        setBatchError({
          message: detailText || resData.error || 'Failed to create batch',
          warnings: null,
        });
        return;
      }
      // Show inventory warnings if any (non-blocking)
      if (resData.warnings?.length > 0) {
        toast.warn(`Batch created with ${resData.warnings.length} inventory warning(s). Check stock before media prep.`);
      } else {
        toast.success(resData.message || 'Batch scheduled!');
      }
      setShowNewBatchModal(false);
      reset();
      setBatchError(null);
      fetchBatches();
    } catch (err) {
      setBatchError({ message: err.message, warnings: null });
    } finally {
      setCreatingBatch(false);
    }
  };

  // ─── Cancel Batch ──────────────────────────────────────────
  const handleCancelBatch = async (id, reason) => {
    try {
      const res  = await fetch(`/api/batches?id=${id}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive_reason: reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveBatches(prev => prev.filter(b => b.id !== id));
      fetchBatches();
      toast.success(data.message || 'Batch archived.');
    } catch (err) {
      toast.error('Failed to archive batch: ' + err.message);
    }
  };

  const handlePermanentDeleteBatch = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this batch? This action cannot be undone.')) return;
    try {
      const res  = await fetch(`/api/batches?id=${id}&permanent=true`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setArchivedBatches(prev => prev.filter(b => b.id !== id));
      fetchBatches(); // Refresh active batches in case it was deleted from there
      toast.success(data.message || 'Batch permanently deleted.');
    } catch (err) {
      toast.error('Failed to permanently delete batch: ' + err.message);
    }
  };

  const handleStartBatch = async (id) => {
    setCreatingBatch(true);
    try {
      const res = await fetch(`/api/batches/${id}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start batch');
      toast.success('Batch started at Media Prep.');
      fetchBatches();
      setStatusFilter('active');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingBatch(false);
    }
  };

  // ─── Filtered batches (hooks must be before any conditional return) ──────
  const displayedBatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = (() => {
      switch (statusFilter) {
        case 'scheduled': return activeBatches.filter(isScheduledBatch);
        case 'released':  return history.filter(b => b.status === 'released');
        case 'rejected':  return history.filter(b => b.status === 'rejected');
        case 'archived':  return archivedBatches;
        default:          return activeBatches.filter(b => !isScheduledBatch(b));
      }
    })();

    return list
      .filter(batch => !q || [
        batch.batch_id,
        batch.experiment_type,
        batch.sku_target,
        batch.status,
        batch.current_stage,
        batch.formulations?.name,
        batch.formulations?.code,
        batch.batch_flasks?.map(f => f.flask_label).join(' ')
      ].some(value => String(value || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sortOrder === 'oldest') return new Date(a.created_at || a.start_time || 0) - new Date(b.created_at || b.start_time || 0);
        if (sortOrder === 'batch_id') return (a.batch_id || '').localeCompare(b.batch_id || '', undefined, { numeric: true });
        if (sortOrder === 'recipe') return (a.formulations?.name || '').localeCompare(b.formulations?.name || '');
        if (sortOrder === 'stage') return (STAGE_ORDER.indexOf(a.current_stage) - STAGE_ORDER.indexOf(b.current_stage));
        return new Date(b.created_at || b.start_time || 0) - new Date(a.created_at || a.start_time || 0);
      });
  }, [statusFilter, activeBatches, history, archivedBatches, searchTerm, sortOrder]);

  const isHistoryView = ['released','rejected','archived'].includes(statusFilter);

  const SECTION_LABELS = {
    active:    'Active & In‑Progress Batches',
    scheduled: 'Scheduled Batches',
    released:  'Released Batches',
    rejected:  'Rejected Batches',
    archived:  'Archived Batches',
  };

  const tabCounts = {
    active:    activeBatches.filter(b => !isScheduledBatch(b)).length,
    scheduled: activeBatches.filter(isScheduledBatch).length,
    released:  history.filter(b => b.status === 'released').length,
    rejected:  history.filter(b => b.status === 'rejected').length,
    archived:  archivedBatches.length,
  };

  // ─── Loading State ────────────────────────────────────────
  if (loadingBatches) {
    return (
      <div className="page-container space-y-8">
        <div className="flex justify-between items-center">
          <Skeleton width={200} height={32}/>
          <Skeleton width={120} height={40}/>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-52 w-full rounded-2xl"/>)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">

      {/* CCP Alert Banner */}
      {isAlert && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 shadow-sm"
        >
          <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"/>
          <div className="flex items-center text-red-800 text-sm font-bold">
            <AlertTriangle className="w-4 h-4 mr-2 text-red-600"/>
            ACTIVE ALARM — Fermentation deviation detected. Review immediately.
          </div>
        </motion.div>
      )}

      {/* Header */}
      <MobilePageHeader
        icon={FlaskConical}
        title="Batches"
        subtitle="Track active runs, scheduled production, and archived batch records."
        stats={[
          { label: 'Active', value: tabCounts.active },
          { label: 'Scheduled', value: tabCounts.scheduled },
          { label: 'Archived', value: tabCounts.archived },
        ]}
        action={canDo('batches', 'create') ? (
          <button
            onClick={() => { reset(); setBatchError(null); setShowNewBatchModal(true); }}
            className="w-10 h-10 rounded-2xl bg-navy text-white flex items-center justify-center shadow-sm"
            aria-label="Schedule batch"
          >
            <Plus className="w-5 h-5" />
          </button>
        ) : null}
      />

      <div className="hidden md:flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Production Batches</h1>
          <p className="text-sm text-slate-500 mt-1">
            GMP-grade fermentation documentation — from flask to disposition.
          </p>
        </div>
        {canDo('batches', 'create') && (
          <button
            onClick={() => { reset(); setBatchError(null); setShowNewBatchModal(true); }}
            className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 mr-1.5"/> Schedule Batch
          </button>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="mobile-scroll-tabs mt-4 md:mt-6">
        {['active', 'scheduled', 'released', 'rejected', 'archived'].map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-2 rounded-full text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 whitespace-nowrap ${statusFilter === f ? 'bg-navy text-white border-navy' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >
            {f}
            {tabCounts[f] > 0 && (
              <span className={`text-xs font-black px-1 py-0.5 rounded-full min-w-[16px] text-center ${statusFilter === f ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {tabCounts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card p-3 flex flex-col lg:flex-row gap-3 lg:items-center mt-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search batch ID, recipe, SKU, flask..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-bold text-slate-600 outline-none">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="batch_id">Batch ID</option>
          <option value="recipe">Recipe</option>
          <option value="stage">Stage</option>
        </select>
      </div>

      {/* Batch Views — active / scheduled tabs */}
      {!isHistoryView && (
      <section className="mt-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center">
            <Activity className="w-4 h-4 mr-1.5 text-navy"/>
            {SECTION_LABELS[statusFilter]}
            {displayedBatches.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-navy text-white text-xs font-black rounded-full">{displayedBatches.length}</span>
            )}
          </h2>
          
          {/* View Toggle */}
          {statusFilter === 'active' && (
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button onClick={() => handleViewModeChange('kanban')} className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-navy' : 'text-slate-400 hover:text-slate-600'}`} title="Kanban View"><Columns className="w-4 h-4"/></button>
              <button onClick={() => handleViewModeChange('grid')} className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-navy' : 'text-slate-400 hover:text-slate-600'}`} title="Grid View"><LayoutGrid className="w-4 h-4"/></button>
              <button onClick={() => handleViewModeChange('table')} className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-navy' : 'text-slate-400 hover:text-slate-600'}`} title="Table View"><List className="w-4 h-4"/></button>
            </div>
          )}
        </div>

        {displayedBatches.length === 0 ? (
          <div className="card p-10 text-center">
            <Beaker className="w-10 h-10 text-slate-200 mx-auto mb-3"/>
            <p className="text-slate-400 font-medium text-sm">No {statusFilter} batches.</p>
            {statusFilter === 'active' && canDo('batches', 'create') && (
              <button
                onClick={() => { reset(); setBatchError(null); setShowNewBatchModal(true); }}
                className="mt-4 px-4 py-2 bg-navy text-white text-xs font-bold rounded-lg"
              >
                + Schedule First Batch
              </button>
            )}
          </div>
        ) : (
          <>
            {/* GRID VIEW */}
            {(viewMode === 'grid' || statusFilter === 'scheduled') && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {displayedBatches.map(batch => renderBatchCard(batch, false))}
              </div>
            )}

            {/* TABLE VIEW */}
            {viewMode === 'table' && statusFilter === 'active' && (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Batch ID</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">SKU / Type</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Recipe</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Stage Progress</th>
                        <th className="px-5 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Hours</th>
                        <th className="px-5 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {displayedBatches.map(batch => {
                        const effectiveStage = getBatchEffectiveStage(batch);
                        const stageIdx = STAGE_ORDER.indexOf(effectiveStage);
                        const maxEpHrs = batch._maxEpHrs ?? null;
                        const hours = maxEpHrs !== null
                          ? maxEpHrs.toFixed(1)
                          : batch.start_time
                            ? ((new Date() - new Date(batch.start_time)) / 3600000).toFixed(1)
                            : '0.0';
                        return (
                          <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3 text-xs font-mono font-bold text-slate-800">{batch.batch_id}</td>
                            <td className="px-5 py-3">
                              <div className="flex gap-1 items-center">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${SKU_COLORS[batch.sku_target] || SKU_COLORS.Unassigned}`}>{batch.sku_target || '—'}</span>
                                <span className="text-[10px] text-slate-500 font-bold border border-slate-200 rounded px-1.5 py-0.5 bg-slate-100">{batch.experiment_type}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs font-semibold text-slate-700">{batch.formulations?.name || '—'} <span className="text-slate-400 ml-1">v{batch.formulations?.version}</span></td>
                            <td className="px-5 py-3">
                              <div className="w-48">
                                <div className="flex items-center gap-0.5 mb-1.5">
                                  {STAGE_ORDER.slice(0, 7).map((stage, idx) => (
                                    <div
                                      key={stage}
                                      title={STAGE_LABELS[stage]}
                                      className={`h-1.5 flex-1 rounded-full transition-all ${
                                        idx < stageIdx ? 'bg-navy' :
                                        idx === stageIdx ? 'bg-amber-500 animate-pulse' :
                                        'bg-slate-100'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{STAGE_LABELS[effectiveStage] || effectiveStage}</p>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-black text-slate-800 tabular-nums">
                              {hours}<span className="text-[10px] font-bold text-slate-400">h</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <Link href={`/batches/${batch.id}`} className="inline-flex items-center text-[10px] font-bold text-white bg-navy hover:bg-navy-hover px-3 py-1.5 rounded-lg transition-colors">
                                View <ArrowRight className="w-3 h-3 ml-1"/>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* KANBAN VIEW */}
            {viewMode === 'kanban' && statusFilter === 'active' && (
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                {[
                  { id: 'media_prep', label: 'Media Prep', icon: Beaker, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
                  { id: 'sterilisation', label: 'Sterilisation', icon: ShieldCheck, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
                  { id: 'inoculation', label: 'Inoculation', icon: Droplets, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
                  { id: 'fermentation', label: 'Fermentation', icon: Activity, color: 'text-amber-600', bg: 'bg-amber-100', border: 'border-amber-200' },
                  { id: 'straining', label: 'Processing', icon: Filter, color: 'text-emerald-600', bg: 'bg-emerald-100', border: 'border-emerald-200' },
                  { id: 'qc_hold', label: 'QC Hold', icon: Clock, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' }
                ].map(col => {
                  // Filter batches that belong to this column
                  // "Processing" groups straining and extract_addition
                  const colBatches = displayedBatches.filter(b => {
                    const stage = getBatchEffectiveStage(b);
                    if (col.id === 'straining') return stage === 'straining' || stage === 'extract_addition';
                    return stage === col.id;
                  });
                  
                  const ColIcon = col.icon;
                  
                  return (
                    <div key={col.id} className={`min-w-[300px] w-[300px] flex-shrink-0 flex flex-col bg-slate-50/50 rounded-2xl border ${col.border} p-2 h-[calc(100vh-280px)] min-h-[500px]`}>
                      <div className="flex items-center justify-between px-3 py-2 mb-2 border-b border-slate-200/60 pb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${col.bg}`}>
                            <ColIcon className={`w-3.5 h-3.5 ${col.color}`}/>
                          </div>
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{col.label}</h3>
                        </div>
                        <span className="text-[10px] font-black bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">{colBatches.length}</span>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-3 px-1 pb-2 custom-scrollbar flex flex-col items-center">
                        {colBatches.length === 0 ? (
                          <div className="h-24 w-full border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Empty
                          </div>
                        ) : (
                          colBatches.map(batch => renderBatchCard(batch, true))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
      )}

      {/* History Table — released / rejected tabs */}
      {isHistoryView && (
      <section className="mt-4">
        <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
          <Clock className="w-4 h-4 mr-1.5 text-slate-400"/>
          {SECTION_LABELS[statusFilter]}
          {displayedBatches.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-navy text-white text-xs font-black rounded-full">{displayedBatches.length}</span>
          )}
        </h2>
        <div className="card overflow-hidden">
          <div className="md:hidden p-3 space-y-3">
            {displayedBatches.map(l => (
              <div key={l.id} className="mobile-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black font-mono text-slate-900">{l.batch_id}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-1 line-clamp-1">{l.formulations?.name || 'No recipe'}</p>
                  </div>
                  <span className={`px-2 py-1 inline-flex text-xs font-black uppercase tracking-wider rounded border ${statusFilter === 'archived' ? 'bg-slate-50 text-slate-600 border-slate-200' : l.status === 'released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                    {statusFilter === 'archived' ? 'archived' : l.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-black border ${SKU_COLORS[l.sku_target] || SKU_COLORS.Unassigned}`}>{l.sku_target || 'SKU'}</span>
                  <span className="px-1.5 py-0.5 rounded text-xs font-black bg-slate-100 text-slate-600 border border-slate-200">{l.experiment_type || 'Type'}</span>
                  <span className="px-1.5 py-0.5 rounded text-xs font-black bg-slate-50 text-slate-500 border border-slate-200">
                    {l.start_time ? format(new Date(l.start_time), 'MMM d, yyyy') : 'No date'}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {statusFilter === 'archived' && isAdmin ? (
                    <button
                      onClick={() => handlePermanentDeleteBatch(l.id)}
                      className="px-3 py-2 rounded-xl bg-red-50 text-red-700 border border-red-100 text-xs font-black"
                    >
                      Delete permanently
                    </button>
                  ) : null}
                  <Link href={`/batches/${l.id}`} className="px-3 py-2 rounded-xl bg-navy text-white text-xs font-black">
                    View
                  </Link>
                </div>
              </div>
            ))}
            {displayedBatches.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">No {statusFilter} batches.</div>
            )}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Batch ID</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">SKU / Type</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Recipe</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {displayedBatches.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5 text-xs font-mono font-bold text-slate-800">{l.batch_id}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex gap-1 items-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-black border ${SKU_COLORS[l.sku_target] || SKU_COLORS.Unassigned}`}>{l.sku_target || '—'}</span>
                        <span className="text-xs text-slate-400 font-bold">{l.experiment_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-xs font-semibold text-slate-700">{l.formulations?.name || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 inline-flex text-xs font-black uppercase tracking-wider rounded border ${statusFilter === 'archived' ? 'bg-slate-50 text-slate-600 border-slate-200' : l.status === 'released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                        {statusFilter === 'archived' ? 'archived' : l.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500 font-semibold">
                      {l.start_time ? format(new Date(l.start_time), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right space-x-3">
                      {isAdmin && statusFilter !== 'archived' ? (
                        <>
                          <button
                            onClick={(e) => { e.preventDefault(); setArchiveReason(''); setCancelConfirmId(l.id); }}
                            className="text-xs font-bold text-amber-600 hover:underline"
                          >
                            Archive
                          </button>
                          <button
                            onClick={() => handlePermanentDeleteBatch(l.id)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </>
                      ) : isAdmin && statusFilter === 'archived' ? (
                        <button
                          onClick={() => handlePermanentDeleteBatch(l.id)}
                          className="text-xs font-bold text-red-600 hover:underline"
                        >
                          Delete permanently
                        </button>
                      ) : null}
                      <Link href={`/batches/${l.id}`} className="text-xs font-bold text-accent hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {displayedBatches.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-400 font-medium">No {statusFilter} batches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}

      {/* ── New Batch Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {showNewBatchModal && (
          <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm flex justify-center items-end md:items-center z-50 p-0 md:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 28 }}
              className="bg-white md:rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden md:my-4 flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Schedule Production Batch</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Only Approved formulations can be used
                  </p>
                </div>
                <button
                  onClick={() => { setShowNewBatchModal(false); setBatchError(null); }}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4"/>
                </button>
              </div>

              <form onSubmit={handleSubmit(handleBatchSubmit)} className="p-4 md:p-6 space-y-5 overflow-y-auto">

                {/* Server Error */}
                {batchError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/>
                    <p className="text-sm font-bold text-red-800">{batchError.message}</p>
                  </div>
                )}

                {/* No approved recipes warning */}
                {formulations.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
                    <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2"/>
                    <p className="text-sm font-bold text-amber-800">No Approved Formulations</p>
                    <p className="text-xs text-amber-600 mt-1">Create and approve a recipe before scheduling a batch.</p>
                    <Link href="/formulations" className="block mt-3 text-xs font-bold text-amber-700 underline">
                      Go to Recipe Manager →
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* ── Row 1: Approved Recipe — Searchable Combobox (1B) ── */}
                    <div className="relative">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Approved Formulation <span className="text-emerald-600">✓ Approved Only</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search formulation..."
                          value={formulationSearch}
                          onFocus={() => setFormulationDropOpen(true)}
                          onChange={e => { setFormulationSearch(e.target.value); setFormulationDropOpen(true); }}
                          onBlur={() => setTimeout(() => setFormulationDropOpen(false), 150)}
                          className="w-full border border-slate-200 rounded-xl p-3 outline-none bg-white font-semibold text-slate-800 text-sm focus:ring-2 focus:ring-navy/20"
                        />
                        {formulationDropOpen && (
                          <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                            {formulations
                              .filter(f => `${f.code} ${f.name}`.toLowerCase().includes(formulationSearch.toLowerCase()))
                              .map(f => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onMouseDown={() => {
                                    setValue('formulation_id', f.id, { shouldValidate: true });
                                    setFormulationSearch(`${f.code} — ${f.name} (v${f.version})`);
                                    setFormulationDropOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-navy/5 transition-colors ${
                                    watchFormulationId === f.id ? 'bg-navy/5 font-bold text-navy' : 'text-slate-800'
                                  }`}
                                >
                                  <span className="font-mono font-bold text-navy text-xs mr-2">{f.code}</span>
                                  {f.name} <span className="text-slate-400 text-xs">v{f.version}</span>
                                </button>
                              ))
                            }
                            {formulations.filter(f => `${f.code} ${f.name}`.toLowerCase().includes(formulationSearch.toLowerCase())).length === 0 && (
                              <p className="px-4 py-3 text-xs text-slate-400">No matching formulations</p>
                            )}
                          </div>
                        )}
                        {/* Hidden input registers the value with react-hook-form */}
                        <input type="hidden" {...register('formulation_id')} />
                      </div>
                      {errors.formulation_id && <p className="text-xs text-red-600 mt-1 font-semibold">{errors.formulation_id.message}</p>}
                      {batchIdPreview && (
                        <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Batch ID will be</span>
                          <span className="font-black font-mono text-slate-800 text-sm tracking-tight">{batchIdPreview}</span>
                        </div>
                      )}
                    </div>

                    {/* ── Row 2: Experiment Type + SKU Target ──── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Experiment Type
                        </label>
                        <select
                          {...register('experiment_type')}
                          className="w-full border border-slate-200 rounded-xl p-3 outline-none bg-white font-semibold text-slate-800 text-sm focus:ring-2 focus:ring-navy/20"
                        >
                          {experimentTypes.map(et => (
                            <option key={et.value} value={et.value}>{et.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          SKU Target
                        </label>
                        <select
                          {...register('sku_target')}
                          className="w-full border border-slate-200 rounded-xl p-3 outline-none bg-white font-semibold text-slate-800 text-sm focus:ring-2 focus:ring-navy/20"
                        >
                          {skuTargets.map(st => (
                            <option key={st.value} value={st.value}>{st.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Kavuni note for F2 */}
                    {watchExperimentType === 'F2' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 text-xs font-semibold text-slate-700"
                      >
                        🌾 F2 run — Karuppu Kavuni fields will appear in the Media Prep stage.
                      </motion.div>
                    )}

                    {/* ── Row 3: Volume + Flasks ────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Planned Volume (ml)
                        </label>
                        <input
                          type="number"
                          {...register('planned_volume_ml')}
                          className="w-full border border-slate-200 rounded-xl p-3 outline-none text-sm font-semibold focus:ring-2 focus:ring-navy/20"
                          placeholder="250"
                        />
                        {errors.planned_volume_ml && <p className="text-xs text-red-600 mt-1">{errors.planned_volume_ml.message}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Number of Independent Trials / Runs
                        </label>
                        <input
                          type="number"
                          min={1} max={10}
                          {...register('num_flasks')}
                          className="w-full border border-slate-200 rounded-xl p-3 outline-none text-sm font-semibold focus:ring-2 focus:ring-navy/20"
                          placeholder="e.g. 5"
                        />
                        <p className="text-xs text-slate-400 mt-1">Generates independent tracks for testing different parameters</p>
                      </div>
                    </div>

                    {/* ── Row 4: Planned Start Date ─────────────── */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        <Calendar className="w-3 h-3 inline mr-1"/>Planned Start Date
                      </label>
                      <input
                        type="date"
                        {...register('planned_start_date')}
                        className="w-full border border-slate-200 rounded-xl p-3 outline-none text-sm font-semibold focus:ring-2 focus:ring-navy/20"
                      />
                    </div>

                    {/* ── Row 5: Notes ──────────────────────────── */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Pre-Batch Notes / Special Instructions
                      </label>
                      <textarea
                        {...register('notes')}
                        rows={2}
                        className="w-full border border-slate-200 rounded-xl p-3 outline-none text-sm font-semibold resize-none focus:ring-2 focus:ring-navy/20"
                        placeholder="Any special instructions for this run..."
                      />
                    </div>

                    {/* ── Submit ────────────────────────────────── */}
                    <div className="pt-1 space-y-2">
                      <button
                        disabled={creatingBatch || formulations.length === 0}
                        type="submit"
                        className="w-full text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-sm bg-navy hover:bg-navy-hover disabled:bg-slate-300 disabled:cursor-not-allowed"
                      >
                        {creatingBatch ? (
                          <><Loader2 className="w-4 h-4 animate-spin"/> Scheduling batch...</>
                        ) : (
                          <><Zap className="w-4 h-4"/> Schedule Batch</>
                        )}
                      </button>
                      <p className="text-xs font-bold text-slate-400 text-center uppercase tracking-widest">
                        Inventory deduction happens at Media Prep when lots are selected
                      </p>
                    </div>
                  </>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Cancel Batch Confirmation Modal ──────────────────── */}
      <AnimatePresence>
        {cancelConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/10 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-red-100 p-6 w-full max-w-sm"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-red-50 rounded-xl shrink-0">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Archive this batch?</h3>
                  <p className="text-xs text-slate-500 mt-1">It will be hidden from active lists. Permanent delete is available only from Archived.</p>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Reason for Archiving</label>
                <input
                  type="text"
                  placeholder="Required..."
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-red-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setCancelConfirmId(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Keep Batch
                </button>
                <button
                  disabled={!archiveReason.trim()}
                  onClick={() => { const id = cancelConfirmId; setCancelConfirmId(null); handleCancelBatch(id, archiveReason); }}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50"
                >
                  Archive Batch
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
