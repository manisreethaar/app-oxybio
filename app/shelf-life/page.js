'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Calendar, Thermometer, FlaskConical, Plus, ChevronRight, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';

export default function ShelfLifePage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const [studies, setStudies] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;
  if (!employeeProfile) return null;
  
  const [newStudy, setNewStudy] = useState({
    batch_id: '',
    storage_condition: 'Refrigerated (4°C)',
    test_parameters: ['pH', 'CFU', 'Sensory', 'Color'],
    start_date: new Date().toISOString().split('T')[0]
  });

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: studyData }, { data: batchData }] = await Promise.all([
      supabase.from('shelf_life_studies').select('*, batches(batch_id, variant)').order('created_at', { ascending: false }),
      supabase.from('batches').select('id, batch_id, variant').eq('status', 'released').limit(50)
    ]);
    setStudies(studyData || []);
    setBatches(batchData || []);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const { data, error } = await supabase.from('shelf_life_studies').insert({
      ...newStudy,
      created_by: employeeProfile.id,
      status: 'In Progress'
    }).select().single();
    
    if (!error) {
      setShowNew(false);
      fetchData();
    }
    setSubmitting(false);
  };

  const TIMEPOINTS = [0, 7, 14, 30, 60, 90];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase font-mono italic">Stability & Shelf-Life</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Time-Series Product Validation</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-2" /> Start New Study
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {loading ? (
          <div className="col-span-full flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>
        ) : studies.length === 0 ? (
          <div className="col-span-full p-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 italic text-slate-400">No active stability studies. Select a released batch to begin longevity testing.</div>
        ) : studies.map(study => (
          <div key={study.id} className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-2 inline-block">Active Study</span>
                <h3 className="text-2xl font-black text-slate-800">{study.batches?.batch_id}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{study.batches?.variant} | {study.storage_condition}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Started</p>
                <p className="text-sm font-bold text-slate-600">{new Date(study.start_date).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2 mb-8">
              {TIMEPOINTS.map(tp => (
                <div key={tp} className="text-center group">
                  <p className="text-[10px] font-black text-slate-300 uppercase mb-2 group-hover:text-indigo-400">D{tp}</p>
                  <div className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${tp === 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                    {tp === 0 ? <CheckCircle2 className="w-5 h-5"/> : <Clock className="w-5 h-5"/>}
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full py-4 bg-slate-50 border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 rounded-2xl hover:bg-white hover:text-indigo-600 hover:border-indigo-100 transition-all flex items-center justify-center gap-2">
              Open Log Sheet & Parameters <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl relative animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-hidden">
            <div className="bg-indigo-600 p-8 text-white">
              <h2 className="text-2xl font-black tracking-tight">Stability Protocol</h2>
              <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mt-1">Initialize T-Series Data Collection</p>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Released Batch</label>
                <select required value={newStudy.batch_id} onChange={e => setNewStudy({...newStudy, batch_id: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-2xl font-bold text-sm border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-600 transition-all outline-none">
                  <option value="">Select Released Batch...</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.batch_id} ({b.variant})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Storage Condition</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Refrigerated (4°C)', 'Ambient (25°C)', 'Accelerated (40°C)'].map(c => (
                    <button key={c} type="button" onClick={() => setNewStudy({...newStudy, storage_condition: c})} className={`px-4 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${newStudy.storage_condition === c ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'}`}>
                      {c.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-200 transition-all">Cancel</button>
                <button disabled={submitting} type="submit" className="flex-[2] py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-indigo-900/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
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
