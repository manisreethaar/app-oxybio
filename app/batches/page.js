'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { FlaskConical, Plus, AlertTriangle, ArrowRight, Loader2, X } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import Link from 'next/link';

export default function BatchesPage() {
  const { employeeProfile, role, loading: authLoading } = useAuth();
  const [activeBatches, setActiveBatches] = useState([]);
  const [history, setHistory] = useState([]);
  const [isAlert, setIsAlert] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(true);
  
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [formulations, setFormulations] = useState([]);
  const [newBatchForm, setNewBatchForm] = useState({ variant: 'O2B-Agri', formulation_id: '' });
  const [creatingBatch, setCreatingBatch] = useState(false);
  
  const supabase = createClient();

  useEffect(() => {
    fetchBatches(); fetchFormulations();
  }, []);

  const fetchFormulations = async () => {
    const { data } = await supabase.from('formulations').select('id, name, code, version').order('created_at', { ascending: false });
    setFormulations(data || []);
  };

  const fetchBatches = async () => {
    setLoadingBatches(true);
    const { data: fermenting } = await supabase.from('batches').select('*, formulations(name, code, version)').in('status', ['fermenting', 'deviation', 'qc-hold']).order('start_time', { ascending: false });
    const hasDeviation = fermenting?.some(b => b.ph_readings?.some(ph => ph.is_deviation && !ph.deviation_acknowledged));
    setIsAlert(hasDeviation); setActiveBatches(fermenting || []);

    const { data: completed } = await supabase.from('batches').select('*').in('status', ['released', 'rejected']).order('created_at', { ascending: false }).limit(10);
    setHistory(completed || []); setLoadingBatches(false);
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault(); if (!newBatchForm.formulation_id) return alert("Select formulation.");
    setCreatingBatch(true);
    try {
      const salt = crypto.randomUUID().split('-')[0].slice(-4).toUpperCase();
      const batchIdStr = `BTCH-${newBatchForm.variant.split('-')[1].toUpperCase()}-${salt}`;
      const { error } = await supabase.from('batches').insert({ batch_id: batchIdStr, variant: newBatchForm.variant, formulation_id: newBatchForm.formulation_id, current_stage: 'media_prep', status: 'pending', start_time: new Date().toISOString() });
      if (error) throw error;
      setShowNewBatchModal(false); setNewBatchForm({ variant: 'O2B-Agri', formulation_id: '' }); fetchBatches();
    } catch (err) { alert(err.message); } finally { setCreatingBatch(false); }
  };

  if (authLoading || loadingBatches) return <div className="p-8 text-center text-gray-400 font-medium">Synchronizing Batch Registry...</div>;

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
          <p className="text-sm text-gray-500 mt-1">Track fermentations and record CCP logs.</p>
        </div>
        {role === 'admin' && (
          <button onClick={() => setShowNewBatchModal(true)} className="flex items-center px-4 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg transition-colors shadow-sm text-xs uppercase tracking-wider">
            <Plus className="w-4 h-4 mr-1" /> New Batch
          </button>
        )}
      </div>

      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
          <FlaskConical className="w-4 h-4 mr-1.5 text-navy" /> Active Fermentations
        </h2>
        {activeBatches.length === 0 ? (
          <div className="surface p-8 text-center text-gray-400 font-medium text-sm">No active batches running.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeBatches.map(batch => {
               const latestPh = batch.ph_readings?.[batch.ph_readings.length - 1];
               const hours = differenceInHours(new Date(), new Date(batch.start_time));
               const isDev = latestPh?.is_deviation && !latestPh?.deviation_acknowledged;

               return (
                 <div key={batch.id} className={`surface overflow-hidden flex flex-col hover:border-gray-300 transition-colors ${isDev ? 'border-red-300 bg-red-50/10' : ''}`}>
                   <div className="px-6 py-4 flex justify-between items-start border-b border-gray-100 bg-gray-50/30">
                     <div>
                       <p className="font-mono text-base font-black text-gray-900 tracking-wider mb-1">{batch.batch_id}</p>
                       <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">{batch.variant}</span>
                     </div>
                     <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${isDev ? 'bg-red-50 text-red-700 border-red-100' : batch.status === 'qc-hold' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                       {isDev ? 'DEVIATION' : batch.status}
                     </span>
                   </div>
                   <div className="px-6 py-5 flex-1 flex justify-between">
                     <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Elapsed</p><p className="text-xl font-black text-gray-800">{hours} <span className="text-xs">HRS</span></p></div>
                     <div className="text-right">
                       <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Latest pH</p>
                       {latestPh ? <p className={`text-3xl font-black tracking-tighter tabular-nums ${latestPh.is_deviation ? 'text-red-600' : 'text-emerald-600'}`}>{latestPh.ph_value}</p> : <p className="text-base font-bold text-gray-300">—</p>}
                     </div>
                   </div>
                   <Link href={`/batches/${batch.id}`} className={`w-full py-3 flex justify-center items-center text-xs font-bold transition-colors border-t border-gray-100 ${isDev ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-50/50 hover:bg-gray-100 text-navy'}`}>
                     {isDev ? 'Review Deviation' : 'View Details & Log'} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                   </Link>
                 </div>
               )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-4">Batch History & QC</h2>
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Batch ID</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Variant</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {history.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 text-xs font-mono font-bold text-gray-800">{l.batch_id}</td>
                    <td className="px-6 py-3.5 text-xs font-semibold text-gray-700">{l.variant}</td>
                    <td className="px-6 py-3.5"><span className={`px-2 py-0.5 inline-flex text-[9px] font-black uppercase tracking-wider rounded border ${l.status === 'released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{l.status}</span></td>
                    <td className="px-6 py-3.5 text-xs text-gray-500 font-semibold">{format(new Date(l.start_time), 'MMM d, yyyy')}</td>
                    <td className="px-6 py-3.5 text-right"><Link href={`/batches/${l.id}`} className="text-xs font-bold text-accent hover:underline">Report</Link></td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan="5" className="px-6 py-8 text-center text-xs text-gray-400 font-medium">No completed batches found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {showNewBatchModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 relative shadow-xl border border-gray-100">
            <button onClick={() => setShowNewBatchModal(false)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            <h2 className="text-base font-bold text-gray-900 mb-4 tracking-tight">Initialize Production</h2>
            <form onSubmit={handleCreateBatch} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Recipe Variant</label>
                <select required value={newBatchForm.formulation_id} onChange={e => setNewBatchForm({...newBatchForm, formulation_id: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 outline-none bg-white font-semibold text-gray-800 text-sm">
                  <option value="">Select Version...</option>
                  {formulations.map(f => <option key={f.id} value={f.id}>{f.code} - {f.name} (v{f.version})</option>)}
                </select>
                <p className="text-[10px] text-gray-400 font-medium mt-1">Traceability matrix requires valid binding version.</p>
              </div>
              <button disabled={creatingBatch} type="submit" className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-lg transition-colors text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
                {creatingBatch ? 'Initializing...' : 'Commence Production'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
