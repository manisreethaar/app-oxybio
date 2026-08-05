'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import {
  Droplets, Plus, History, FlaskConical, Calculator,
  AlertTriangle, CheckCircle2, RefreshCw, Info, Beaker, Trash2, X
} from 'lucide-react';
import { withTimeout } from '@/lib/withTimeout';
import { useAuditReason } from '@/components/useAuditReason';
import OxygenLoader from '@/components/ui/OxygenLoader';

// ── Acid Type Config ──────────────────────────────────────────────────────────
const ACID_TYPES = {
  'Lactic Acid':  { eq_wt: 90.08,  target_min: 0.60, target_max: 1.00, color: '#ef4444', note: 'Typical LAB fermentation endpoint: 0.6–1.0%' },
  'Citric Acid':  { eq_wt: 64.04,  target_min: 0.40, target_max: 0.80, color: '#f97316', note: 'For fruit-based fermentations' },
  'Acetic Acid':  { eq_wt: 60.05,  target_min: 0.30, target_max: 0.70, color: '#8b5cf6', note: 'For acetate-rich samples' },
};

const SOURCE_TYPES = [
  { value: 'batch',                 label: 'Production Batch' },
  { value: 'bioprocess_experiment', label: 'R&D / Bioprocess Experiment' },
  { value: 'raw_material',          label: 'Raw Material' },
  { value: 'standalone',            label: 'Standalone Sample' },
];

// ── Concordance tolerance (mL) ────────────────────────────────────────────────
const CONCORDANT_TOLERANCE = 0.10; // within 0.10 mL = concordant (industry std)

