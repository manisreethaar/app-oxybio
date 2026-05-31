'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Calendar, Thermometer, FlaskConical, Plus, ChevronRight, Loader2, AlertCircle, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import EditRequestButton from '@/components/ui/EditRequestButton';
import CreatorBadge from '@/components/ui/CreatorBadge';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
const ShelfLifeLineChart = dynamic(() => import('@/components/charts/ShelfLifeLineChart'), { ssr: false });

export default function ShelfLifePage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [studies, setStudies] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingConclude, setPendingConclude] = useState(null);
  const [activeStudy, setActiveStudy] = useState(null);
  const [logForm, setLogForm] = useState({ day_number: 7, test_data: {} });
  const [logSubmitting, setLogSubmitting] = useState(false);
  const isAdmin = ['admin', 'ceo', 'cto'].includes(employeeProfile?.role);
  const [pendingIds, setPendingIds] = useState(new Set());

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    resolver: zodResolver(z.object({
      batch_id: z.string().uuid('Invalid batch ID').min(1, 'Select a batch'),
      flask_id: z.string().optional(),
      storage_condition: z.string().min(1),
      test_parameters: z.array(z.string()).min(1),
      start_date: z.string().min(1)
    })),
    defaultValues: {
      batch_id: '', flask_id: '', storage_condition: 'Refrigerated (4°C)',
      test_parameters: ['pH', 'CFU', 'Sensory', 'Color'],
      start_date: new Date().toISOString().split('T')[0]
    }
  });

  const watchedCondition = watch('storage_condition');
  const selectedBatchId = watch('batch_id');
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: studyData, error: studyErr }, { data: batchData }] = await Promise.all([
        supabase
          .from('shelf_life_studies')
          .select('*, created_by, creator:employees!shelf_life_studies_created_by_fkey(id, full_name, initials), batches(id, batch_id, variant, experiment_type), shelf_life_logs(id, day_number, test_data, logged_by, created_at)')
          .order('created_at', { ascending: false }),
        supabase
          .from('batches')
          .select('id, batch_id, variant, experiment_type, batch_flasks(id, flask_label, status, current_stage)')
          .eq('status', 'released')
          .limit(100),
      ]);
      if (studyErr) throw studyErr;
      setStudies(studyData || []);
      setBatches(batchData || []);
    } catch (err) { console.error('Shelf-life fetch error:', err); }
    finally { setLoading(false); }
  }, [supabase]);

  const fetchPendingIds = async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  };

  useEffect(() => {
    fetchData();
    fetchPendingIds();
  }, [fetchData]);

  const handleDeleteStudy = async (id) => {
    if (!confirm('Are you sure you want to delete this study and all its logs?')) return;
    try {
      const res = await fetch(`/api/shelf-life/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete study');
      toast.success('Study deleted');
      fetchData();
    } catch (err) { toast.error(err.message); }
  };

  const getLogForDay = (study, day) => (study?.shelf_life_logs || []).find(log => log.day_number === day);
  const activeDayLog = activeStudy ? getLogForDay(activeStudy, logForm.day_number) : null;
  const canSaveActiveLog = !activeDayLog || isAdmin;

  const selectLogDay = (day) => {
    const existing = getLogForDay(activeStudy, day);
    setLogForm({ day_number: day, test_data: existing?.test_data || {} });
  };

  const handleSaveLog = async () => {
    if (!activeStudy || logSubmitting) return;
    if (!canSaveActiveLog) {
      toast.error('Only admins can modify existing stability logs.');
      return;
    }
    setLogSubmitting(true);
    try {
      const res = await fetch(`/api/shelf-life/${activeStudy.id}/log`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logForm)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save log');
      toast.success('Log saved');
      setActiveStudy(null);
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setLogSubmitting(false); }
  };

  const openLogModal = (study) => {
    const completedDays = new Set((study.shelf_life_logs || []).map(log => log.day_number));
    const nextDay = TIMEPOINTS.find(day => !completedDays.has(day)) ?? TIMEPOINTS[0];
    const existing = getLogForDay(study, nextDay);
    setLogForm({ day_number: nextDay, test_data: existing?.test_data || {} });
    setActiveStudy(study);
  };

  const handleStudySubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/shelf-life', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create study');
      setShowNew(false); reset(); fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const concludeStudy = (id) => {
    setPendingConclude(id);
  };

  const confirmConclude = async () => {
    if (!pendingConclude) return;
    const id = pendingConclude;
    setPendingConclude(null);
    try {
      const res = await fetch('/api/shelf-life', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'Completed' })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to conclude study');
      fetchData();
    } catch (err) { toast.error(err.message); }
  };

  const TIMEPOINTS = [0, 7, 14, 30, 60, 90];
  const selectedBatch = batches.find(batch => batch.id === selectedBatchId);
  const selectedFlasks = selectedBatch?.batch_flasks || [];

  if (authLoading) return <div className="page-container space-y-6"><Skeleton width={300} height={40}/><Skeleton className="h-64 w-full rounded-2xl"/></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Stability &amp; Shelf-Life</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Time-Series Product Validation</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> Start New Study
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {loading ? (
          <div className="col-span-full space-y-4">
            <Skeleton className="h-64 w-full rounded-2xl"/>
            <Skeleton className="h-64 w-full rounded-2xl"/>
          </div>
        ) : studies.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm font-medium text-gray-400">No active stability studies. Select a released batch to begin longevity testing.</div>
        ) : (
          studies.map((study) => {
            const chartData = (study.shelf_life_logs || []).map(log => ({
              day: `D${log.day_number}`,
              ph: (log.test_data || {}).pH || 0,
              brix: (log.test_data || {}).Brix || 0
            })).sort((a,b) => parseInt(a.day.slice(1)) - parseInt(b.day.slice(1)));

            // Fallback if no logs exist yet
            const displayData = chartData.length > 0 ? chartData : [{ day: 'D0', ph: 4.2, brix: 10 }];

            return (
              <div key={study.id} className="surface p-6 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-100 mb-2 inline-block">Study ID: {study.id.slice(0,8).toUpperCase()}</span>
                    {study.batches?.id ? (
                      <Link href={`/batches/${study.batches.id}`} className="text-lg font-bold text-gray-900 hover:text-navy hover:underline transition-colors">
                        {study.batches.batch_id}
                      </Link>
                    ) : (
                      <h3 className="text-lg font-bold text-gray-900">{study.batches?.batch_id}</h3>
                    )}
                    <p className="text-xs font-semibold text-gray-500 mt-1">{study.batches?.variant} | {study.storage_condition}{study.flask_id ? ' | Flask: ' + study.flask_id : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Status</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${study.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                      {study.status}
                    </span>
                  </div>
                </div>

                <div className="h-44 w-full mb-6 bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-3 flex justify-between">
                    Stability Analytics <span>{study.status}</span>
                  </p>
                  <ShelfLifeLineChart data={displayData} />
                </div>

                <div className="grid grid-cols-6 gap-2 mb-8">
                  {TIMEPOINTS.map((tp) => {
                    const logExists = (study.shelf_life_logs || []).some(l => l.day_number === tp);
                    return (
                      <div key={tp} className="text-center group">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 group-hover:text-navy">D{tp}</p>
                        <div className={`aspect-square rounded-lg border flex items-center justify-center transition-all ${logExists ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                          {logExists ? <CheckCircle2 className="w-4 h-4"/> : <Clock className="w-4 h-4"/>}
                        </div>
                      </div>
                    );
                  })}
                </div>


              {study.creator && (
                <div className="flex items-center gap-1.5 mb-3">
                  <CreatorBadge initials={study.creator.initials} fullName={study.creator.full_name} size="sm"/>
                  <span className="text-[10px] text-gray-400 font-medium">by {study.creator.full_name}</span>
                </div>
              )}
              <div className="flex gap-2">
                {study.status !== 'Completed' && isAdmin && (
                  <button onClick={() => concludeStudy(study.id)} className="flex-1 py-2.5 bg-white border border-red-100 text-[10px] font-bold uppercase tracking-wider text-red-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all focus:outline-none">
                    Conclude
                  </button>
                )}
                {isAdmin && (
                  <button onClick={() => handleDeleteStudy(study.id)} className="px-3 py-2.5 bg-white border border-red-100 text-red-500 rounded-lg hover:bg-red-50 transition-all" title="Delete study">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {!isAdmin && study.created_by === employeeProfile?.id && (
                  <EditRequestButton
                    tableName="shelf_life_studies"
                    recordId={study.id}
                    moduleLabel="Shelf Life"
                    fields={[
                      { key: 'storage_condition', label: 'Storage Condition' },
                    ]}
                    currentData={study}
                    hasPending={pendingIds.has(study.id)}
                    allowDelete={study.status !== 'Completed'}
                    onSuccess={() => { fetchData(); fetchPendingIds(); }}
                  />
                )}
                <button onClick={() => openLogModal(study)} className="flex-[2] py-2.5 bg-navy text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-navy-hover transition-all flex items-center justify-center gap-2">
                  Open Log &amp; Parameters <ChevronRight className="w-4 h-4 opacity-50" />
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">Stability Protocol</h2>
              <p className="text-xs font-medium text-gray-500 mt-1">Initialize T-Series Data Collection</p>
            </div>
            <form onSubmit={handleSubmit(handleStudySubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Released Batch</label>
                <select {...register('batch_id')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all">
                  <option value="">Select Released Batch...</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.batch_id}{b.variant ? ` · ${b.variant}` : ''}{b.experiment_type ? ` [${b.experiment_type}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {selectedFlasks.length > 0 ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Flask / Trial</label>
                  <select {...register('flask_id')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all">
                    <option value="">Batch-level study</option>
                    {selectedFlasks.map(flask => (
                      <option key={flask.id} value={flask.flask_label}>
                        {flask.flask_label}{flask.status ? ` | ${flask.status}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 font-semibold mt-1">Create separate stability records for F1, F2, F3 when results differ by flask.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Flask ID (Optional)</label>
                  <input type="text" {...register('flask_id')} placeholder="e.g. F1, F2" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Storage Condition</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Refrigerated (4°C)', 'Ambient (25°C)', 'Accelerated (40°C)'].map(c => (
                    <button key={c} type="button" onClick={() => setValue('storage_condition', c, { shouldValidate: true })} className={`px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${watchedCondition === c ? 'bg-navy border-navy text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {c.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => { setShowNew(false); reset(); }} className="flex-1 py-2.5 bg-gray-100 text-gray-500 font-bold uppercase tracking-wider text-xs rounded-lg hover:bg-gray-200 transition-all">Cancel</button>
                <button disabled={submitting} type="submit" className="flex-[2] py-2.5 bg-navy text-white font-bold uppercase tracking-wider text-xs rounded-lg shadow-sm hover:bg-navy-hover transition-all flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Initialize Study'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {/* Log Modal */}
      {activeStudy && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Log Data for {activeStudy.batches?.batch_id}</h3>
                <p className="text-xs text-gray-500">Enter test data for a specific timepoint</p>
              </div>
              <button onClick={() => setActiveStudy(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Timepoint (Day)</label>
                <div className="flex flex-wrap gap-2">
                  {[0, 7, 14, 30, 60, 90].map(d => (
                    <button key={d} onClick={() => selectLogDay(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${logForm.day_number === d ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      D{d}
                    </button>
                  ))}
                </div>
                {activeDayLog && !isAdmin && (
                  <p className="text-[10px] font-semibold text-amber-600 mt-2">This day is already logged. Only admins can modify existing stability data.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                {(activeStudy.test_parameters || []).map(param => (
                  <div key={param}>
                    <label className="block text-xs font-bold text-gray-700 mb-1">{param}</label>
                    <input type="text" 
                      value={logForm.test_data[param] || ''}
                      onChange={e => setLogForm(p => ({ ...p, test_data: { ...p.test_data, [param]: e.target.value } }))}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                      placeholder={`Enter ${param}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3">
              <button onClick={() => setActiveStudy(null)} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold uppercase rounded-lg hover:bg-gray-100 transition">Cancel</button>
              <button disabled={logSubmitting || !canSaveActiveLog} onClick={handleSaveLog} className="flex-[2] py-2.5 bg-navy text-white text-xs font-bold uppercase rounded-lg shadow hover:bg-navy-hover transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {logSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Save Log Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conclude Study Modal */}
      {pendingConclude && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Conclude Study</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Are you sure you want to conclude this stability study? It will be marked as Completed.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingConclude(null)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmConclude}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition w-full shadow-[0_0_10px_rgba(245,158,11,0.2)]"
              >
                ✓ Conclude
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
