'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, Plus, Loader2, FileSignature, Edit, ChevronRight, FlaskConical } from 'lucide-react';
import Link from 'next/link';

export default function DigitalLnbPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(3, 'Experiment title is required'),
      batch_id: z.string().optional()
    })),
    defaultValues: { title: '', batch_id: '' }
  });

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, { data: batchData }] = await Promise.all([
        fetch('/api/lab-notebook').then(res => res.json()),
        supabase.from('batches').select('id, batch_id, variant').limit(100)
      ]);
      if (entriesRes.success) setEntries(entriesRes.data || []);
      setBatches(batchData || []);
    } catch (err) { console.error('LNB fetch error:', err); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateSubmit = async (data) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/lab-notebook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create entry');
      const { data: newEntry } = await res.json();
      setShowNew(false); reset(); fetchData();
      // Wait for UI update then maybe navigate, but just reloading list is fine
    } catch (err) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'Draft': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">DRAFT</span>;
      case 'Submitted': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">SUBMITTED</span>;
      case 'Countersigned': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">COUNTERSIGNED</span>;
      default: return null;
    }
  };

  if (authLoading) return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Digital LNB</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Official Electronic Lab Notebook & Experiment Records</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95 shadow-sm">
          <BookOpen className="w-4 h-4 mr-1.5" /> Start New Experiment
        </button>
      </div>

      <div className="grid gap-4 mt-8">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
        ) : entries.length === 0 ? (
          <div className="surface p-12 text-center">
             <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
             <h3 className="text-lg font-bold text-gray-700">No LNB Entries Found</h3>
             <p className="text-sm text-gray-500 mt-1 mb-6">Start documenting your experiments and protocols.</p>
             <button onClick={() => setShowNew(true)} className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-gray-200 transition-all">Start First Entry</button>
          </div>
        ) : (
          entries.map((entry) => (
            <Link key={entry.id} href={`/lab-notebook/${entry.id}`} className="block group">
              <div className="surface p-5 hover:shadow-md transition-all border border-gray-100 hover:border-navy/20 cursor-pointer">
                <div className="flex justify-between items-start">
                  
                  <div className="flex-1">
                     <div className="flex items-center gap-3 mb-2">
                        {getStatusBadge(entry.status)}
                        <span className="text-xs font-bold text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</span>
                     </div>
                     <h2 className="text-lg font-black text-gray-900 group-hover:text-navy transition-colors">{entry.title}</h2>
                     <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center text-sm text-gray-600">
                           <FileSignature className="w-4 h-4 mr-1.5 text-gray-400" />
                           <span className="font-semibold">{entry.author?.full_name || 'Unknown Author'}</span>
                        </div>
                        {entry.batches && (
                          <div className="flex items-center text-sm text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                             <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                             <span className="font-bold text-indigo-900">{entry.batches.batch_id}</span>
                          </div>
                        )}
                     </div>
                  </div>

                  <div className="flex items-center justify-center p-3 rounded-full bg-gray-50 group-hover:bg-blue-50 transition-colors">
                     <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-navy" />
                  </div>
                  
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden">
            <div className="p-6 pb-0 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Create Notebook Entry</h2>
                <p className="text-xs font-medium text-gray-500 mt-1">Initialize a new experiment document draft</p>
              </div>
              <button onClick={() => { setShowNew(false); reset(); }} className="text-gray-400 hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit(handleCreateSubmit)} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Experiment Title / Objective</label>
                <input type="text" placeholder="e.g. Yield Optimization Trial 4" {...register('title')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Target Batch (Optional)</label>
                <select {...register('batch_id')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all">
                  <option value="">No Batch Linked</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.batch_id} ({b.variant})</option>
                  ))}
                </select>
              </div>
              
              <div className="pt-2">
                <button disabled={submitting} type="submit" className="w-full py-2.5 bg-navy text-white font-bold uppercase tracking-wider text-xs rounded-lg shadow-sm hover:bg-navy-hover transition-all flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Initialize Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
