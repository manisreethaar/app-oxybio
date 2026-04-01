'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  FlaskConical, Plus, AlertTriangle, ArrowRight, Loader2, X,
  CheckCircle2, Trash2, Clock, Beaker, Activity, Users, Calendar,
  ChevronRight, Zap
} from 'lucide-react';
import { format, differenceInHours, differenceInDays } from 'date-fns';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Stage Config ────────────────────────────────────────────
const STAGE_ORDER = [
  'media_prep', 'sterilisation', 'inoculation', 'fermentation',
  'straining', 'extract_addition', 'qc_hold'
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
  CLARITY:    'bg-blue-50 text-blue-700 border-blue-200',
  MOMENTUM:   'bg-amber-50 text-amber-700 border-amber-200',
  VITALITY:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  Unassigned: 'bg-gray-100 text-gray-500 border-gray-200',
};

// ─── Status Colors ────────────────────────────────────────────
const STATUS_COLORS = {
  scheduled:   'bg-blue-50 text-blue-700 border-blue-100',
  planned:     'bg-blue-50 text-blue-700 border-blue-100',
  in_progress: 'bg-orange-50 text-orange-700 border-orange-100',
  fermenting:  'bg-amber-50 text-amber-700 border-amber-100',
  qc_hold:     'bg-purple-50 text-purple-700 border-purple-100',
  'qc-hold':   'bg-purple-50 text-purple-700 border-purple-100',
  released:    'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected:    'bg-red-50 text-red-700 border-red-100',
  deviation:   'bg-red-50 text-red-700 border-red-100',
};

// ─── Validation Schema ───────────────────────────────────────
const batchSchema = z.object({
  formulation_id:    z.string().uuid('Select an approved formulation'),
  experiment_type:   z.enum(['F1', 'F2', 'PROTO', 'SHELF'], { required_error: 'Select experiment type' }),
  sku_target:        z.enum(['CLARITY', 'MOMENTUM', 'VITALITY', 'Unassigned']).default('Unassigned'),
  planned_volume_ml: z.preprocess(Number, z.number().positive('Enter a valid volume')),
  num_flasks:        z.preprocess(Number, z.number().int().min(1).max(10).default(3)),
  planned_start_date: z.string().optional(),
  notes:             z.string().optional(),
});

