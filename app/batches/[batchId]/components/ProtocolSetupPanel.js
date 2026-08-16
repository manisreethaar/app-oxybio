'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { FileText, ArrowRight, Loader } from 'lucide-react';

// sops — pre-loaded from server, no useEffect needed
export default function ProtocolSetupPanel({ batch, sops = [], onComplete }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [sopId, setSopId] = useState(batch.protocol_sop_id || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!sopId) {
      if (!confirm('No protocol selected. Are you sure you want to start the seed train without linking an SOP?')) return;
    }
    setSaving(true);
    try {
      // Check if seed_1 record already exists (idempotent)
      const { data: existing } = await supabase
        .from('batch_seed_trains')
        .select('id')
        .eq('batch_id', batch.id)
        .eq('stage_type', 'seed_1')
        .maybeSingle();

      if (!existing) {
        const { error: seedErr } = await supabase.from('batch_seed_trains').insert({
          batch_id: batch.id,
          stage_type: 'seed_1',
          status: 'active',
        });
        if (seedErr) throw new Error('Failed to initiate Seed 1: ' + seedErr.message);
      }

      const { error } = await supabase.from('batches').update({
        protocol_sop_id: sopId || null,
        current_stage: 'seed_1',
      }).eq('id', batch.id);

      if (error) throw new Error('Failed to update batch stage: ' + error.message);
      toast.success('Protocol linked! Seed 1 phase initiated.');
      onComplete?.();
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
      <p className="text-sm text-slate-500 text-center mb-8">
        Before starting the seed train, link the verified protocol document (SOP or Batch Record Template) for this batch.
      </p>

      <div className="mb-6">
        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Select Protocol (SOP)</label>
        <select
          value={sopId}
          onChange={e => setSopId(e.target.value)}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:border-navy focus:ring-2 focus:ring-navy/20 outline-none transition-all"
        >
          <option value="">-- Select a Document --</option>
          {sops.map(sop => (
            <option key={sop.id} value={sop.id}>{sop.sop_id} - {sop.title}</option>
          ))}
        </select>
        {sops.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">No active SOPs found. You can still start without one.</p>
        )}
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
