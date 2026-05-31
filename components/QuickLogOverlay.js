'use client';
import { useState, useEffect, useRef } from 'react';
import { Plus, X, FlaskConical, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/utils/supabase/client';

export default function QuickLogOverlay() {
  const { employeeProfile } = useAuth();
  const toast = useToast();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('pick'); // 'pick' | 'log'
  const [recentBatches, setRecentBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [pH, setPH] = useState('');
  const [od, setOd] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const phRef = useRef(null);
  const closeTimer = useRef(null);

  // Fetch 5 most-recently-logged batches when overlay opens
  useEffect(() => {
    if (!open) return;
    // Get distinct batch_ids from recent fermentation readings, ordered by most recent log
    supabase
      .from('batch_fermentation_readings')
      .select('batch_id, logged_at, flask_id, flask_label, batch_flasks!inner(batch_id, batches!inner(id, batch_id, current_stage, status))')
      .order('logged_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Set();
        const deduped = [];
        for (const row of data) {
          const batchId = row.batch_flasks?.batches?.id;
          if (!batchId || seen.has(batchId)) continue;
          const batch = row.batch_flasks?.batches;
          if (['released', 'rejected'].includes(batch?.status)) continue;
          seen.add(batchId);
          deduped.push({
            id: batchId,
            batch_id: batch.batch_id,
            stage: batch.current_stage,
            flask_label: row.flask_label,
            flask_id: row.flask_id,
            logged_at: row.logged_at,
          });
          if (deduped.length >= 5) break;
        }
        setRecentBatches(deduped);
      });
  }, [open]);

  // Auto-focus pH input when step changes to 'log'
  useEffect(() => {
    if (step === 'log' && phRef.current) {
      setTimeout(() => phRef.current?.focus(), 80);
    }
  }, [step]);

  // Auto-close after success
  useEffect(() => {
    if (done) {
      closeTimer.current = setTimeout(() => {
        handleClose();
      }, 1200);
    }
    return () => clearTimeout(closeTimer.current);
  }, [done]);

  const handleClose = () => {
    setOpen(false);
    setStep('pick');
    setSelectedBatch(null);
    setPH('');
    setOd('');
    setSaving(false);
    setDone(false);
  };

  const handleSave = async () => {
    if (!pH || !selectedBatch) return;
    setSaving(true);
    try {
      // Get active flask for this batch
      const { data: flasks } = await supabase
        .from('batch_flasks')
        .select('id, flask_label')
        .eq('batch_id', selectedBatch.id)
        .eq('status', 'active')
        .order('flask_label')
        .limit(1);

      const flask = flasks?.[0];
      if (!flask) throw new Error('No active flask found for this batch.');

      // Get T=0 for elapsed hours calculation
      const { data: inocu } = await supabase
        .from('batch_flask_inoculations')
        .select('t_zero_time')
        .eq('flask_id', flask.id)
        .single();

      const tZero = inocu?.t_zero_time ? new Date(inocu.t_zero_time) : null;
      const elapsed = tZero ? parseFloat(((new Date() - tZero) / 3600000).toFixed(2)) : null;

      const res = await fetch(`/api/batches/${selectedBatch.id}/fermentation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reading',
          flask_id: flask.id,
          flask_label: flask.flask_label,
          ph: parseFloat(pH),
          optical_density: od ? parseFloat(od) : null,
          elapsed_hours: elapsed,
          logged_at: new Date().toISOString(),
          logged_by: employeeProfile?.id,
          plating_done: false,
          plating_config: {},
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to log reading');
      setDone(true);
    } catch (err) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        id="quick-log-fab"
        onClick={() => { setOpen(true); setDone(false); }}
        aria-label="Quick Log"
        className="fixed bottom-24 left-4 md:left-auto md:bottom-6 md:right-24 z-[1000] w-12 h-12 bg-navy text-white rounded-full shadow-lg hover:bg-navy-hover transition-all flex items-center justify-center hover:scale-110 active:scale-95"
        style={{ boxShadow: '0 4px 20px rgba(30,58,95,0.35)' }}
      >
        <Plus className="w-5 h-5 stroke-[2.5px]" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[1050] flex items-end justify-start p-4 md:items-end md:justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-sm animate-in slide-in-from-bottom-4 duration-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-navy" />
                <span className="text-sm font-black text-gray-900">
                  {step === 'pick' ? 'Quick Log — Pick Batch' : `Log → ${selectedBatch?.batch_id}`}
                </span>
              </div>
              <button onClick={handleClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Pick batch */}
            {step === 'pick' && (
              <div className="p-3 space-y-1.5">
                {recentBatches.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6 font-semibold">No active batches with recent logs.</p>
                ) : (
                  recentBatches.map(b => (
                    <button
                      key={b.id}
                      onClick={() => { setSelectedBatch(b); setStep('log'); }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 hover:border-navy/20 hover:bg-navy/5 transition-all group text-left"
                    >
                      <div>
                        <p className="text-sm font-black text-gray-900 font-mono">{b.batch_id}</p>
                        <p className="text-[10px] text-gray-400 font-semibold capitalize mt-0.5">
                          {b.stage?.replace(/_/g, ' ')} · {b.flask_label}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-navy transition-colors" />
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Step 2: Log readings */}
            {step === 'log' && !done && (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    pH Value <span className="text-red-500">★ CCP</span>
                  </label>
                  <input
                    ref={phRef}
                    type="number" step="0.01" min="0" max="14"
                    value={pH} onChange={e => setPH(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-3xl font-black font-mono text-center tracking-tighter text-gray-800 focus:border-navy outline-none transition-colors"
                    onKeyDown={e => e.key === 'Enter' && pH && handleSave()}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">OD 600nm <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                  <input
                    type="number" step="0.001"
                    value={od} onChange={e => setOd(e.target.value)}
                    placeholder="0.500"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy transition-colors"
                    onKeyDown={e => e.key === 'Enter' && pH && handleSave()}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('pick')}
                    className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-bold text-xs rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!pH || saving}
                    className="flex-1 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {saving ? 'Saving…' : 'Save Reading'}
                  </button>
                </div>
              </div>
            )}

            {/* Success state */}
            {done && (
              <div className="p-8 flex flex-col items-center text-center gap-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <p className="text-sm font-black text-gray-900">Reading logged!</p>
                <p className="text-[10px] text-gray-400">Closing automatically…</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
