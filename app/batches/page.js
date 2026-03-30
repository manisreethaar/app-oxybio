'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { FlaskConical, Plus, AlertTriangle, ArrowRight, Loader2, X, CheckCircle2, Package } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

const STAGE_ORDER = ['media_prep', 'sterilisation', 'inoculation', 'fermentation', 'harvest', 'downstream', 'qc_hold'];
const STAGE_LABELS = {
  media_prep: 'Media Prep',
  sterilisation: 'Sterilisation',
  inoculation: 'Inoculation',
  fermentation: 'Fermentation',
  harvest: 'Harvest',
  downstream: 'Downstream',
  qc_hold: 'QC Hold',
  released: 'Released',
  rejected: 'Rejected'
};

const STATUS_COLORS = {
  planned: 'bg-blue-50 text-blue-700 border-blue-100',
  fermenting: 'bg-amber-50 text-amber-700 border-amber-100',
  'qc-hold': 'bg-purple-50 text-purple-700 border-purple-100',
  released: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  deviation: 'bg-red-50 text-red-700 border-red-100',
};

export default function BatchesPage() {
  const { employeeProfile, role, canDo, loading: authLoading } = useAuth();
  const [activeBatches, setActiveBatches] = useState([]);
  const [history, setHistory] = useState([]);
  const [isAlert, setIsAlert] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(true);

  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [formulations, setFormulations] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchError, setBatchError] = useState(null); // { message, shortfalls }

  const { register, handleSubmit, reset, watch } = useForm({
    resolver: zodResolver(z.object({
      variant: z.string().min(1),
      formulation_id: z.string().uuid('Select a formulation'),
      equipment_id: z.string().uuid('Select critical equipment')
    })),
    defaultValues: { variant: 'O2B-Agri', formulation_id: '', equipment_id: '' }
  });

  const selectedEquip = watch('equipment_id');
  const activeEquipObj = useMemo(() => equipment.find(e => e.id === selectedEquip), [equipment, selectedEquip]);
  const isEquipInvalid = useMemo(() => {
    if (!activeEquipObj) return false;
    return activeEquipObj.status !== 'Operational' ||
      (activeEquipObj.calibration_due_date && new Date(activeEquipObj.calibration_due_date) < new Date());
  }, [activeEquipObj]);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetchBatches(); fetchFormulations(); fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    try {
      const { data, error } = await supabase.from('equipment').select('id, name, status, calibration_due_date').order('name');
      if (!error) setEquipment(data || []);
    } catch (err) { console.error('Fetch equipment error:', err); }
  };

  const fetchFormulations = async () => {
    try {
      // Only approved recipes can be used to start batches — system law
      const { data, error } = await supabase
        .from('formulations')
        .select('id, name, code, version, status')
        .eq('status', 'Approved')
        .order('created_at', { ascending: false });
      if (!error) setFormulations(data || []);
    } catch (err) { console.error('Fetch formulations error:', err); }
  };

  const fetchBatches = async () => {
    setLoadingBatches(true);
    try {
      const [activeRes, completedRes] = await Promise.all([
        supabase.from('batches')
          .select('*, formulations(name, code, version), ph_readings(ph_value, is_deviation, deviation_acknowledged)')
          .not('status', 'in', '("released","rejected")')
          .order('start_time', { ascending: false }),
        supabase.from('batches')
          .select('*, formulations(name, code)')
          .in('status', ['released', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(15)
      ]);

      const active = activeRes.data || [];
      const completed = completedRes.data || [];

      const hasDeviation = active.some(b => b.ph_readings?.some(ph => ph.is_deviation && !ph.deviation_acknowledged));
      setIsAlert(hasDeviation);
      setActiveBatches(active);
      setHistory(completed);
    } catch (err) {
      console.error('Fetch batches error:', err);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleBatchSubmit = async (data) => {
    if (isEquipInvalid) return;
    setBatchError(null);
    setCreatingBatch(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (!res.ok) {
        setBatchError({
          message: resData.error || 'Failed to start batch',
          shortfalls: resData.shortfalls || null
        });
        return;
      }
      setShowNewBatchModal(false); reset(); setBatchError(null); fetchBatches();
    } catch (err) {
      setBatchError({ message: err.message, shortfalls: null });
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleCancelBatch = async (id) => {
    if (!confirm('Cancel this batch? All reserved materials will be returned to inventory and tasks will be removed. This action is permanent.')) return;
    try {
      const res = await fetch(`/api/batches?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveBatches(prev => prev.filter(b => b.id !== id));
      alert("Batch cancelled. Materials restored to stock.");
    } catch (err) {
      alert("Failed to cancel batch: " + err.message);
    }
  };

  if (authLoading || loadingBatches) {
    return (
      <div className="page-container space-y-8">
        <div className="flex justify-between items-center"><Skeleton width={200} height={32}/> <Skeleton width={120} height={40}/></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-48 w-full rounded-2xl"/>)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {isAlert && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center text-red-800 text-sm font-bold">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-600" /> CCP DEVIATION DETECTED: Immediate review required!
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Production Batches</h1>
          <p className="text-sm text-gray-500 mt-1">Track fermentations, stages, and record CCP logs.</p>
        </div>
        {canDo('batches', 'create') && (
          <button onClick={() => { reset(); setBatchError(null); setShowNewBatchModal(true); }} className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider">
            <Plus className="w-4 h-4 mr-1" /> New Batch
          </button>
        )}
      </div>

      {/* Active Batches */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
          <FlaskConical className="w-4 h-4 mr-1.5 text-navy" /> Active &amp; In-Progress Batches
        </h2>
        {activeBatches.length === 0 ? (
          <div className="surface p-8 text-center text-gray-400 font-medium text-sm">No active batches running.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeBatches.map(batch => {
              const latestPh = batch.ph_readings?.[batch.ph_readings.length - 1];
              const hours = differenceInHours(new Date(), new Date(batch.start_time));
              const isDev = latestPh?.is_deviation && !latestPh?.deviation_acknowledged;
              const currentStageIdx = STAGE_ORDER.indexOf(batch.current_stage);

              return (
                <div key={batch.id} className={`surface overflow-hidden flex flex-col hover:border-gray-300 transition-colors ${isDev ? 'border-red-300 bg-red-50/10' : ''}`}>
                  <div className="px-6 py-4 flex justify-between items-start border-b border-gray-100 bg-gray-50/30">
                    <div>
                      <p className="font-mono text-base font-black text-gray-900 tracking-wider mb-1">{batch.batch_id}</p>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[batch.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {isDev ? 'DEVIATION' : batch.status}
                      </span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Elapsed</p>
                        {(['admin', 'ceo', 'cto'].includes(role) || employeeProfile?.email === 'manisreethaar@gmail.com') && (
                          <button 
                            onClick={(e) => { e.preventDefault(); handleCancelBatch(batch.id); }} 
                            className="p-1 rounded bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all border border-gray-200"
                            title="Cancel Batch"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-xl font-black text-gray-800">{hours} <span className="text-xs">HRS</span></p>
                    </div>
                  </div>

                  {/* Stage Progress Bar */}
                  <div className="px-4 pt-3">
                    <div className="flex items-center gap-0.5">
                      {STAGE_ORDER.map((stage, idx) => (
                        <div
                          key={stage}
                          title={STAGE_LABELS[stage]}
                          className={`h-1.5 flex-1 rounded-full transition-all ${
                            idx < currentStageIdx ? 'bg-navy' :
                            idx === currentStageIdx ? 'bg-amber-500 animate-pulse' :
                            'bg-gray-100'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">
                      Stage: {STAGE_LABELS[batch.current_stage] || batch.current_stage}
                    </p>
                  </div>

                  <div className="px-6 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Latest pH</p>
                      {latestPh ? <p className={`text-2xl font-black tracking-tighter tabular-nums ${latestPh.is_deviation ? 'text-red-600' : 'text-emerald-600'}`}>{latestPh.ph_value}</p> : <p className="text-base font-bold text-gray-300">—</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Recipe</p>
                      <p className="text-xs font-bold text-gray-700">{batch.formulations?.name || '—'}</p>
                      <p className="text-[9px] text-gray-400">v{batch.formulations?.version || '1'}</p>
                    </div>
                  </div>

                  <Link href={`/batches/${batch.id}`} className={`w-full py-3 flex justify-center items-center text-xs font-bold transition-colors border-t border-gray-100 ${isDev ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-50/50 hover:bg-gray-100 text-navy'}`}>
                    {isDev ? 'Review Deviation' : 'Continue Batch'} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* History */}
      <section className="mt-12">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Batch History &amp; QC</h2>
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Batch ID</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recipe</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {history.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 text-xs font-mono font-bold text-gray-800">{l.batch_id}</td>
                    <td className="px-6 py-3.5 text-xs font-semibold text-gray-700">{l.formulations?.name || '—'}</td>
                    <td className="px-6 py-3.5"><span className={`px-2 py-0.5 inline-flex text-[9px] font-black uppercase tracking-wider rounded border ${l.status === 'released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{l.status}</span></td>
                    <td className="px-6 py-3.5 text-xs text-gray-500 font-semibold">{l.start_time ? format(new Date(l.start_time), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-6 py-3.5 text-right"><Link href={`/batches/${l.id}`} className="text-xs font-bold text-accent hover:underline">View Report</Link></td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan="5" className="px-6 py-8 text-center text-xs text-gray-400 font-medium">No completed batches found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* New Batch Modal */}
      <AnimatePresence>
        {showNewBatchModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h2 className="text-base font-bold text-gray-900 tracking-tight">Initialize Production Batch</h2>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">System will validate inventory before proceeding</p>
                </div>
                <button onClick={() => { setShowNewBatchModal(false); setBatchError(null); }} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit(handleBatchSubmit)} className="p-6 space-y-4">
                {/* Inventory Error Display */}
                {batchError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-sm font-bold text-red-800">{batchError.message}</p>
                    </div>
                    {batchError.shortfalls && batchError.shortfalls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] font-black text-red-700 uppercase tracking-widest">Missing Materials:</p>
                        {batchError.shortfalls.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs font-bold bg-white rounded-lg px-3 py-2 border border-red-100">
                            <span className="flex items-center gap-1.5"><Package className="w-3 h-3 text-red-500"/>{s.item}</span>
                            <span className="text-red-600">Need {s.required} {s.unit} / Have {s.available} {s.unit}</span>
                          </div>
                        ))}
                        <Link href="/inventory" className="block mt-2 text-center text-xs font-bold text-red-700 underline">Go to Inventory →</Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Approved Recipes Note */}
                {formulations.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm font-bold text-amber-800">No approved recipes available.</p>
                    <p className="text-xs text-amber-600 mt-1">Create and get a recipe approved before starting a batch.</p>
                    <Link href="/formulations" className="block mt-2 text-xs font-bold text-amber-700 underline">Go to Recipe Manager →</Link>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Approved Recipe <span className="text-emerald-600">✓ Approved Only</span>
                      </label>
                      <select {...register('formulation_id')} className="w-full border border-gray-200 rounded-xl p-3 outline-none bg-white font-semibold text-gray-800 text-sm">
                        <option value="">Select Approved Version...</option>
                        {formulations.map(f => <option key={f.id} value={f.id}>{f.code} — {f.name} (v{f.version})</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Critical Equipment</label>
                      <select {...register('equipment_id')} className={`w-full border rounded-xl p-3 outline-none bg-white font-semibold text-sm ${isEquipInvalid ? 'border-red-400 text-red-600' : 'border-gray-200 text-gray-800'}`}>
                        <option value="">Select Primary Unit...</option>
                        {equipment.map(e => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.status}) {e.calibration_due_date && new Date(e.calibration_due_date) < new Date() ? '— CALIB EXPIRED' : ''}
                          </option>
                        ))}
                      </select>
                      {isEquipInvalid && (
                        <p className="text-[10px] text-red-600 font-black uppercase mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Auto-Inhibitor Active: Equipment non-compliant
                        </p>
                      )}
                    </div>

                    <div className="pt-2 space-y-2">
                      <button
                        disabled={creatingBatch || isEquipInvalid || formulations.length === 0}
                        type="submit"
                        className={`w-full text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-sm ${isEquipInvalid ? 'bg-gray-300 cursor-not-allowed' : 'bg-navy hover:bg-navy-hover'}`}
                      >
                        {creatingBatch ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Validating inventory...</>
                        ) : (
                          <><CheckCircle2 className="w-4 h-4" /> Validate &amp; Start Batch</>
                        )}
                      </button>
                      <p className="text-[9px] font-bold text-gray-400 text-center uppercase tracking-widest">
                        System will check inventory before proceeding
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
