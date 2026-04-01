'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Calendar, Thermometer, FlaskConical, Plus, ChevronRight, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
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

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    resolver: zodResolver(z.object({
      batch_id: z.string().uuid('Invalid batch ID').min(1, 'Select a batch'),
      storage_condition: z.string().min(1),
      test_parameters: z.array(z.string()).min(1),
      start_date: z.string().min(1)
    })),
    defaultValues: {
      batch_id: '', storage_condition: 'Refrigerated (4°C)',
      test_parameters: ['pH', 'CFU', 'Sensory', 'Color'],
      start_date: new Date().toISOString().split('T')[0]
    }
  });

  const watchedCondition = watch('storage_condition');
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: studyData }, { data: batchData }] = await Promise.all([
        supabase.from('shelf_life_studies').select('*, batches(batch_id, variant), shelf_life_logs(*)').order('created_at', { ascending: false }),
        supabase.from('batches').select('id, batch_id, variant').eq('status', 'released').limit(50)
      ]);
      setStudies(studyData || []);
      setBatches(batchData || []);
    } catch (err) { console.error('Shelf-life fetch error:', err); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const concludeStudy = async (id) => {
    if (!window.confirm("Are you sure you want to conclude this stability study? It will be marked as Completed.")) return;
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

  if (authLoading) return <div className="page-container space-y-6"><Skeleton width={300} height={40}/><Skeleton className="h-64 w-full rounded-2xl"/></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Stability & Shelf-Life</h1>
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
                    <h3 className="text-lg font-bold text-gray-900">{study.batches?.batch_id}</h3>
                    <p className="text-xs font-semibold text-gray-500 mt-1">{study.batches?.variant} | {study.storage_condition}</p>
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


              <div className="flex gap-2">
                {study.status !== 'Completed' && (
                  <button onClick={() => concludeStudy(study.id)} className="flex-1 py-2.5 bg-white border border-red-100 text-[10px] font-bold uppercase tracking-wider text-red-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all focus:outline-none">
                    Conclude
                  </button>
                )}
                <button disabled title="Document generation module pending" className="flex-[2] py-2.5 bg-gray-50 border border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400 cursor-not-allowed rounded-lg flex items-center justify-center gap-2">
                  Open Log & Parameters <ChevronRight className="w-4 h-4 opacity-50" />
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
                    <option key={b.id} value={b.id}>{b.batch_id} ({b.variant})</option>
                  ))}
                </select>
              </div>
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
    </div>
  );
}
