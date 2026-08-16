'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { FileText, ArrowRight, Loader } from 'lucide-react';

// sops — pre-loaded from server, no useEffect needed
export default function ProtocolSetupPanel({ batch, sops = [], onComplete }) {
  const toast = useToast();

  const [sopId, setSopId] = useState(batch.protocol_sop_id || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!sopId) {
      if (!confirm('No protocol selected. Are you sure you want to start the seed train without linking an SOP?')) return;
    }
    setSaving(true);
    try {
      // 1. Link SOP and start seed_1 via server API (admin client bypasses RLS)
      const res = await fetch(`/api/batches/${batch.id}/protocol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sop_id: sopId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start seed train');

      toast.success('Protocol linked! Seed 1 phase initiated.');
      onComplete?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-8 max-w-2xl mx-auto mt-8 border-slate-200 shadow-sm">
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center">
          <FileText className="w-8 h-8"/>
        </div>
      </div>
      <h2 className="text-xl font-black text-slate-800 text-center mb-2">Protocol &amp; Setup</h2>
      <p className="text-sm text-slate-500 text-center mb-8">
        Before starting the seed train, link the verified protocol document (SOP or Batch Record Template) for this batch.
      </p>

      <div className="mb-6">
        <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Select Protocol (SOP)</label>
        <select
          value={sopId}
          onChange={e => setSopId(e.target.value)}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:border-slate-500 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
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
        className="w-full py-3 bg-navy text-white font-black rounded-xl hover:bg-navy-hover transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-60"
      >
        {saving
          ? <><Loader className="w-5 h-5 animate-spin"/> Starting seed train...</>
          : <>Confirm &amp; Start Seed Train <ArrowRight className="w-5 h-5"/></>
        }
      </button>
    </div>
  );
}
