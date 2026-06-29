'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Plus, X, FlaskConical, ChevronRight, CheckCircle2,
  Loader2, AlertTriangle, Beaker, ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

const STAGE_LABELS = {
  media_prep:       'Media Prep',
  sterilisation:    'Sterilisation',
  inoculation:      'Inoculation',
  fermentation:     'Fermentation',
  straining:        'Straining',
  extract_addition: 'Extract Addition',
  qc_hold:          'QC Hold',
};

const FOAM_OPTS = ['None', 'Slight', 'Moderate', 'Heavy'];

export default function QuickLogOverlay() {
  const { employeeProfile } = useAuth();
  const toast = useToast();
  const supabase = createClient();

  const [open, setOpen]                   = useState(false);
  const [step, setStep]                   = useState('pick'); // 'pick' | 'flask' | 'log'
  const [activeBatches, setActiveBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [flasks, setFlasks]               = useState([]);
  const [selectedFlask, setSelectedFlask] = useState(null);
  const [loadingFlasks, setLoadingFlasks] = useState(false);

  // Reading form
  const [pH,    setPH]    = useState('');
  const [temp,  setTemp]  = useState('');
  const [brix,  setBrix]  = useState('');
  const [od,    setOd]    = useState('');
  const [foam,  setFoam]  = useState('None');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [alarms, setAlarms] = useState(null);
  const [done,   setDone]   = useState(false);

  const phRef      = useRef(null);
  const closeTimer = useRef(null);

  // FIX 1: query batches directly so brand-new fermentation runs appear
  useEffect(() => {
    if (!open) return;
    setLoadingBatches(true);
    supabase
      .from('batches')
      .select('id, batch_id, current_stage, status, sku')
      .neq('status', 'released')
      .neq('status', 'rejected')
      .neq('current_stage', 'released')
      .neq('current_stage', 'rejected')
      .order('updated_at', { ascending: false })
      .limit(25)
      .then(({ data }) => {
        if (!data) return;
        // Fermentation batches first so the most useful option is at the top
        const sorted = [...data].sort((a, b) => {
          if (a.current_stage === 'fermentation' && b.current_stage !== 'fermentation') return -1;
          if (b.current_stage === 'fermentation' && a.current_stage !== 'fermentation') return 1;
          return 0;
        });
        setActiveBatches(sorted);
      })
      .finally(() => setLoadingBatches(false));
  }, [open]);

  // Auto-focus pH when the log step becomes active
  useEffect(() => {
    if (step === 'log' && phRef.current) {
      setTimeout(() => phRef.current?.focus(), 80);
    }
  }, [step]);

  // Auto-close 2 s after a successful save
  useEffect(() => {
    if (done) closeTimer.current = setTimeout(handleClose, 2000);
    return () => clearTimeout(closeTimer.current);
  }, [done]);

  const handleClose = () => {
    setOpen(false);
    setStep('pick');
    setSelectedBatch(null);
    setFlasks([]);
    setSelectedFlask(null);
    setPH(''); setTemp(''); setBrix(''); setOd('');
    setFoam('None'); setNotes('');
    setSaving(false);
    setAlarms(null);
    setDone(false);
  };

  // FIX 2: fetch ALL active flasks for the batch so user can choose
  const handlePickBatch = async (batch) => {
    setSelectedBatch(batch);
    setLoadingFlasks(true);

    const { data } = await supabase
      .from('batch_flasks')
      .select('id, flask_label, status')
      .eq('batch_id', batch.id)
      .eq('status', 'active')
      .order('flask_label');

    setLoadingFlasks(false);
    const activeFlasks = data || [];
    setFlasks(activeFlasks);

    if (activeFlasks.length === 0) {
      toast.error('No active flask found for this batch.');
      setSelectedBatch(null);
      return;
    }
    if (activeFlasks.length === 1) {
      setSelectedFlask(activeFlasks[0]);
      setStep('log');
    } else {
      setStep('flask'); // FIX 2: show flask picker when multiple flasks exist
    }
  };

  const handlePickFlask = (flask) => {
    setSelectedFlask(flask);
    setStep('log');
  };

  const handleSave = async () => {
    if (!pH || !selectedBatch || !selectedFlask) return;
    setSaving(true);
    try {
      const { data: inocu } = await supabase
        .from('batch_flask_inoculations')
        .select('t_zero_time')
        .eq('flask_id', selectedFlask.id)
        .single();

      const tZero  = inocu?.t_zero_time ? new Date(inocu.t_zero_time) : null;
      const elapsed = tZero
        ? parseFloat(((new Date() - tZero) / 3600000).toFixed(2))
        : null;

      const res = await fetch(`/api/batches/${selectedBatch.id}/fermentation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:             'reading',
          flask_id:         selectedFlask.id,
          flask_label:      selectedFlask.flask_label,
          ph:               parseFloat(pH),
          incubator_temp_c: temp  ? parseFloat(temp)  : null, // FIX 3
          brix:             brix  ? parseFloat(brix)  : null, // FIX 3
          optical_density:  od    ? parseFloat(od)    : null,
          foam_level:       foam !== 'None' ? foam    : null, // FIX 3
          notes:            notes || null,                    // FIX 4
          elapsed_hours:    elapsed,
          logged_at:        new Date().toISOString(),
          logged_by:        employeeProfile?.id,
          plating_done:     false,
          plating_config:   {},
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to log reading');
      setAlarms(json.alarms);
      setDone(true);
    } catch (err) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  const enterKey = (e) => { if (e.key === 'Enter' && pH) handleSave(); };

  const phNum       = parseFloat(pH);
  const phInAlarm   = pH && (phNum < 3.8 || phNum > 5.5);
  const phOffTarget = pH && !phInAlarm && (phNum < 4.2 || phNum > 4.5);
  const tempNum     = parseFloat(temp);
  const tempInAlarm = temp && (tempNum < 36 || tempNum > 38);

  return (
    <>
      {/* Floating trigger */}
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
          className="fixed inset-0 z-[1050] flex items-end justify-start p-4 md:items-end md:justify-center"
          onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm animate-in slide-in-from-bottom-4 duration-200 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-navy" />
                <span className="text-sm font-black text-slate-900">
                  {step === 'pick'  && 'Quick Log — Active Batches'}
                  {step === 'flask' && `Select Flask — ${selectedBatch?.batch_id}`}
                  {step === 'log'   && `Log → ${selectedBatch?.batch_id} · ${selectedFlask?.flask_label}`}
                </span>
              </div>
              <button
                onClick={handleClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Step 1: Pick batch ── */}
            {step === 'pick' && (
              <div className="p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
                {loadingBatches && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                  </div>
                )}
                {!loadingBatches && activeBatches.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6 font-semibold">
                    No active batches found.
                  </p>
                )}
                {!loadingBatches && activeBatches.map(b => {
                  const isFermentation = b.current_stage === 'fermentation';
                  const isLoading = loadingFlasks && selectedBatch?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 hover:border-navy/20 hover:bg-navy/5 transition-all"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-black text-slate-900 font-mono truncate">{b.batch_id}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isFermentation
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {STAGE_LABELS[b.current_stage] || b.current_stage}
                          </span>
                          {b.sku && (
                            <span className="text-[10px] text-slate-400 font-semibold truncate">{b.sku}</span>
                          )}
                        </div>
                      </div>

                      {/* FIX 1 + FIX 5: fermentation → log button; other stages → open link */}
                      {isFermentation ? (
                        <button
                          onClick={() => handlePickBatch(b)}
                          disabled={loadingFlasks}
                          className="flex items-center gap-1 px-3 py-1.5 bg-navy text-white text-[11px] font-black rounded-lg hover:bg-navy-hover transition-colors disabled:opacity-50 shrink-0"
                        >
                          {isLoading
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <>Log <ChevronRight className="w-3 h-3" /></>
                          }
                        </button>
                      ) : (
                        <Link
                          href={`/batches/${b.id}`}
                          onClick={handleClose}
                          className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-slate-500 text-[11px] font-bold rounded-lg hover:bg-slate-50 transition-colors shrink-0"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Step 2: Flask picker (FIX 2) ── */}
            {step === 'flask' && (
              <div className="p-3 space-y-1.5">
                <p className="text-[11px] text-slate-400 font-semibold px-2 py-1">
                  Multiple active flasks — select one:
                </p>
                {flasks.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handlePickFlask(f)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-100 hover:border-navy/20 hover:bg-navy/5 transition-all group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Beaker className="w-4 h-4 text-navy" />
                      <span className="text-sm font-black text-slate-900 font-mono">{f.flask_label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-navy transition-colors" />
                  </button>
                ))}
                <button
                  onClick={() => { setStep('pick'); setSelectedBatch(null); setFlasks([]); }}
                  className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ← Back to batches
                </button>
              </div>
            )}

            {/* ── Step 3: Log form (FIX 3 + FIX 4) ── */}
            {step === 'log' && !done && (
              <div className="p-5 space-y-3.5">

                {/* pH — large, prominent */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    pH Value <span className="text-red-500">★ CCP</span>
                  </label>
                  <input
                    ref={phRef}
                    type="number" step="0.01" min="0" max="14"
                    value={pH} onChange={e => setPH(e.target.value)}
                    placeholder="0.00"
                    className={`w-full px-4 py-3 border-2 rounded-xl text-3xl font-black font-mono text-center tracking-tighter text-slate-800 outline-none transition-colors ${
                      phInAlarm   ? 'border-red-400 bg-red-50/30' :
                      phOffTarget ? 'border-amber-300 bg-amber-50/20' :
                      'border-slate-200 focus:border-navy'
                    }`}
                    onKeyDown={enterKey}
                  />
                  <p className={`text-[10px] mt-1 font-semibold ${
                    phInAlarm   ? 'text-red-600' :
                    phOffTarget ? 'text-amber-600' :
                    'text-slate-400'
                  }`}>
                    {phInAlarm   ? '⚠ Outside alarm range (3.8–5.5) — will be flagged' :
                     phOffTarget ? '◈ Outside target range (4.2–4.5)' :
                     'Target: 4.2–4.5 · Alarm: <3.8 or >5.5'}
                  </p>
                </div>

                {/* Temp + Brix + OD — compact grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Temp °C</label>
                    <input
                      type="number" step="0.1"
                      value={temp} onChange={e => setTemp(e.target.value)}
                      placeholder="37.0"
                      className={`w-full px-2 py-2 border rounded-lg text-sm font-semibold text-center outline-none transition-colors ${
                        tempInAlarm ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 focus:border-navy'
                      }`}
                      onKeyDown={enterKey}
                    />
                    {tempInAlarm && (
                      <p className="text-[9px] text-amber-600 font-bold mt-0.5 text-center">⚠ Out of range</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Brix °Bx</label>
                    <input
                      type="number" step="0.1"
                      value={brix} onChange={e => setBrix(e.target.value)}
                      placeholder="10.5"
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-center outline-none focus:border-navy transition-colors"
                      onKeyDown={enterKey}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">OD 600</label>
                    <input
                      type="number" step="0.001"
                      value={od} onChange={e => setOd(e.target.value)}
                      placeholder="0.500"
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-center outline-none focus:border-navy transition-colors"
                      onKeyDown={enterKey}
                    />
                  </div>
                </div>

                {/* Foam — quick toggle row */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Foam</label>
                  <div className="flex gap-1.5">
                    {FOAM_OPTS.map(opt => (
                      <button
                        key={opt} type="button"
                        onClick={() => setFoam(opt)}
                        className={`flex-1 py-1.5 text-[10px] font-black rounded-lg border transition-all ${
                          foam === opt
                            ? 'bg-navy text-white border-navy'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-navy/40'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <input
                  type="text"
                  value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Notes / observation (optional)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-navy transition-colors"
                  onKeyDown={enterKey}
                />

                {/* Back + Save */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (flasks.length > 1) {
                        setStep('flask');
                        setSelectedFlask(null);
                      } else {
                        setStep('pick');
                        setSelectedBatch(null);
                        setSelectedFlask(null);
                        setFlasks([]);
                      }
                    }}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!pH || saving}
                    className="flex-1 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {saving ? 'Saving…' : 'Save Reading'}
                  </button>
                </div>
              </div>
            )}

            {/* Success */}
            {done && (
              <div className="p-8 flex flex-col items-center text-center gap-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <p className="text-sm font-black text-slate-900">Reading logged!</p>
                {(alarms?.ph || alarms?.temp) && (
                  <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <p className="text-[11px] font-bold text-red-700">
                      {[alarms.ph && 'pH alarm', alarms.temp && 'Temp alarm']
                        .filter(Boolean).join(' + ')} — task auto-created
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-slate-400">Closing automatically…</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