export default function BatchesPage() {
  const { employeeProfile, role, canDo, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [activeBatches,    setActiveBatches]    = useState([]);
  const [history,          setHistory]          = useState([]);
  const [isAlert,          setIsAlert]          = useState(false);
  const [loadingBatches,   setLoadingBatches]   = useState(true);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [formulations,     setFormulations]     = useState([]);
  const [creatingBatch,    setCreatingBatch]    = useState(false);
  const [batchError,       setBatchError]       = useState(null); // { message, warnings }
  const [statusFilter,     setStatusFilter]     = useState('active');

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      experiment_type:   'F1',
      sku_target:        'Unassigned',
      planned_volume_ml: 250,
      num_flasks:        3,
    },
  });

  const watchExperimentType = watch('experiment_type');

  // ─── Data Fetching ─────────────────────────────────────────
  const fetchBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const [activeRes, completedRes] = await Promise.all([
        supabase
          .from('batches')
          .select(`
            id, batch_id, experiment_type, sku_target, status, current_stage,
            planned_volume_ml, num_flasks, planned_start_date, start_time, created_at, assigned_team,
            formulations(name, code, version),
            batch_flasks(id, flask_label, status),
            batch_fermentation_readings(ph, is_ph_alarm, is_temp_alarm, logged_at)
          `)
          .not('status', 'in', '("released","rejected")')
          .order('created_at', { ascending: false }),
        supabase
          .from('batches')
          .select('id, batch_id, experiment_type, sku_target, status, start_time, formulations(name, code)')
          .in('status', ['released', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const active    = activeRes.data    || [];
      const completed = completedRes.data || [];

      const hasAlarm = active.some(b =>
        b.batch_fermentation_readings?.some(r => r.is_ph_alarm || r.is_temp_alarm)
      );
      setIsAlert(hasAlarm);
      setActiveBatches(active);
      setHistory(completed);
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

  useEffect(() => { fetchBatches(); fetchFormulations(); }, [fetchBatches, fetchFormulations]);

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
        setBatchError({ message: resData.error || 'Failed to create batch', warnings: null });
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
  const handleCancelBatch = async (id) => {
    if (!confirm('Cancel this batch? Tasks will be deleted. This is permanent.')) return;
    try {
      const res  = await fetch(`/api/batches?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveBatches(prev => prev.filter(b => b.id !== id));
      toast.success('Batch cancelled.');
    } catch (err) {
      toast.error('Failed to cancel batch: ' + err.message);
    }
  };

  // ─── Loading State ────────────────────────────────────────
  if (authLoading || loadingBatches) {
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

  // ─── Filtered batches ────────────────────────────────────
  const displayedActive = activeBatches;

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Production Batches</h1>
          <p className="text-sm text-gray-500 mt-1">
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
      <div className="flex gap-2 flex-wrap mt-6">
        {['active', 'scheduled', 'released', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${statusFilter === f ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Active Batches Grid */}
      <section className="mt-4">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
          <Activity className="w-4 h-4 mr-1.5 text-navy"/>
          Active &amp; In‑Progress Batches
          {activeBatches.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-navy text-white text-[10px] font-black rounded-full">{activeBatches.length}</span>
          )}
        </h2>

        {activeBatches.length === 0 ? (
          <div className="surface p-10 text-center">
            <Beaker className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
            <p className="text-gray-400 font-medium text-sm">No active batches.</p>
            {canDo('batches', 'create') && (
              <button
                onClick={() => { reset(); setBatchError(null); setShowNewBatchModal(true); }}
                className="mt-4 px-4 py-2 bg-navy text-white text-xs font-bold rounded-lg"
              >
                + Schedule First Batch
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeBatches.map(batch => {
              const hasAlarm = batch.batch_fermentation_readings?.some(r => r.is_ph_alarm || r.is_temp_alarm);
              const hours    = batch.start_time ? differenceInHours(new Date(), new Date(batch.start_time)) : 0;
              const currentIdx = STAGE_ORDER.indexOf(batch.current_stage);
              const flasks   = batch.batch_flasks || [];

              return (
                <div
                  key={batch.id}
                  className={`surface overflow-hidden flex flex-col hover:border-gray-300 transition-all ${hasAlarm ? 'border-red-300 ring-1 ring-red-200' : ''}`}
                >
                  {/* Card Header */}
                  <div className="px-5 py-4 flex justify-between items-start border-b border-gray-100 bg-gray-50/40">
                    <div>
                      <p className="font-mono text-sm font-black text-gray-900 tracking-wider mb-1.5">{batch.batch_id}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* SKU badge */}
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${SKU_COLORS[batch.sku_target] || SKU_COLORS.Unassigned}`}>
                          {batch.sku_target}
                        </span>
                        {/* Experiment type badge */}
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">
                          {batch.experiment_type}
                        </span>
                        {/* Status badge */}
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${hasAlarm ? 'bg-red-100 text-red-700 border-red-200 animate-pulse' : STATUS_COLORS[batch.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {hasAlarm ? '⚠ Alarm' : batch.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="text-xl font-black text-gray-800 tabular-nums">{hours} <span className="text-xs font-bold text-gray-400">HRS</span></p>
                      {(['admin', 'ceo', 'cto'].includes(role) || employeeProfile?.email === 'manisreethaar@gmail.com') && (
                        <button
                          onClick={e => { e.preventDefault(); handleCancelBatch(batch.id); }}
                          className="p-1 rounded bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all border border-gray-200"
                          title="Cancel Batch"
                        >
                          <Trash2 className="w-3 h-3"/>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stage Progress Bar */}
                  <div className="px-5 pt-4 pb-2">
                    <div className="flex items-center gap-0.5 mb-1">
                      {STAGE_ORDER.map((stage, idx) => (
                        <div
                          key={stage}
                          title={STAGE_LABELS[stage]}
                          className={`h-1.5 flex-1 rounded-full transition-all ${
                            idx < currentIdx  ? 'bg-navy' :
                            idx === currentIdx ? 'bg-amber-500 animate-pulse' :
                            'bg-gray-100'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      {STAGE_LABELS[batch.current_stage] || batch.current_stage}
                    </p>
                  </div>

                  {/* Flask Status Row */}
                  <div className="px-5 py-2.5 border-t border-gray-50 flex items-center gap-2">
                    <FlaskConical className="w-3.5 h-3.5 text-gray-400 shrink-0"/>
                    <div className="flex gap-1 flex-wrap">
                      {flasks.map(f => (
                        <span
                          key={f.id}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${f.status === 'active' ? 'bg-navy/5 text-navy border-navy/20' : f.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200 line-through' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                        >
                          {f.flask_label}
                        </span>
                      ))}
                      {flasks.length === 0 && <span className="text-[10px] text-gray-400">No flasks</span>}
                    </div>
                    <span className="ml-auto text-[9px] text-gray-400 font-semibold">{batch.planned_volume_ml}ml</span>
                  </div>

                  {/* Formulation */}
                  <div className="px-5 py-2 border-t border-gray-50 flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Recipe:</span>
                    <span className="text-[10px] font-bold text-gray-700">{batch.formulations?.name || '—'}</span>
                    <span className="text-[9px] text-gray-400">v{batch.formulations?.version}</span>
                  </div>

                  {/* CTA */}
                  <Link
                    href={`/batches/${batch.id}`}
                    className={`w-full py-3 flex justify-center items-center text-xs font-bold transition-colors border-t border-gray-100 ${hasAlarm ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-50/50 hover:bg-gray-100 text-navy'}`}
                  >
                    {hasAlarm ? '⚠ Review Alarm' : 'Continue Batch'} <ArrowRight className="w-3.5 h-3.5 ml-1.5"/>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Batch History Table */}
      <section className="mt-12">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
          <Clock className="w-4 h-4 mr-1.5 text-gray-400"/>
          Batch History
        </h2>
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Batch ID</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">SKU / Type</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recipe</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Report</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {history.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 text-xs font-mono font-bold text-gray-800">{l.batch_id}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex gap-1 items-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${SKU_COLORS[l.sku_target] || SKU_COLORS.Unassigned}`}>{l.sku_target || '—'}</span>
                        <span className="text-[10px] text-gray-400 font-bold">{l.experiment_type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-xs font-semibold text-gray-700">{l.formulations?.name || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 inline-flex text-[9px] font-black uppercase tracking-wider rounded border ${l.status === 'released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-gray-500 font-semibold">
                      {l.start_time ? format(new Date(l.start_time), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link href={`/batches/${l.id}`} className="text-xs font-bold text-accent hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-xs text-gray-400 font-medium">No completed batches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── New Batch Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {showNewBatchModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden my-4"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h2 className="text-base font-bold text-gray-900 tracking-tight">Schedule Production Batch</h2>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                    Only Approved formulations can be used
                  </p>
                </div>
                <button
                  onClick={() => { setShowNewBatchModal(false); setBatchError(null); }}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-4 h-4"/>
                </button>
              </div>

              <form onSubmit={handleSubmit(handleBatchSubmit)} className="p-6 space-y-5">

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
                    {/* ── Row 1: Approved Recipe ────────────────── */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Approved Formulation <span className="text-emerald-600">✓ Approved Only</span>
                      </label>
                      <select
                        {...register('formulation_id')}
                        className="w-full border border-gray-200 rounded-xl p-3 outline-none bg-white font-semibold text-gray-800 text-sm focus:ring-2 focus:ring-navy/20"
                      >
                        <option value="">Select Approved Version...</option>
                        {formulations.map(f => (
                          <option key={f.id} value={f.id}>{f.code} — {f.name} (v{f.version})</option>
                        ))}
                      </select>
                      {errors.formulation_id && <p className="text-xs text-red-600 mt-1 font-semibold">{errors.formulation_id.message}</p>}
                    </div>

                    {/* ── Row 2: Experiment Type + SKU Target ──── */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                          Experiment Type
                        </label>
                        <select
                          {...register('experiment_type')}
                          className="w-full border border-gray-200 rounded-xl p-3 outline-none bg-white font-semibold text-gray-800 text-sm focus:ring-2 focus:ring-navy/20"
                        >
                          <option value="F1">F1 — Ragi only</option>
                          <option value="F2">F2 — Ragi + Kavuni</option>
                          <option value="PROTO">PROTO — Prototype</option>
                          <option value="SHELF">SHELF — Shelf-life run</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                          SKU Target
                        </label>
                        <select
                          {...register('sku_target')}
                          className="w-full border border-gray-200 rounded-xl p-3 outline-none bg-white font-semibold text-gray-800 text-sm focus:ring-2 focus:ring-navy/20"
                        >
                          <option value="Unassigned">Unassigned</option>
                          <option value="CLARITY">CLARITY</option>
                          <option value="MOMENTUM">MOMENTUM</option>
                          <option value="VITALITY">VITALITY</option>
                        </select>
                      </div>
                    </div>

                    {/* Kavuni note for F2 */}
                    {watchExperimentType === 'F2' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-[11px] font-semibold text-indigo-700"
                      >
                        🌾 F2 run — Karuppu Kavuni fields will appear in the Media Prep stage.
                      </motion.div>
                    )}

                    {/* ── Row 3: Volume + Flasks ────────────────── */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                          Planned Volume (ml)
                        </label>
                        <input
                          type="number"
                          {...register('planned_volume_ml')}
                          className="w-full border border-gray-200 rounded-xl p-3 outline-none text-sm font-semibold focus:ring-2 focus:ring-navy/20"
                          placeholder="250"
                        />
                        {errors.planned_volume_ml && <p className="text-xs text-red-600 mt-1">{errors.planned_volume_ml.message}</p>}
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                          Number of Flasks
                        </label>
                        <input
                          type="number"
                          min={1} max={10}
                          {...register('num_flasks')}
                          className="w-full border border-gray-200 rounded-xl p-3 outline-none text-sm font-semibold focus:ring-2 focus:ring-navy/20"
                          placeholder="3"
                        />
                        <p className="text-[9px] text-gray-400 mt-1">Default: 3 (Phase 0 standard)</p>
                      </div>
                    </div>

                    {/* ── Row 4: Planned Start Date ─────────────── */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        <Calendar className="w-3 h-3 inline mr-1"/>Planned Start Date
                      </label>
                      <input
                        type="date"
                        {...register('planned_start_date')}
                        className="w-full border border-gray-200 rounded-xl p-3 outline-none text-sm font-semibold focus:ring-2 focus:ring-navy/20"
                      />
                    </div>

                    {/* ── Row 5: Notes ──────────────────────────── */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Pre-Batch Notes / Special Instructions
                      </label>
                      <textarea
                        {...register('notes')}
                        rows={2}
                        className="w-full border border-gray-200 rounded-xl p-3 outline-none text-sm font-semibold resize-none focus:ring-2 focus:ring-navy/20"
                        placeholder="Any special instructions for this run..."
                      />
                    </div>

                    {/* ── Submit ────────────────────────────────── */}
                    <div className="pt-1 space-y-2">
                      <button
                        disabled={creatingBatch || formulations.length === 0}
                        type="submit"
                        className="w-full text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-sm bg-navy hover:bg-navy-hover disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        {creatingBatch ? (
                          <><Loader2 className="w-4 h-4 animate-spin"/> Scheduling batch...</>
                        ) : (
                          <><Zap className="w-4 h-4"/> Schedule Batch</>
                        )}
                      </button>
                      <p className="text-[9px] font-bold text-gray-400 text-center uppercase tracking-widest">
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
    </div>
  );
}
