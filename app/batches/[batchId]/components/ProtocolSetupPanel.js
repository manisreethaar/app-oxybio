'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { FileText, ArrowRight, Loader } from 'lucide-react';

export default function ProtocolSetupPanel({ batch, supabase, onComplete }) {
  const [sopId, setSopId] = useState(batch.protocol_sop_id || '');
  const [sops, setSops] = useState([]);
  const [loadingSops, setLoadingSops] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    async function fetchSops() {
      try {
        const { data } = await supabase.from('sop_library').select('id, title, sop_id').eq('is_active', true).order('title');
        setSops(data || []);
      } catch (err) {
        toast.error('Failed to load protocols');
      } finally {
        setLoadingSops(false);
      }
    }
    fetchSops();
  }, [supabase, toast]);

  const handleSave = async () => {
    if (!sopId) {
      if (!confirm('No protocol selected. Are you sure you want to start the seed train without linking an SOP?')) return;
    }
    setSaving(true);
    try {
      const { error: seedErr } = await supabase.from('batch_seed_trains').insert({
        batch_id: batch.id,
        stage_type: 'seed_1',
        status: 'active'
      }).select().maybeSingle();
      
      if (seedErr) throw new Error('Failed to initiate Seed 1: ' + seedErr.message);
      
      const { error } = await supabase.from('batches').update({ 
        protocol_sop_id: sopId, 
        current_stage: 'seed_1' 
      }).eq('id', batch.id);
      
      if (error) throw new Error('Failed to update batch stage: ' + error.message);
      toast.success('Protocol linked! Seed 1 phase initiated.');
      onComplete();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-8 max-w-2xl mx-auto mt-8 border-navy/20 shadow-sm">
       <div className="flex justify-center mb-6">
         <div className="w-16 h-16 bg-navy/10 text-navy rounded-full flex items-center justify-center">
           <FileText className="w-8 h-8"/>
         </div>
       </div>
       <h2 className="text-xl font-black text-slate-800 text-center mb-2">Protocol & Setup</h2>
       <p className="text-sm text-slate-500 text-center mb-8">Before starting the seed train, link the verified protocol document (SOP or Batch Record Template) for this batch.</p>
       
       <div className="mb-6">
         <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Select Protocol (SOP)</label>
         <select 
           value={sopId} 
           onChange={e => setSopId(e.target.value)} 
           disabled={loadingSops}
           className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:border-navy focus:ring-2 focus:ring-navy/20 outline-none transition-all disabled:opacity-50" 
         >
           <option value="">-- Select a Document --</option>
           {sops.map(sop => (
             <option key={sop.id} value={sop.id}>{sop.sop_id} - {sop.title}</option>
           ))}
         </select>
       </div>
       
       <button 
         onClick={handleSave} 
         disabled={saving} 
         className="w-full py-3 bg-navy text-white font-black rounded-xl hover:bg-navy-hover transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
       >
         {saving ? <Loader className="w-5 h-5 animate-spin"/> : <>Confirm & Start Seed Train <ArrowRight className="w-5 h-5"/></>}
       </button>
    </div>
  );
}