// ── Tiny mini-chart (SVG Sparkline) ─────────────────────────────────────────
function TaSparkline({ logs, acidType }) {
  const cfg = ACID_TYPES[acidType] || ACID_TYPES['Lactic Acid'];
  const vals = logs.map(l => parseFloat(l.ta_percent)).filter(v => !isNaN(v));
  if (vals.length < 2) return null;
  const W = 220, H = 80, PAD = { t: 10, r: 10, b: 20, l: 36 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const minV = Math.max(0, Math.min(...vals) - 0.05);
  const maxV = Math.max(...vals) + 0.05;
  const xS = i => PAD.l + (i / (vals.length - 1)) * cW;
  const yS = v => PAD.t + cH - ((v - minV) / (maxV - minV)) * cH;
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {cfg.target_min >= minV && (
        <rect x={PAD.l} y={yS(cfg.target_max)} width={cW}
          height={Math.max(0, yS(cfg.target_min) - yS(cfg.target_max))}
          fill={cfg.color} fillOpacity={0.08}/>
      )}
      <line x1={PAD.l} x2={W - PAD.r} y1={yS(cfg.target_min)} y2={yS(cfg.target_min)}
        stroke={cfg.color} strokeWidth={0.7} strokeDasharray="3,2"/>
      <line x1={PAD.l} x2={W - PAD.r} y1={yS(cfg.target_max)} y2={yS(cfg.target_max)}
        stroke={cfg.color} strokeWidth={0.7} strokeDasharray="3,2"/>
      <path d={d} stroke={cfg.color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {vals.map((v, i) => (
        <circle key={i} cx={xS(i)} cy={yS(v)} r={3}
          fill={v >= cfg.target_min && v <= cfg.target_max ? '#10b981' : '#ef4444'}
          stroke="white" strokeWidth={1}/>
      ))}
      {[minV, (minV + maxV) / 2, maxV].map(v => (
        <text key={v} x={PAD.l - 3} y={yS(v)} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="#9ca3af">
          {v.toFixed(2)}
        </text>
      ))}
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TitrationLogPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const { employeeProfile, role } = useAuth();

  // ── ALOCA++ audit hook ────────────────────────────────────────────────────
  const { requestReason, modal: auditModal } = useAuditReason();

  const [logs, setLogs]         = useState([]);
  const [batches, setBatches]   = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Filter / group controls
  const [filterSource, setFilterSource] = useState('ALL');
  const [filterAcid, setFilterAcid]     = useState('ALL');

  // Form state
  const [sourceType, setSourceType]     = useState('batch');
  const [sourceId, setSourceId]         = useState('');
  const [sourceLabel, setSourceLabel]   = useState('');
  const [sampleName, setSampleName]     = useState('');
  const [sampleDesc, setSampleDesc]     = useState('');
  const [acidType, setAcidType]         = useState('Lactic Acid');
  const [normality, setNormality]       = useState('0.1');
  const [sampleVol, setSampleVol]       = useState('9');
  const [initBurette, setInitBurette]   = useState('0');
  const [finalBurette, setFinalBurette] = useState('');
  const [elapsedHours, setElapsedHours] = useState('');
  const [notes, setNotes]               = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');

  // ── Concordant reading fields ─────────────────────────────────────────────
  const [enableConcordant, setEnableConcordant] = useState(false);
  const [initBurette2, setInitBurette2]         = useState('0');
  const [finalBurette2, setFinalBurette2]       = useState('');

  // ── Live TA calculation (reading 1) ──────────────────────────────────────
  const eqWt       = ACID_TYPES[acidType]?.eq_wt || 90.08;
  const vTitrant   = (parseFloat(finalBurette) || 0) - (parseFloat(initBurette) || 0);
  const liveTA     = sampleVol && finalBurette
    ? ((vTitrant * parseFloat(normality) * eqWt) / (parseFloat(sampleVol) * 10))
    : null;
  const liveTAStr  = liveTA !== null ? liveTA.toFixed(4) : null;
  const cfg        = ACID_TYPES[acidType];
  const taStatus   = liveTA !== null
    ? (liveTA >= cfg.target_min && liveTA <= cfg.target_max ? 'ok' : liveTA < cfg.target_min ? 'low' : 'high')
    : null;

  // ── Live TA calculation (reading 2 — concordant) ──────────────────────────
  const vTitrant2  = (parseFloat(finalBurette2) || 0) - (parseFloat(initBurette2) || 0);
  const liveTA2    = enableConcordant && sampleVol && finalBurette2
    ? ((vTitrant2 * parseFloat(normality) * eqWt) / (parseFloat(sampleVol) * 10))
    : null;
  const liveTA2Str = liveTA2 !== null ? liveTA2.toFixed(4) : null;

  // ── Concordance check ─────────────────────────────────────────────────────
  const isConcordant = liveTA !== null && liveTA2 !== null
    ? Math.abs(vTitrant - vTitrant2) <= CONCORDANT_TOLERANCE
    : null;

  // Mean TA when concordant results are present
  const meanTA    = liveTA !== null && liveTA2 !== null ? ((liveTA + liveTA2) / 2) : liveTA;
  const meanTAStr = meanTA !== null ? meanTA.toFixed(4) : null;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.from('titration_logs')
          .select('*, logger:employees!titration_logs_logged_by_fkey(full_name, initials)')
          .order('created_at', { ascending: false })
          .limit(200),
        15000, 'Titration logs load timed out'
      );
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      toast.error('Failed to load titration logs.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchLogs();
    supabase.from('batches').select('id, batch_id, product_name, status')
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setBatches(data || []));
    supabase.from('bioprocess_experiments').select('id, title, type')
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setExperiments(data || []));
    supabase.from('inventory_items').select('id, name, category, unit')
      .order('name', { ascending: true })
      .then(({ data }) => setInventoryItems(data || []));
  }, [fetchLogs, supabase]);

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sampleName || !finalBurette || !sampleVol) {
      const missing = [];
      if (!sampleName) missing.push('Sample Name');
      if (!sampleVol) missing.push('Sample Volume (ml)');
      if (!finalBurette) missing.push('Final Burette Reading (ml)');
      toast.warn(`Cannot save TA log. Missing mandatory details: ${missing.join(', ')}.`);
      return;
    }
    if (vTitrant <= 0) {
      toast.warn('Final burette reading must be greater than initial reading.');
      return;
    }
    // ── ALOCA++: concordant check – warn but allow override ──────────────
    if (enableConcordant && finalBurette2) {
      if (vTitrant2 <= 0) {
        toast.warn('Second final burette reading must be greater than second initial reading.');
        return;
      }
      if (!isConcordant) {
        toast.warn(
          `Readings are NOT concordant (difference ${Math.abs(vTitrant - vTitrant2).toFixed(2)} mL > ${CONCORDANT_TOLERANCE} mL tolerance). Please repeat the titration or remove the second reading.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        source_type: sourceType,
        source_id: sourceId || null,
        source_label: sourceLabel || null,
        sample_name: sampleName,
        sample_description: sampleDesc || null,
        acid_type: acidType,
        equivalent_weight: eqWt,
        titrant_normality: parseFloat(normality),
        sample_volume_ml: parseFloat(sampleVol),
        initial_burette_ml: parseFloat(initBurette) || 0,
        final_burette_ml: parseFloat(finalBurette),
        elapsed_hours: elapsedHours ? parseFloat(elapsedHours) : null,
        notes: notes || null,
        inventory_item_id: inventoryItemId || null,
        // Concordant fields
        concordant_enabled: enableConcordant && !!finalBurette2,
        initial_burette_2_ml: enableConcordant && finalBurette2 ? (parseFloat(initBurette2) || 0) : null,
        final_burette_2_ml: enableConcordant && finalBurette2 ? parseFloat(finalBurette2) : null,
        mean_ta_percent: enableConcordant && finalBurette2 ? meanTA : null,
      };
      
      const res = await fetch('/api/lab-bench/ta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to log titration');
      
      const taLabel = enableConcordant && finalBurette2 ? `Mean: ${meanTAStr}%` : `${liveTAStr}%`;
      toast.success(`TA logged: ${taLabel} (${acidType})`);
      if (data.deductionLogs?.length) {
        data.deductionLogs.forEach(msg => toast.info(msg));
      }

      // Reset form
      setSampleName(''); setSampleDesc(''); setFinalBurette(''); setInitBurette('0');
      setSampleVol('9'); setElapsedHours(''); setNotes(''); setSourceId(''); setSourceLabel(''); setInventoryItemId('');
      setEnableConcordant(false); setInitBurette2('0'); setFinalBurette2('');
      setShowForm(false);
      fetchLogs();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── ALOCA++-compliant delete handler ─────────────────────────────────────
  const handleDelete = async (log) => {
    // ── ALOCA++ P0: request reason + e-signature PIN before deletion ────
    let auditResult;
    try {
      auditResult = await requestReason();
    } catch {
      // User cancelled
      return;
    }

    setDeletingId(log.id);
    try {
      const res = await fetch(`/api/lab-bench/ta?id=${log.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: auditResult.reason,
          pin: auditResult.pin,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete titration log');
      toast.success(`Titration log deleted. Reason: ${auditResult.reason}`);
      fetchLogs();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered + grouped logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (filterSource !== 'ALL' && l.source_type !== filterSource) return false;
      if (filterAcid !== 'ALL' && l.acid_type !== filterAcid) return false;
      return true;
    });
  }, [logs, filterSource, filterAcid]);

  // Stats
  const stats = useMemo(() => {
    if (!filteredLogs.length) return null;
    const vals = filteredLogs.map(l => parseFloat(l.ta_percent)).filter(v => !isNaN(v));
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const inRange = vals.filter(v => {
      const c = ACID_TYPES[filteredLogs[vals.indexOf(v)]?.acid_type] || cfg;
      return v >= c.target_min && v <= c.target_max;
    }).length;
    return { avg: avg.toFixed(3), min: min.toFixed(3), max: max.toFixed(3), total: vals.length, inRange };
  }, [filteredLogs, cfg]);

  const batchOptions = batches.filter(b => ['active', 'fermentation', 'in_progress'].includes(b.status) || true);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-fade-in pb-32 md:pb-8">
      {/* ── ALOCA++ audit modal ─────────────────────────────────────────── */}
      {auditModal}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Droplets className="w-8 h-8 text-slate-600" />
            Titratable Acidity (TA) Lab
          </h1>
          <p className="mt-1 text-slate-500 font-medium">
            Log titration experiments for any sample — batches, R&D, raw materials, or standalone.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-5 py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Log Titration'}
        </button>
      </div>

      {/* ── Formula Reference Card ──────────────────────────────────────── */}
      <div className="glass-card rounded-2xl border border-slate-200 bg-slate-50/40 p-4 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-2 text-slate-800">
          <Calculator className="w-5 h-5 shrink-0" />
          <code className="text-sm font-black tracking-tight">
            TA(%) = (V_titrant × N_titrant × Eq_Wt) ÷ (V_sample × 10)
          </code>
        </div>
        <div className="flex gap-4 text-xs font-semibold text-slate-700 flex-wrap">
          {Object.entries(ACID_TYPES).map(([name, a]) => (
            <span key={name} className="px-2 py-1 bg-white/70 rounded-lg border border-slate-200">
              {name}: Eq.Wt = {a.eq_wt} g/mol
            </span>
          ))}
        </div>
      </div>

      {/* ── Titration Form ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="glass-card rounded-2xl border border-slate-200/50 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-bold text-slate-900">New Titration Entry</h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Source + Sample */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Sample Source</label>
                <select value={sourceType} onChange={e => { setSourceType(e.target.value); setSourceId(''); setSourceLabel(''); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none bg-white text-slate-900 focus:ring-2 focus:ring-slate-500">
                  {SOURCE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Sample Name <span className="text-red-500">*</span></label>
                <input value={sampleName} onChange={e => setSampleName(e.target.value)} required
                  placeholder="e.g. Flask A at T+12h, Lot #RM-042..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
              </div>
            </div>

            {/* Batch / Experiment selector */}
            {sourceType === 'batch' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Link to Batch</label>
                  <select value={sourceId} onChange={e => {
                    const b = batches.find(x => x.id === e.target.value);
                    setSourceId(e.target.value);
                    setSourceLabel(b ? `${b.batch_id} — ${b.product_name}` : '');
                  }} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none bg-white text-slate-900 focus:ring-2 focus:ring-slate-500">
                    <option value="">Select batch (optional)...</option>
                    {batchOptions.map(b => <option key={b.id} value={b.id}>{b.batch_id} — {b.product_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Elapsed T+ Hours</label>
                  <input type="number" step="0.1" value={elapsedHours} onChange={e => setElapsedHours(e.target.value)}
                    placeholder="e.g. 12.0"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
                </div>
              </div>
            )}
            {sourceType === 'bioprocess_experiment' && (
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Link to Experiment</label>
                <select value={sourceId} onChange={e => {
                  const ex = experiments.find(x => x.id === e.target.value);
                  setSourceId(e.target.value);
                  setSourceLabel(ex ? ex.title : '');
                }} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none bg-white text-slate-900 focus:ring-2 focus:ring-slate-500">
                  <option value="">Select experiment (optional)...</option>
                  {experiments.map(ex => <option key={ex.id} value={ex.id}>{ex.title} ({ex.type.toUpperCase()})</option>)}
                </select>
              </div>
            )}
            {sourceType === 'raw_material' && (
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Raw Material / Lot Label</label>
                <input value={sourceLabel} onChange={e => setSourceLabel(e.target.value)}
                  placeholder="e.g. Coconut Milk Lot #RM-042"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
              </div>
            )}

            {/* Acid type */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Acid Type</label>
              <div className="flex gap-2">
                {Object.entries(ACID_TYPES).map(([name, a]) => (
                  <button key={name} type="button" onClick={() => setAcidType(name)}
                    className={`flex-1 py-2 px-3 text-xs font-black rounded-xl border transition-all ${acidType === name
                      ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                    style={acidType === name ? { backgroundColor: a.color } : {}}>
                    {name}<br/>
                    <span className="font-normal opacity-80">{a.eq_wt}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3"/> {cfg.note} | Target: {cfg.target_min}–{cfg.target_max}%
              </p>
            </div>

            {/* Traceability */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Titrant Traceability (Auto-Deduct)</label>
              <select value={inventoryItemId} onChange={e => setInventoryItemId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none bg-white text-slate-900 focus:ring-2 focus:ring-slate-500">
                <option value="">Select chemical to deduct (optional)...</option>
                {inventoryItems.map(item => (
                  <option key={item.id} value={item.id}>{item.name} ({item.category})</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Select the item to automatically deduct the used volume from the oldest available lot (FIFO).</p>
            </div>

            {/* ── Reading 1: Titration parameters ─────────────────────────── */}
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                Reading 1 {enableConcordant && <span className="text-indigo-500">(Primary)</span>}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Normality (N)</label>
                  <input type="number" step="0.001" value={normality} onChange={e => setNormality(e.target.value)}
                    placeholder="0.1" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Sample Vol (mL) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.1" value={sampleVol} onChange={e => setSampleVol(e.target.value)} required
                    placeholder="9.0" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Initial Burette (mL)</label>
                  <input type="number" step="0.01" value={initBurette} onChange={e => setInitBurette(e.target.value)}
                    placeholder="0.00" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Final Burette (mL) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" value={finalBurette} onChange={e => setFinalBurette(e.target.value)} required
                    placeholder="e.g. 7.65" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
                </div>
              </div>
            </div>

            {/* ── Live TA Result (Reading 1) ───────────────────────────────── */}
            {liveTAStr && (
              <div className={`rounded-2xl p-4 flex items-center gap-4 border-2 transition-all ${
                taStatus === 'ok' ? 'bg-emerald-50 border-emerald-400' :
                taStatus === 'low' ? 'bg-amber-50 border-amber-400' : 'bg-red-50 border-red-400'
              }`}>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-0.5">
                    {enableConcordant ? 'Reading 1' : 'Live Calculation'}
                  </p>
                  <p className={`text-4xl font-black tabular-nums ${
                    taStatus === 'ok' ? 'text-emerald-700' : taStatus === 'low' ? 'text-amber-700' : 'text-red-700'
                  }`}>{liveTAStr}<span className="text-lg font-bold ml-1">% TA</span></p>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Volume used: {vTitrant.toFixed(2)} mL · Eq.Wt: {eqWt} g/mol
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-black border ${
                  taStatus === 'ok' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                  taStatus === 'low' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300'
                }`}>
                  {taStatus === 'ok' ? '✓ In Range' : taStatus === 'low' ? '↓ Below Target' : '↑ Above Target'}
                </div>
              </div>
            )}

            {/* ── Concordant Reading Toggle ───────────────────────────────── */}
            <div className="border border-indigo-100 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => { setEnableConcordant(v => !v); setFinalBurette2(''); setInitBurette2('0'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors ${
                  enableConcordant
                    ? 'bg-indigo-50 text-indigo-800 border-b border-indigo-100'
                    : 'bg-slate-50 text-slate-600 hover:bg-indigo-50/50'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${enableConcordant ? 'text-indigo-600' : 'text-slate-300'}`} />
                Add Concordant Reading (ALOCA++ – duplicate titration for verification)
                <span className="ml-auto text-xs font-semibold text-slate-400">Tolerance: ≤{CONCORDANT_TOLERANCE} mL</span>
              </button>

              {enableConcordant && (
                <div className="p-4 space-y-4 bg-indigo-50/30">
                  <p className="text-xs text-indigo-700 font-semibold flex items-center gap-1">
                    <Info className="w-3 h-3 shrink-0"/>
                    Enter a second, independent titration result. Both readings must agree within {CONCORDANT_TOLERANCE} mL to be accepted. The mean TA will be committed.
                  </p>
                  {/* Reading 2 */}
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Reading 2 (Concordant)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Initial Burette 2 (mL)</label>
                        <input type="number" step="0.01" value={initBurette2} onChange={e => setInitBurette2(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-indigo-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-indigo-400 bg-white"/>
                      </div>
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Final Burette 2 (mL)</label>
                        <input type="number" step="0.01" value={finalBurette2} onChange={e => setFinalBurette2(e.target.value)}
                          placeholder="e.g. 7.70"
                          className="w-full px-3 py-2 border border-indigo-200 rounded-xl text-sm font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-indigo-400 bg-white"/>
                      </div>
                    </div>
                  </div>

                  {/* Concordance result panel */}
                  {liveTA2Str && (
                    <div className={`rounded-xl p-4 border-2 ${
                      isConcordant ? 'bg-emerald-50 border-emerald-400' : 'bg-red-50 border-red-400'
                    }`}>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500 mb-0.5">Reading 2</p>
                          <p className="text-2xl font-black tabular-nums text-slate-800">{liveTA2Str}<span className="text-sm ml-1">% TA</span></p>
                          <p className="text-xs text-slate-500">Vol: {vTitrant2.toFixed(2)} mL</p>
                        </div>
                        <div className="border-l border-slate-200 pl-4">
                          <p className="text-xs font-black uppercase text-slate-500 mb-0.5">Difference</p>
                          <p className={`text-2xl font-black tabular-nums ${isConcordant ? 'text-emerald-700' : 'text-red-700'}`}>
                            {Math.abs(vTitrant - vTitrant2).toFixed(2)} mL
                          </p>
                        </div>
                        <div className="border-l border-slate-200 pl-4">
                          <p className="text-xs font-black uppercase text-slate-500 mb-0.5">Mean TA</p>
                          <p className="text-2xl font-black tabular-nums text-slate-900">{meanTAStr}<span className="text-sm ml-1">%</span></p>
                        </div>
                        <div className={`ml-auto px-4 py-2 rounded-xl text-sm font-black border ${
                          isConcordant
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}>
                          {isConcordant ? '✓ Concordant' : '✗ Not Concordant'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <input value={sampleDesc} onChange={e => setSampleDesc(e.target.value)} placeholder="Sample description (optional)"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold outline-none text-slate-900 focus:ring-2 focus:ring-slate-500"/>

            <button type="submit"
              disabled={saving || !liveTAStr || (enableConcordant && finalBurette2 && !isConcordant)}
              className="w-full py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl text-sm uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
              <Droplets className="w-4 h-4"/>
              {saving
                ? 'Saving...'
                : enableConcordant && meanTAStr
                  ? `Commit — Mean TA = ${meanTAStr}%`
                  : `Commit — TA = ${liveTAStr || '?'}%`}
            </button>
          </form>
        </div>
      )}

      {/* ── Stats Strip ─────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Entries', value: stats.total },
            { label: 'Average TA', value: `${stats.avg}%` },
            { label: 'Range', value: `${stats.min} – ${stats.max}%` },
            { label: 'In Target', value: `${stats.inRange} / ${stats.total}`, highlight: stats.inRange < stats.total },
          ].map(s => (
            <div key={s.label} className={`glass-card rounded-2xl p-4 border ${s.highlight ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200/50'}`}>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-black tabular-nums ${s.highlight ? 'text-amber-700' : 'text-slate-800'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl border border-slate-200/50 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">Source:</span>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold outline-none bg-white text-slate-900 focus:ring-2 focus:ring-slate-500">
            <option value="ALL">All Sources</option>
            {SOURCE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">Acid:</span>
          <select value={filterAcid} onChange={e => setFilterAcid(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold outline-none bg-white text-slate-900 focus:ring-2 focus:ring-slate-500">
            <option value="ALL">All Types</option>
            {Object.keys(ACID_TYPES).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <button onClick={fetchLogs} disabled={loading} className="ml-auto px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1 transition-colors disabled:opacity-70">
          {loading ? <OxygenLoader size="small" text="Loading..." /> : <><RefreshCw className="w-3.5 h-3.5"/>Refresh</>}
        </button>
      </div>

      {/* ── Log Table ───────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl border border-slate-200/50 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500"/>
          <h2 className="text-sm font-bold text-slate-900">Titration History</h2>
          <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {filteredLogs.length} entries
          </span>
        </div>
        {loading ? (
          <OxygenLoader className="py-16" text="Loading History..." />
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Beaker className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="font-semibold">No titration entries yet.</p>
            <p className="text-xs mt-1">Use the "Log Titration" button above to record your first TA measurement.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] divide-y divide-gray-100">
              <thead>
                <tr className="bg-slate-50/50">
                  {['Sample', 'Source', 'Acid Type', 'V used (mL)', 'TA %', 'Concordant', 'Status', 'T+ hr', 'By', 'Date', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLogs.map(log => {
                  const c = ACID_TYPES[log.acid_type] || ACID_TYPES['Lactic Acid'];
                  const ta = parseFloat(log.ta_percent);
                  const inRange = ta >= c.target_min && ta <= c.target_max;
                  const hasConcordant = log.concordant_enabled && log.final_burette_2_ml != null;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/30 group">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-bold text-slate-800">{log.sample_name}</p>
                        {log.source_label && <p className="text-xs text-slate-400 truncate max-w-[160px]">{log.source_label}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-bold capitalize">
                          {log.source_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{log.acid_type}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-slate-700 tabular-nums">
                        {parseFloat(log.titrant_volume_ml).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-base font-black tabular-nums ${inRange ? 'text-emerald-700' : 'text-red-600'}`}>
                          {/* Show mean TA if concordant, else normal ta_percent */}
                          {hasConcordant && log.mean_ta_percent != null
                            ? `${parseFloat(log.mean_ta_percent).toFixed(3)}%`
                            : `${ta.toFixed(3)}%`}
                        </span>
                        {hasConcordant && <p className="text-[10px] text-slate-400">mean</p>}
                      </td>
                      {/* Concordant column */}
                      <td className="px-4 py-2.5">
                        {hasConcordant ? (
                          <span className="px-2 py-0.5 rounded-lg text-xs font-black border bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-nowrap">
                            ✓ Concordant
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-black border ${
                          inRange ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {inRange ? '✓ In Range' : ta < c.target_min ? '↓ Low' : '↑ High'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-500 tabular-nums">
                        {log.elapsed_hours != null ? `T+${parseFloat(log.elapsed_hours).toFixed(1)}h` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-bold text-slate-600">
                          {log.logger?.initials || '?'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      {/* ── ALOCA++ Delete ─────────────────────────────────── */}
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => handleDelete(log)}
                          disabled={deletingId === log.id}
                          title="Delete titration log (ALOCA++ audit required)"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 border border-red-100 disabled:opacity-50"
                        >
                          {deletingId === log.id
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/>
                            : <Trash2 className="w-3.5 h-3.5"/>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
