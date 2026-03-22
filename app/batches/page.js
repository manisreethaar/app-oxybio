'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { FlaskConical, Plus, AlertTriangle, ArrowRight, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { format, differenceInHours } from 'date-fns';

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

  if (authLoading) return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-10 h-10 animate-spin text-teal-800" /></div>;
  if (!employeeProfile) return null;

  useEffect(() => {
    fetchBatches();
    fetchFormulations();
  }, []);

  const fetchFormulations = async () => {
    const { data } = await supabase.from('formulations').select('id, name, code, version').order('created_at', { ascending: false });
    setFormulations(data || []);
  };

  const fetchBatches = async () => {
    setLoadingBatches(true);
    const { data: fermenting } = await supabase
      .from('batches')
      .select('*, formulations(name, code, version)')
      .in('status', ['fermenting', 'deviation', 'qc-hold'])
      .order('start_time', { ascending: false });
    // ...

    // Check for unacknowledged deviations
    const hasDeviation = fermenting?.some(b => b.ph_readings?.some(ph => ph.is_deviation && !ph.deviation_acknowledged));
    setIsAlert(hasDeviation);
    setActiveBatches(fermenting || []);

    const { data: completed } = await supabase
      .from('batches')
      .select('*')
      .in('status', ['released', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(10);
    
    setHistory(completed || []);
    setLoadingBatches(false);
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!newBatchForm.formulation_id) return alert("Please select a valid Formulation version.");
    setCreatingBatch(true);
    try {
      const salt = crypto.randomUUID().split('-')[0].slice(-4).toUpperCase();
      const batchIdStr = `BTCH-${newBatchForm.variant.split('-')[1].toUpperCase()}-${salt}`;
      
      const { error } = await supabase.from('batches').insert({
        batch_id: batchIdStr,
        variant: newBatchForm.variant,
        formulation_id: newBatchForm.formulation_id,
        current_stage: 'media_prep',
        status: 'pending',
        start_time: new Date().toISOString()
      });

      if (error) throw error;
      
      setShowNewBatchModal(false);
      setNewBatchForm({ variant: 'O2B-Agri', formulation_id: '' });
      fetchBatches();
    } catch (err) {
      alert("Failed to initialize production sequence: " + err.message);
    } finally {
      setCreatingBatch(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      {isAlert && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center text-red-800">
            <AlertTriangle className="w-6 h-6 mr-3" />
            <span className="font-bold text-lg">CCP DEVIATION ALERT: Unacknowledged pH deviations detected. Immediate review required!</span>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Batch Manager</h1>
          <p className="text-gray-500 mt-1">Track active fermentations and log critical control points (CCPs).</p>
        </div>
        {role === 'admin' && (
          <button onClick={() => setShowNewBatchModal(true)} className="flex items-center px-4 py-2 bg-teal-800 text-white font-medium rounded-lg hover:bg-teal-900 transition-colors shadow-sm shrink-0">
            <Plus className="w-5 h-5 mr-1" /> New Batch
          </button>
        )}
      </div>

      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <FlaskConical className="w-5 h-5 mr-2 text-teal-700" /> Active Fermentations
        </h2>
        {loadingBatches ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-teal-700" /></div>
        ) : activeBatches.length === 0 ? (
          <div className="p-8 text-center bg-white border border-gray-200 rounded-2xl shadow-sm text-gray-500">
            No active batches. Create one to begin tracking fermentation.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeBatches.map(batch => {
               const latestPhList = batch.ph_readings || [];
               const latestPh = latestPhList.length > 0 ? latestPhList[latestPhList.length - 1] : null;
               const hours = differenceInHours(new Date(), new Date(batch.start_time));

               return (
                 <div key={batch.id} className={`bg-white rounded-2xl border ${latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'border-red-400 ring-2 ring-red-400 text-red-900' : 'border-gray-200'} shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md`}>
                   <div className={`px-6 py-4 flex justify-between items-start border-b ${latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'bg-red-50 border-red-100' : 'border-gray-100'}`}>
                     <div>
                       <p className="font-mono text-lg font-bold text-teal-900 tracking-wider mb-1">{batch.batch_id}</p>
                       <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">{batch.variant}</span>
                     </div>
                     <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${batch.status === 'deviation' || (latestPh?.is_deviation) ? 'bg-red-100 text-red-800' : batch.status === 'qc-hold' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'}`}>
                       {batch.status === 'fermenting' && latestPh?.is_deviation ? 'DEVIATION' : batch.status}
                     </span>
                   </div>
                   <div className="px-6 py-5 flex-1 flex justify-between">
                     <div>
                       <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Elapsed Time</p>
                       <p className="text-xl font-semibold text-gray-700">{hours} <span className="text-sm">hrs</span></p>
                     </div>
                     <div className="text-right">
                       <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Latest pH</p>
                       {latestPh ? (
                         <p className={`text-4xl font-black tracking-tighter tabular-nums ${latestPh.is_deviation ? 'text-red-600' : 'text-green-600'}`}>{latestPh.ph_value}</p>
                       ) : (
                         <p className="text-xl font-medium text-gray-300">—</p>
                       )}
                     </div>
                   </div>
                   <Link href={`/batches/${batch.id}`} className={`w-full py-3.5 flex justify-center items-center text-sm font-semibold transition-colors border-t ${latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-50 hover:bg-gray-100 text-teal-800 border-gray-100'}`}>
                     {latestPh?.is_deviation && !latestPh?.deviation_acknowledged ? 'Review Deviation Now' : 'View Details & Log pH'} <ArrowRight className="w-4 h-4 ml-2" />
                   </Link>
                 </div>
               )
            })}
          </div>
        )}
      </section>

      <section className="pt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Batch History & QC</h2>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch ID</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Variant</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Started</th>
                  <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {history.map((batch) => (
                  <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-teal-800 tracking-wider">
                      {batch.batch_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">{batch.variant}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2.5 py-1 inline-flex text-xs font-bold uppercase tracking-wider rounded-md ${batch.status === 'released' ? 'bg-green-100 text-green-800' : batch.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                      {format(new Date(batch.start_time), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link href={`/batches/${batch.id}`} className="text-teal-600 hover:text-teal-900 focus:outline-none underline-offset-4 hover:underline">View Report</Link>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && !loadingBatches && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-sm text-gray-500">No completed batches in history.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* New Batch Initialization Modal */}
      {showNewBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 relative shadow-2xl border border-teal-100">
            <button onClick={() => setShowNewBatchModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-black text-slate-800 mb-1 tracking-tight">Initialize Sequence</h2>
            <p className="text-sm font-semibold text-teal-600 mb-6 uppercase tracking-wider">Production Setup</p>
            
            <form onSubmit={handleCreateBatch} className="space-y-5">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Scientific Formulation</label>
                <select 
                  required
                  value={newBatchForm.formulation_id} 
                  onChange={e => setNewBatchForm({...newBatchForm, formulation_id: e.target.value})} 
                  className="w-full border-2 border-slate-100 rounded-xl p-3 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 outline-none bg-slate-50 font-bold text-slate-700 transition-all font-mono"
                >
                  <option value="">Select Recipe Version...</option>
                  {formulations.map(f => (
                    <option key={f.id} value={f.id}>{f.code} - {f.name} (v{f.version})</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 font-medium mt-2">Linking a batch to a formulation version ensures experiment traceability and CCP compliance.</p>
              </div>

              <div className="pt-2">
                <button 
                  disabled={creatingBatch} 
                  type="submit" 
                  className="w-full bg-gradient-to-br from-teal-600 to-cyan-700 text-white font-black py-3.5 rounded-xl hover:from-teal-500 hover:to-cyan-600 transition-all disabled:opacity-50 uppercase tracking-widest shadow-lg shadow-teal-700/20 active:scale-95"
                >
                  {creatingBatch ? 'Initializing...' : 'Commence Production'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
