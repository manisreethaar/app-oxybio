'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, BarChart2, Activity, Beaker, Loader2, Save,
  Play, Plus, Trash2, CheckCircle, AlertTriangle, Info,
  ChevronUp, ChevronDown, FlaskConical, TrendingUp, Settings,
  Link2, Download, X,
} from 'lucide-react';
import CreatorBadge from '@/components/ui/CreatorBadge';
import { downloadCsvWithHash } from '@/utils/exportUtils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Scatter, ScatterChart, ReferenceLine, Legend,
  ComposedChart,
} from 'recharts';

// ── Constants ────────────────────────────────────────────────────────────────
const PBD_DESIGN = [
  [+1,+1,+1,-1,+1,+1,+1,-1,-1,-1,-1],
  [-1,+1,+1,+1,-1,+1,+1,+1,-1,-1,-1],
  [+1,-1,+1,+1,+1,-1,+1,+1,+1,-1,-1],
  [-1,+1,-1,+1,+1,+1,-1,+1,+1,+1,-1],
  [-1,-1,+1,-1,+1,+1,+1,-1,+1,+1,+1],
  [+1,-1,-1,+1,-1,+1,+1,+1,-1,+1,+1],
  [+1,+1,-1,-1,+1,-1,+1,+1,+1,-1,+1],
  [+1,+1,+1,-1,-1,+1,-1,+1,+1,+1,-1],
  [-1,+1,+1,+1,-1,-1,+1,-1,+1,+1,+1],
  [+1,-1,+1,+1,+1,-1,-1,+1,-1,+1,+1],
  [+1,+1,-1,+1,+1,+1,-1,-1,+1,-1,+1],
  [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
];

const BBD_DESIGN = [
  [-1,-1, 0],[+1,-1, 0],[-1,+1, 0],[+1,+1, 0],
  [-1, 0,-1],[+1, 0,-1],[-1, 0,+1],[+1, 0,+1],
  [ 0,-1,-1],[ 0,+1,-1],[ 0,-1,+1],[ 0,+1,+1],
  [ 0, 0, 0],[ 0, 0, 0],[ 0, 0, 0],
];

const TYPE_META = {
  pbd: { label: 'Plackett-Burman Design', color: 'text-slate-700 bg-slate-50 border-slate-200', runs: 12 },
  rsm: { label: 'Response Surface Methodology', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', runs: 15 },
  kinetics: { label: 'Fermentation Kinetics', color: 'text-amber-700 bg-amber-50 border-amber-200', runs: null },
};

const TERM_LABELS = {
  'β0': 'Intercept', 'β1': 'Factor A (linear)', 'β2': 'Factor B (linear)', 'β3': 'Factor C (linear)',
  'β11': 'Factor A² (quadratic)', 'β22': 'Factor B² (quadratic)', 'β33': 'Factor C² (quadratic)',
  'β12': 'A×B (interaction)', 'β13': 'A×C (interaction)', 'β23': 'B×C (interaction)',
};

const KINETICS_MODEL_OPTIONS = [
  { value: 'monod', label: 'Monod Growth Kinetics', desc: 'μ = μmax × [S] / (Ks + [S]) — fits growth rate vs substrate' },
  { value: 'michaelis_menten', label: 'Michaelis-Menten Enzyme Kinetics', desc: 'v = Vmax × [S] / (Km + [S]) — fits enzyme reaction rate vs substrate' },
  { value: 'luedeking_piret', label: 'Luedeking-Piret Batch Simulation', desc: 'rP = α·dX/dt + β·X — simulate full batch with ODE model' },
];

// ── Heatmap Renderer ─────────────────────────────────────────────────────────
function RSMHeatmap({ heatmap, factors }) {
  if (!heatmap?.length) return null;
  const flat = heatmap.flat();
  const min = Math.min(...flat), max = Math.max(...flat);
  const norm = v => (max > min) ? (v - min) / (max - min) : 0.5;
  const toColor = (v) => {
    const t = norm(v);
    const r = Math.round(34 + (220 - 34) * t), g = Math.round(139 + (38 - 139) * (1 - t)), b = Math.round(34 + (127 - 34) * (1 - t));
    return `rgb(${r},${g},${b})`;
  };
  const G = heatmap.length;
  const fA = factors[0], fB = factors[1];
  // A-40: Find optimal point (maximum value position)
  let optRow = 0, optCol = 0;
  heatmap.forEach((row, i) => row.forEach((val, j) => { if (val > heatmap[optRow][optCol]) { optRow = i; optCol = j; } }));
  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">2D surface — Factor C held at centre level</p>
      <div className="flex items-start gap-2">
        <div className="text-xs text-slate-400 flex flex-col justify-between h-full pr-1" style={{ minHeight: '200px' }}>
          <span>{fA ? fA.high_value : '+1'}</span>
          <span className="rotate-90 whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>{fA ? fA.variable : 'Factor A'}</span>
          <span>{fA ? fA.low_value : '-1'}</span>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${G}, 10px)`, gap: '1px', position: 'relative' }}>
            {heatmap.map((row, i) =>
              row.map((val, j) => (
                <div key={`${i}-${j}`} title={val.toFixed(3)}
                  style={{ width: 10, height: 10, backgroundColor: toColor(val), borderRadius: 1,
                    outline: i===optRow && j===optCol ? '2px solid #fff' : 'none',
                    boxShadow: i===optRow && j===optCol ? '0 0 0 1px #000' : 'none',
                  }}>
                  {i===optRow && j===optCol && <span style={{ fontSize: 7, lineHeight: '10px', textAlign: 'center', display: 'block', color: '#fff', fontWeight: 900 }}>★</span>}
                </div>
              ))
            )}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1 px-0.5">
            <span>{fB ? fB.low_value : '-1'}</span>
            <span>{fB ? fB.variable : 'Factor B'}</span>
            <span>{fB ? fB.high_value : '+1'}</span>
          </div>
        </div>
        <div className="ml-2 flex flex-col items-center gap-1" style={{ minHeight: '200px', justifyContent: 'space-between' }}>
          <span className="text-xs text-slate-500">{max.toFixed(2)}</span>
          <div style={{ width: 12, height: 120, background: 'linear-gradient(to bottom, rgb(220,38,127), rgb(34,139,34))', borderRadius: 4 }} />
          <span className="text-xs text-slate-500">{min.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ── A-67: Predictive Models Tab ──────────────────────────────────────────────
function PredictiveModelsTab({ supabase, toast }) {
  const [models,   setModels]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({ model_name: '', version: '1.0', target_variable: '', confidence_interval: '', feature_weights: '{}' });

  useEffect(() => {
    withTimeout(
      supabase.from('predictive_models').select('*').order('created_at', { ascending: false }),
      45000, 'Predictive models load timed out'
    )
      .then(({ data }) => { setModels(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [supabase]);

  const handleSave = async () => {
    if (!form.model_name || !form.target_variable) {
      const missing = [];
      if (!form.model_name) missing.push('Model Name');
      if (!form.target_variable) missing.push('Target Variable');
      toast.warn(`Cannot save model. Missing mandatory details: ${missing.join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      let weights = {};
      try { weights = JSON.parse(form.feature_weights); } catch { /* invalid JSON — keep empty */ }
      const { error } = await supabase.from('predictive_models').insert({
        model_name: form.model_name, version: form.version, target_variable: form.target_variable,
        confidence_interval: form.confidence_interval ? parseFloat(form.confidence_interval) : null,
        feature_weights: weights, is_active: true,
      });
      if (error) throw error;
      toast.success('Predictive model registered.');
      setShowForm(false);
      supabase.from('predictive_models').select('*').order('created_at', { ascending: false }).then(({ data }) => setModels(data || []));
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-900">A-67 Predictive Model Registry</h3>
          <p className="text-xs text-slate-500 mt-0.5">Register ML models for process variable prediction (yield, CFU, pH endpoint)</p>
        </div>
        <button onClick={() => setShowForm(v=>!v)} className="px-4 py-2 bg-navy text-white font-bold rounded-lg text-xs uppercase tracking-wider hover:bg-navy-hover">Register Model</button>
      </div>
      {showForm && (
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Model Name</label><input value={form.model_name} onChange={e=>setForm(f=>({...f,model_name:e.target.value}))} className="field-input" placeholder="e.g. pH Endpoint Predictor v1"/></div>
            <div><label className="field-label">Version</label><input value={form.version} onChange={e=>setForm(f=>({...f,version:e.target.value}))} className="field-input" placeholder="1.0"/></div>
            <div><label className="field-label">Target Variable</label><input value={form.target_variable} onChange={e=>setForm(f=>({...f,target_variable:e.target.value}))} className="field-input" placeholder="e.g. final_ph, cfu_per_ml, yield_ml"/></div>
            <div><label className="field-label">Confidence Interval (%)</label><input type="number" step="0.1" value={form.confidence_interval} onChange={e=>setForm(f=>({...f,confidence_interval:e.target.value}))} className="field-input" placeholder="95"/></div>
          </div>
          <div><label className="field-label">Feature Weights (JSON)</label>
            <textarea value={form.feature_weights} onChange={e=>setForm(f=>({...f,feature_weights:e.target.value}))} rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono outline-none resize-none"
              placeholder='{"inoculation_pct": 0.35, "initial_ph": 0.28, "temp_c": 0.22, "brix_0": 0.15}'/>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-navy text-white font-bold rounded-lg text-xs uppercase disabled:opacity-50">{saving?'Saving...':'Register'}</button>
            <button onClick={()=>setShowForm(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs">Cancel</button>
          </div>
        </div>
      )}
      {models.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm">No predictive models registered yet. Register a model above to track ML-based process predictions.</div>
      ) : (
        <div className="space-y-3">
          {models.map(m => (
            <div key={m.id} className={`card p-4 border-l-4 ${m.is_active ? 'border-l-emerald-500' : 'border-l-gray-300'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-black text-slate-900">{m.model_name} <span className="text-slate-400 font-semibold text-xs">v{m.version}</span></p>
                  <p className="text-xs text-slate-600 mt-0.5">Target: <strong>{m.target_variable}</strong> · CI: {m.confidence_interval ? `${m.confidence_interval}%` : '—'}</p>
                  {m.feature_weights && Object.keys(m.feature_weights).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(m.feature_weights).map(([feat, weight]) => (
                        <span key={feat} className="px-2 py-0.5 bg-slate-50 text-slate-700 border border-slate-100 rounded text-xs font-bold">{feat}: {weight}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`text-xs font-black px-2 py-1 rounded-lg border uppercase ${m.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {m.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── A-65: Scale-Down Model Form ──────────────────────────────────────────────
function ScaleDownForm({ experimentId, supabase, toast, batches }) {
  const [prodBatchId,   setProdBatchId]   = useState('');
  const [scalingFactor, setScalingFactor] = useState('');
  const [compScore,     setCompScore]     = useState('');
  const [notes,         setNotes]         = useState('');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(null);

  const handleSave = async () => {
    if (!prodBatchId || !scalingFactor) {
      const missing = [];
      if (!prodBatchId) missing.push('Production Batch');
      if (!scalingFactor) missing.push('Scaling Factor');
      toast.warn(`Cannot link scale-up. Missing mandatory details: ${missing.join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('scale_down_models').upsert({
        bench_scale_batch_id:      experimentId,
        production_scale_batch_id: prodBatchId,
        scaling_factor:            parseFloat(scalingFactor),
        comparability_score:       compScore ? parseFloat(compScore) : null,
        notes:                     notes || null,
      }, { onConflict: 'bench_scale_batch_id' }).select().single();
      if (error) throw error;
      setSaved(data);
      toast.success('Scale-down model saved.');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Production Scale Batch *</label>
          <select value={prodBatchId} onChange={e=>setProdBatchId(e.target.value)} className="field-input bg-white">
            <option value="">Select production batch...</option>
            {(batches || []).map(b => <option key={b.id} value={b.id}>{b.batch_id} ({b.variant})</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Scaling Factor (production vol / bench vol) *</label>
          <input type="number" step="0.1" value={scalingFactor} onChange={e=>setScalingFactor(e.target.value)} className="field-input" placeholder="e.g. 10 (bench 0.25L → prod 2.5L)"/>
        </div>
        <div>
          <label className="field-label">Comparability Score (0–1)</label>
          <input type="number" step="0.01" min="0" max="1" value={compScore} onChange={e=>setCompScore(e.target.value)} className="field-input" placeholder="e.g. 0.85 based on pH + CFU similarity"/>
        </div>
        <div>
          <label className="field-label">Notes</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} className="field-input" placeholder="Key process differences between scales"/>
        </div>
      </div>
      {saved && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800">
          ✓ Scale-down model saved — scaling factor {scalingFactor}× · comparability {compScore || '—'}
        </div>
      )}
      <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Scale-Down Model'}
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function BioprocessDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [experiment, setExperiment] = useState(null);
  const [factors, setFactors] = useState([]);
  const [responses, setResponses] = useState([]);
  const [kineticData, setKineticData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('setup');
  const [saving, setSaving] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState(null);
  const [localFactors, setLocalFactors] = useState([]);
  const [localResponses, setLocalResponses] = useState([]);
  const [localKinetics, setLocalKinetics] = useState([]);
  const [kineticConfig, setKineticConfig] = useState({});
  const [batches, setBatches] = useState([]);
  const [creatingRSM, setCreatingRSM] = useState(false);
  const [sopBlock, setSopBlock] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withTimeout(fetch(`/api/bioprocess/${id}`), 45000, 'Bioprocess experiment load timed out');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setExperiment(json.experiment);
      setFactors(json.factors);
      setResponses(json.responses);
      setKineticData(json.kineticData);
      setLocalFactors(json.factors.map(f => ({ ...f })));
      setLocalResponses(json.responses.map(r => ({ ...r })));
      setLocalKinetics(json.kineticData.map(d => ({ ...d })));
      setKineticConfig(json.experiment.config || {});
      if (json.experiment.analysis_result && Object.keys(json.experiment.analysis_result).length > 0) {
        setResult(json.experiment.analysis_result);
      }
    } catch (e) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/batches');
      const json = await res.json();
      if (res.ok) setBatches(json.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (experiment?.type === 'kinetics') fetchBatches();
  }, [experiment?.type, fetchBatches]);

  // ── Factor Helpers ────────────────────────────────────────────────────────
  const addFactor = () => {
    const pos = localFactors.length + 1;
    const maxFactors = experiment?.type === 'rsm' ? 3 : 11;
    if (pos > maxFactors) return toast.warn(`Maximum ${maxFactors} factors for ${experiment?.type?.toUpperCase()}`);
    const code = experiment?.type === 'rsm' ? ['A','B','C'][localFactors.length] : `X${pos}`;
    setLocalFactors(f => [...f, { code, variable: '', unit: '', low_value: '', center_value: '', high_value: '', position: pos }]);
  };

  const removeFactor = (idx) => setLocalFactors(f => {
    const next = f.filter((_, i) => i !== idx).map((x, i) => ({
      ...x,
      position: i + 1,
      code: experiment?.type === 'rsm' ? ['A','B','C'][i] : `X${i+1}`,
    }));
    return next;
  });

  const updateFactor = (idx, field, val) => setLocalFactors(f => f.map((x, i) => i === idx ? { ...x, [field]: val } : x));

  // ── Response Helpers ──────────────────────────────────────────────────────
  const updateResponse = (runNum, val) => setLocalResponses(r => r.map(x => x.run_number === runNum ? { ...x, response: val === '' ? null : +val } : x));
  const updateResponseNotes = (runNum, val) => setLocalResponses(r => r.map(x => x.run_number === runNum ? { ...x, notes: val } : x));

  // ── Kinetics Data Helpers ─────────────────────────────────────────────────
  const addKineticRow = () => setLocalKinetics(k => [...k, { substrate: '', rate: '', time_h: '', biomass: '', product: '' }]);
  const removeKineticRow = (idx) => setLocalKinetics(k => k.filter((_, i) => i !== idx));
  const updateKineticRow = (idx, field, val) => setLocalKinetics(k => k.map((x, i) => i === idx ? { ...x, [field]: val === '' ? null : +val } : x));

  // ── Delete experiment ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete "${experiment.title}"? All data will be lost.`)) return;
    try {
      const res = await fetch(`/api/bioprocess/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Experiment deleted');
      router.push('/bioprocess');
    } catch (e) { toast.error(e.message); }
  };

  // ── Create RSM from PBD significant factors ───────────────────────────────
  const handleCreateRSM = async (sigFactors) => {
    setCreatingRSM(true);
    try {
      const res = await fetch('/api/bioprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${experiment.title} -- RSM`,
          description: `RSM follow-up from PBD screening: ${experiment.title}`,
          type: 'rsm',
          response_variable: experiment.response_variable,
          response_unit: experiment.response_unit || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const top3 = sigFactors.slice(0, 3);
      if (top3.length > 0) {
        const factors = top3.map((f, i) => {
          const orig = localFactors.find(lf => lf.code === f.code);
          const lo = orig ? +orig.low_value : 0;
          const hi = orig ? +orig.high_value : 0;
          return {
            position: i + 1, code: ['A','B','C'][i],
            variable: f.variable, unit: orig?.unit || '',
            low_value: lo, center_value: +((lo + hi) / 2).toFixed(3), high_value: hi,
          };
        });
        await fetch(`/api/bioprocess/${json.data.id}/runs`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factors, responses: [] }),
        });
      }
      toast.success('RSM experiment created with significant factors pre-filled');
      router.push(`/bioprocess/${json.data.id}`);
    } catch (e) { toast.error(e.message); }
    finally { setCreatingRSM(false); }
  };

  // ── Link batch to kinetics experiment ─────────────────────────────────────
  const handleLinkBatch = async (batchId) => {
    try {
      const res = await fetch(`/api/bioprocess/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId || null }),
      });
      if (!res.ok) throw new Error('Failed to update batch link');
      toast.success(batchId ? 'Batch linked -- fermentation data will sync automatically' : 'Batch unlinked');
      await fetchData();
    } catch (e) { toast.error(e.message); }
  };

  // ── Export design matrix as CSV ───────────────────────────────────────────
  const exportDesignCSV = () => {
    const design = experiment.type === 'pbd' ? PBD_DESIGN : BBD_DESIGN;
    const nRuns = experiment.type === 'pbd' ? 12 : 15;
    const fHeaders = localFactors.map(f => `${f.code}_${f.variable}${f.unit ? '_'+f.unit : ''}`);
    const header = ['Run', ...fHeaders, `Y_${experiment.response_variable}`, 'Notes'];
    const rows = Array.from({ length: nRuns }, (_, ri) => {
      const row = design[ri];
      const resp = localResponses.find(r => r.run_number === ri + 1);
      const isCenter = experiment.type === 'rsm' && ri >= 12;
      return [
        ri + 1,
        ...localFactors.map((f, fi) => {
          const level = row[fi];
          if (isCenter) return f.center_value ?? '';
          return level === 1 ? f.high_value : f.low_value;
        }),
        resp?.response ?? '',
        resp?.notes ? `"${resp.notes.replace(/"/g, '""')}"` : '',
      ];
    });
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    downloadCsvWithHash(csv, `${experiment.title.replace(/[^\w]/g, '_')}_design.csv`);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveAll = async () => {
    setSaving(true);
    setSopBlock(null);
    try {
      // Save factors + responses
      const res = await fetch(`/api/bioprocess/${id}/runs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factors: localFactors.map(f => ({
            position: f.position, code: f.code, variable: f.variable, unit: f.unit || null,
            low_value: +f.low_value, center_value: f.center_value !== '' ? +f.center_value : null,
            high_value: +f.high_value,
          })).filter(f => f.variable),
          responses: localResponses,
          kineticData: experiment?.type === 'kinetics' ? localKinetics : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.sop_violation) setSopBlock(json);
        throw new Error(json.error || 'Failed to save run data');
      }
      // Save kinetics config
      if (experiment?.type === 'kinetics') {
        await fetch(`/api/bioprocess/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: kineticConfig }),
        });
      }
      toast.success('Saved');
      await fetchData();
    } catch (e) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Analyse ───────────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    await saveAll();
    setAnalysing(true);
    try {
      const res = await fetch(`/api/bioprocess/${id}/analyze`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json.result);
      setActiveTab('analysis');
      toast.success('Analysis complete');
    } catch (e) {
      toast.error('Analysis failed: ' + e.message);
    } finally {
      setAnalysing(false);
    }
  };

  // ── Render utilities ──────────────────────────────────────────────────────
  const pValue = (p) => {
    const cls = p < 0.001 ? 'text-red-600 font-bold' : p < 0.01 ? 'text-amber-600 font-semibold' : p < 0.05 ? 'text-amber-700 font-semibold' : 'text-slate-500';
    return <span className={cls}>{p < 0.0001 ? '< 0.0001' : p.toFixed(4)}</span>;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-navy animate-spin" /></div>
  );
  if (!experiment) return (
    <div className="text-center py-20 text-slate-500">Experiment not found</div>
  );

  const tm = TYPE_META[experiment.type];
  const completedRuns = localResponses.filter(r => r.response != null).length;
  const totalRuns = tm.runs || 0;
  const progress = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0;

  // ── Tab: Setup ────────────────────────────────────────────────────────────
  const SetupTab = () => (
    <div className="space-y-6">
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-800">
        <strong>{experiment.type === 'pbd' ? 'PBD:' : experiment.type === 'rsm' ? 'RSM:' : 'Kinetics:'}</strong>
        {experiment.type === 'pbd' && ' Define up to 11 factors with their high/low levels. The 12-run design matrix will be generated automatically.'}
        {experiment.type === 'rsm' && ' Define exactly 3 significant factors (from PBD) with their low, centre, and high actual values. A Box-Behnken 15-run matrix will be generated.'}
        {experiment.type === 'kinetics' && ' Select the kinetic model and configure parameters. Enter experimental data in the Data tab.'}
      </div>

      {/* Kinetics config */}
      {experiment.type === 'kinetics' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Kinetic Model</h3>
          <div className="space-y-2">
            {KINETICS_MODEL_OPTIONS.map(opt => (
              <label key={opt.value} className={`block cursor-pointer border-2 rounded-xl p-4 transition-all ${kineticConfig.kinetics_model === opt.value ? 'border-navy bg-navy/5' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="radio" name="kinetics_model" value={opt.value}
                  checked={kineticConfig.kinetics_model === opt.value}
                  onChange={() => setKineticConfig(c => ({ ...c, kinetics_model: opt.value }))}
                  className="sr-only" />
                <div className={`text-sm font-bold ${kineticConfig.kinetics_model === opt.value ? 'text-navy' : 'text-slate-700'}`}>{opt.label}</div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">{opt.desc}</div>
              </label>
            ))}
          </div>

          {/* Batch link — Unified Process Bus */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Link2 className="w-4 h-4 text-navy" /> Link to Batch (Unified Process Bus)
            </h3>
            <p className="text-xs text-slate-500">When linked, fermentation readings (OD, pH, Brix) sync automatically from the batch run — manual data entry is disabled.</p>
            <div className="flex items-center gap-3">
              <select
                defaultValue={experiment.batch_id || ''}
                onChange={e => handleLinkBatch(e.target.value || null)}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
              >
                <option value="">None -- manual data entry</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.batch_id}{b.formulations?.name ? ` -- ${b.formulations.name}` : ''}
                  </option>
                ))}
              </select>
              {experiment.batch_id && (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 shrink-0">
                  <CheckCircle className="w-3.5 h-3.5" /> Linked
                </span>
              )}
            </div>
          </div>

          {kineticConfig.kinetics_model === 'luedeking_piret' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
              <h4 className="text-sm font-bold text-amber-800 mb-4">Initial Conditions &amp; Simulation Parameters</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {[
                  { key: 'mu_max', label: 'μmax (h⁻¹)', def: '0.30' },
                  { key: 'Ks',     label: 'Ks (g/L)',    def: '2.0' },
                  { key: 'Yxs',   label: 'Yx/s',         def: '0.45' },
                  { key: 'alpha', label: 'α (growth-assoc.)', def: '0.15' },
                  { key: 'beta_lp', label: 'β (non-growth-assoc.)', def: '0.05' },
                  { key: 'X0',    label: 'X₀ (g/L)',      def: '0.05' },
                  { key: 'S0',    label: 'S₀ (g/L)',      def: '20' },
                  { key: 'P0',    label: 'P₀ (g/L)',      def: '0' },
                  { key: 'tend',  label: 'Duration (h)',   def: '30' },
                ].map(({ key, label, def }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-amber-800 mb-1">{label}</label>
                    <input type="number" step="any"
                      value={kineticConfig[key] !== undefined ? kineticConfig[key] : ''}
                      placeholder={def}
                      onChange={e => setKineticConfig(c => ({ ...c, [key]: e.target.value }))}
                      className="w-full border border-amber-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Factor table for PBD / RSM */}
      {experiment.type !== 'kinetics' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              Factor Definitions ({localFactors.length}/{experiment.type === 'rsm' ? 3 : 11})
            </h3>
            {(experiment.type === 'pbd' && localFactors.length < 11) || (experiment.type === 'rsm' && localFactors.length < 3) ? (
              <button onClick={addFactor} className="flex items-center gap-1 text-xs font-bold text-navy bg-navy/10 px-3 py-1.5 rounded-lg hover:bg-navy/20 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Factor
              </button>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 w-16">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600">Variable / Factor Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 w-20">Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 w-28">Low (−1)</th>
                  {experiment.type === 'rsm' && <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 w-28">Centre (0)</th>}
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 w-28">High (+1)</th>
                  <th className="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {localFactors.length === 0 && (
                  <tr><td colSpan={experiment.type === 'rsm' ? 7 : 6} className="px-4 py-8 text-center text-slate-400 text-xs">No factors defined — click Add Factor</td></tr>
                )}
                {localFactors.map((f, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <span className="font-mono font-bold text-navy text-xs px-2 py-0.5 bg-navy/10 rounded">{f.code}</span>
                    </td>
                    <td className="px-4 py-2">
                      <input value={f.variable} onChange={e => updateFactor(idx, 'variable', e.target.value)}
                        placeholder="e.g. Carbon source" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={f.unit || ''} onChange={e => updateFactor(idx, 'unit', e.target.value)}
                        placeholder="g/L" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" step="any" value={f.low_value} onChange={e => updateFactor(idx, 'low_value', e.target.value)}
                        placeholder="0" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </td>
                    {experiment.type === 'rsm' && (
                      <td className="px-4 py-2">
                        <input type="number" step="any" value={f.center_value || ''} onChange={e => updateFactor(idx, 'center_value', e.target.value)}
                          placeholder="midpoint" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20" />
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <input type="number" step="any" value={f.high_value} onChange={e => updateFactor(idx, 'high_value', e.target.value)}
                        placeholder="0" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => removeFactor(idx)} className="text-red-400 hover:text-red-600 p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {experiment.type === 'pbd' && localFactors.length > 0 && (
            <div className="mt-3 bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500">
                Default ranges from OBI-TRN-BPOE-001: Carbon 10–25 g/L · Yeast extract 3–10 g/L · Peptone 5–15 g/L · pH 4.5–6.5 · Temp 30–37°C
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => {
          const hasResponses = localResponses?.some(r => r.response !== '' && r.response !== null && r.response !== undefined);
          if (hasResponses) {
            const confirmed = window.confirm('Changing the setup will reset your response data. Continue?');
            if (!confirmed) return;
          }
          saveAll();
        }} disabled={saving} className="flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Setup
        </button>
      </div>
    </div>
  );

  // ── Tab: Data Entry ───────────────────────────────────────────────────────
  const DataTab = () => {
    if (experiment.type === 'kinetics') {
      const modelType = kineticConfig.kinetics_model || 'monod';
      const isTimeCourse = modelType === 'luedeking_piret';
      const isLinkedToBatch = !!experiment.batch_id;
      
      return (
        <div className="space-y-5">
          {sopBlock && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <strong>SOP completion required:</strong>
                <p>{sopBlock.error} <a href="/sops" className="underline font-semibold">Go sign it</a>.</p>
              </div>
            </div>
          )}
          {isLinkedToBatch ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 flex items-start gap-2">
              <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <strong>Unified Process Bus Active:</strong>
                <p>Fermentation data is synced dynamically from Batch Monitoring. Manual entry is disabled.</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
              {isTimeCourse
                ? 'Enter time-course batch fermentation data (t, Biomass, Substrate, Product) at regular intervals.'
                : modelType === 'monod'
                  ? 'Enter pairs of [S] (substrate concentration, g/L) and observed growth rate μ (h⁻¹) from batch fermentations at different initial substrate levels.'
                  : 'Enter pairs of [S] (substrate concentration, mM) and observed reaction rate v (mM/min) from enzyme assays.'}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {isTimeCourse ? (
                    <>
                      <th className="px-4 py-3 text-xs font-bold text-slate-600 text-left">Time (h)</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-600 text-left">Biomass X (g/L)</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-600 text-left">Substrate S (g/L)</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-600 text-left">Product P (g/L)</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-xs font-bold text-slate-600 text-left">[S] {modelType === 'monod' ? '(g/L)' : '(mM)'}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-600 text-left">{modelType === 'monod' ? 'μ (h⁻¹)' : 'v (mM/min)'}</th>
                    </>
                  )}
                  <th className="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {localKinetics.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">No data points — click Add Row</td></tr>
                )}
                {localKinetics.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {isTimeCourse ? (
                      <>
                        {['time_h','biomass','substrate','product'].map(field => (
                          <td key={field} className="px-4 py-2">
                            <input type="number" step="any" value={row[field] ?? ''} onChange={e => updateKineticRow(idx, field, e.target.value)}
                              disabled={isLinkedToBatch}
                              className={`w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20 ${isLinkedToBatch ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} />
                          </td>
                        ))}
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">
                          <input type="number" step="any" value={row.substrate ?? ''} onChange={e => updateKineticRow(idx, 'substrate', e.target.value)}
                            disabled={isLinkedToBatch}
                            className={`w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20 ${isLinkedToBatch ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="any" value={row.rate ?? ''} onChange={e => updateKineticRow(idx, 'rate', e.target.value)}
                            disabled={isLinkedToBatch}
                            className={`w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy/20 ${isLinkedToBatch ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} />
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2">
                      {!isLinkedToBatch && (
                        <button onClick={() => removeKineticRow(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            {!isLinkedToBatch && (
              <button onClick={addKineticRow} className="flex items-center gap-1.5 text-sm font-semibold text-navy bg-navy/10 px-4 py-2 rounded-xl hover:bg-navy/20 transition-colors">
                <Plus className="w-4 h-4" /> Add Row
              </button>
            )}
            <button onClick={saveAll} disabled={saving || isLinkedToBatch} className="flex items-center gap-2 bg-navy text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      );
    }

    // PBD / RSM design matrix
    const design = experiment.type === 'pbd' ? PBD_DESIGN : BBD_DESIGN;
    const nRuns = experiment.type === 'pbd' ? 12 : 15;
    const nFactors = localFactors.length;

    return (
      <div className="space-y-5">
        {sopBlock && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <strong>SOP completion required:</strong>
              <p>{sopBlock.error} <a href="/sops" className="underline font-semibold">Go sign it</a>.</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Responses entered: <span className={`font-bold ${completedRuns === nRuns ? 'text-emerald-600' : 'text-navy'}`}>{completedRuns}/{nRuns}</span>
            </p>
            <div className="mt-1 w-48 bg-slate-100 rounded-full h-2">
              <div className="bg-navy rounded-full h-2 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportDesignCSV} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-100 px-4 py-2 rounded-xl hover:bg-slate-200 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={saveAll} disabled={saving} className="flex items-center gap-2 bg-navy text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Responses
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left font-bold text-slate-600 w-14">Run</th>
                {localFactors.map(f => (
                  <th key={f.code} className="px-2 py-3 text-center font-bold text-slate-600 min-w-[56px]">
                    <div className="font-mono text-navy">{f.code}</div>
                    <div className="text-xs font-normal text-slate-400 mt-0.5 max-w-[64px] truncate">{f.variable}</div>
                  </th>
                ))}
                {nFactors === 0 && <th className="px-2 py-3 text-center text-slate-400">Define factors in Setup tab</th>}
                <th className="px-3 py-3 text-center font-bold text-emerald-700 min-w-[100px]">
                  Y ({experiment.response_variable})
                </th>
                <th className="px-3 py-3 text-left font-bold text-slate-500 min-w-[120px]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: nRuns }, (_, ri) => {
                const row = design[ri];
                const resp = localResponses.find(r => r.run_number === ri + 1);
                const isCenter = experiment.type === 'rsm' && ri >= 12;
                return (
                  <tr key={ri} className={`${isCenter ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2 font-bold text-slate-700">
                      {ri + 1} {isCenter && <span className="text-xs text-amber-600">CP</span>}
                    </td>
                    {localFactors.map((f, fi) => {
                      const level = row[fi];
                      const isHigh = level === 1;
                      const isLow = level === -1;
                      const actual = isCenter ? f.center_value :
                        isHigh ? f.high_value : f.low_value;
                      return (
                        <td key={f.code} className="px-2 py-2 text-center">
                          <div className={`text-xs font-black ${isHigh ? 'text-emerald-700' : isLow ? 'text-red-700' : 'text-slate-600'}`}>
                            {actual !== '' && actual !== undefined ? actual : (level === 1 ? '+1' : level === -1 ? '−1' : '0')}
                          </div>
                          <div className={`text-xs mt-0.5 font-semibold ${isHigh ? 'text-emerald-400' : isLow ? 'text-red-400' : 'text-slate-400'}`}>
                            {level === 1 ? '+1' : level === -1 ? '−1' : '0'}
                          </div>
                        </td>
                      );
                    })}
                    {nFactors === 0 && <td></td>}
                    <td className="px-3 py-2">
                      <input
                        type="number" step="any"
                        value={resp?.response ?? ''}
                        onChange={e => updateResponse(ri + 1, e.target.value)}
                        placeholder="—"
                        className={`w-24 border rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-300 ${resp?.response != null ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={resp?.notes ?? ''}
                        onChange={e => updateResponseNotes(ri + 1, e.target.value)}
                        placeholder="observations..."
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-navy/30 min-w-[110px]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          onClick={runAnalysis}
          disabled={analysing || completedRuns < nRuns}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {analysing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
          {completedRuns < nRuns ? `Enter all ${nRuns} responses to analyse` : 'Save & Run Analysis'}
        </button>
      </div>
    );
  };

  // ── Tab: Analysis ─────────────────────────────────────────────────────────
  const AnalysisTab = () => {
    if (!result) return (
      <div className="text-center py-20">
        <BarChart2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-semibold">No analysis results yet</p>
        <p className="text-sm text-slate-400 mt-1">Complete data entry and click &quot;Run Analysis&quot;</p>
        <button onClick={runAnalysis} disabled={analysing} className="mt-4 flex items-center gap-2 mx-auto bg-navy text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-60">
          {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run Analysis
        </button>
      </div>
    );

    // PBD Results
    if (result.type === 'pbd') {
      const chartData = result.results.map(r => ({
        name: r.code, variable: r.variable, effect: r.effect, significant: r.significant,
      }));
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-navy/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-navy">{result.results.length}</div>
              <div className="text-xs text-slate-500 mt-1">Factors tested</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-emerald-700">{result.significant.length}</div>
              <div className="text-xs text-slate-500 mt-1">Significant (p&lt;0.05)</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-amber-700">
                {result.results.reduce((m, r) => Math.abs(r.effect) > Math.abs(m) ? r.effect : m, 0).toFixed(3)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Max |effect|</div>
            </div>
          </div>

          {/* Pareto chart of standardized effects */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-1">Pareto Chart of Standardized Effects</h3>
            <p className="text-xs text-slate-400 mb-4">Absolute t-statistic per factor — bars crossing the red line are significant at p&lt;0.05</p>
            {(() => {
              const paretoData = [...result.results]
                .sort((a, b) => Math.abs(b.t) - Math.abs(a.t))
                .map(r => ({ name: r.code, variable: r.variable, absT: Math.abs(r.t), significant: r.significant }));
              return (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={paretoData} margin={{ left: 8, right: 40, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#1e3a8a' }} />
                    <YAxis label={{ value: '|t|', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6b7280' }} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={v => [v.toFixed(3), '|Standardized Effect|']} labelFormatter={l => paretoData.find(d => d.name === l)?.variable || l} />
                    <ReferenceLine y={2.0} stroke="#dc2626" strokeDasharray="5 3" label={{ value: 'p=0.05', position: 'right', fontSize: 10, fill: '#dc2626' }} />
                    <Bar dataKey="absT" radius={[4, 4, 0, 0]}
                      cell={paretoData.map((d, i) => ({ key: i, fill: d.significant ? '#1e3a8a' : '#cbd5e1' }))}
                    />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>

          {/* Effect direction chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Effect Directions</h3>
            {(() => {
              const chartData = [...result.results]
                .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
                .map(r => ({ name: r.code, variable: r.variable, effect: r.effect, significant: r.significant }));
              return (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={['auto','auto']} tickFormatter={v => v.toFixed(2)} />
                    <YAxis type="category" dataKey="name" width={32} tick={{ fontSize: 11, fontWeight: 700, fill: '#1e3a8a' }} />
                    <Tooltip formatter={(v, n, p) => [v.toFixed(4), 'Effect']} labelFormatter={l => chartData.find(d => d.name === l)?.variable || l} />
                    <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1.5} />
                    <Bar dataKey="effect" radius={[0, 4, 4, 0]}
                      cell={chartData.map((d, i) => ({ key: i, fill: d.significant ? (d.effect > 0 ? '#16a34a' : '#dc2626') : '#94a3b8' }))}
                    />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
            <p className="text-xs text-slate-400 text-center mt-2">Green = significant, high level benefits response · Red = significant, low level benefits response · Grey = not significant</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600">Factor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600">Variable</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">Effect</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">t-stat</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">p-value</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-600">Significant?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.results.map(r => (
                  <tr key={r.code} className={r.significant ? 'bg-emerald-50/40' : ''}>
                    <td className="px-4 py-2.5 font-mono font-bold text-navy text-xs">{r.code}</td>
                    <td className="px-4 py-2.5 text-slate-700">{r.variable}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.effect >= 0 ? '+' : ''}{r.effect.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{r.t.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right">{pValue(r.p)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.significant ? <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto" /> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.significant.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-emerald-800">Carry Forward to RSM</h4>
              <div className="flex flex-wrap gap-2">
                {result.significant.map(f => (
                  <span key={f.code} className="px-3 py-1 bg-emerald-100 border border-emerald-300 rounded-full text-xs font-bold text-emerald-800">
                    {f.code}: {f.variable} (effect {f.effect >= 0 ? '+' : ''}{f.effect.toFixed(3)})
                  </span>
                ))}
              </div>
              {result.significant.length > 3 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Only the top 3 factors will be used in the RSM (BBD limit). The rest are carried as fixed at their optimal levels.
                </p>
              )}
              <button
                onClick={() => handleCreateRSM(result.significant)}
                disabled={creatingRSM}
                className="flex items-center gap-2 bg-navy text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-60"
              >
                {creatingRSM ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create RSM Experiment from these factors
              </button>
            </div>
          )}
        </div>
      );
    }

    // RSM Results
    if (result.type === 'rsm') {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`rounded-xl p-4 text-center ${result.r2 >= 0.9 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className={`text-2xl font-black ${result.r2 >= 0.9 ? 'text-emerald-700' : 'text-red-600'}`}>{(result.r2 * 100).toFixed(1)}%</div>
              <div className="text-xs text-slate-500 mt-1">R² (model fit)</div>
            </div>
            <div className="bg-navy/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-navy">{(result.adjR2 * 100).toFixed(1)}%</div>
              <div className="text-xs text-slate-500 mt-1">Adj. R²</div>
            </div>
            <div className={`rounded-xl p-4 text-center ${result.lackOfFit.adequate ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <div className={`text-2xl font-black ${result.lackOfFit.adequate ? 'text-emerald-700' : 'text-amber-700'}`}>{result.lackOfFit.adequate ? 'OK' : 'Fail'}</div>
              <div className="text-xs text-slate-500 mt-1">Lack of Fit (p={result.lackOfFit.p})</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-black text-amber-700">{result.predictedResponse.toFixed(3)}</div>
              <div className="text-xs text-slate-500 mt-1">Predicted optimum</div>
            </div>
          </div>

          {/* Optimal conditions */}
          {localFactors.length >= 3 && (
            <div className="bg-navy/5 border border-navy/10 rounded-xl p-5">
              <h3 className="text-sm font-bold text-navy mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Optimal Conditions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {localFactors.slice(0, 3).map((f, i) => (
                  <div key={f.code} className="bg-white rounded-xl p-3 border border-navy/10">
                    <div className="text-xs font-bold text-slate-500 uppercase">{f.code} — {f.variable}</div>
                    <div className="text-xl font-black text-navy mt-1">
                      {result.actualOpt[i]} <span className="text-sm font-normal text-slate-500">{f.unit}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">coded: {result.stationary.clamped[i].toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Surface heatmap */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Response Surface (Factor A vs B, Factor C at centre)</h3>
            <RSMHeatmap heatmap={result.heatmap} factors={localFactors} />
          </div>

          {/* ANOVA Table */}
          {result.anova && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-700">ANOVA Table</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50/60">
                  <tr>
                    {['Source','SS','df','MS','F','p-value'].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-bold text-slate-600 ${h === 'Source' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-navy/5">
                    <td className="px-4 py-2.5 font-bold text-navy text-sm">Model</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm">{result.anova.model.SS}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm">{result.anova.model.df}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm">{result.anova.model.MS}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm">{result.anova.model.F}</td>
                    <td className="px-4 py-2.5 text-right">{pValue(result.anova.model.p)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-slate-600 pl-8 text-xs">Residual</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.residual.SS}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.residual.df}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.residual.MS}</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">--</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">--</td>
                  </tr>
                  <tr className="bg-amber-50/40">
                    <td className="px-4 py-2 text-slate-600 pl-12 text-xs">Lack of Fit</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.lof.SS}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.lof.df}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.lof.MS}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.lof.F}</td>
                    <td className="px-4 py-2 text-right text-xs">{pValue(result.anova.lof.p)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-slate-600 pl-12 text-xs">Pure Error</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.pureErr.SS}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.pureErr.df}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{result.anova.pureErr.MS}</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">--</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">--</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-4 py-2.5 text-slate-700">Total (Corrected)</td>
                    <td className="px-4 py-2.5 text-right font-mono">{result.anova.total.SS}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{result.anova.total.df}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">--</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">--</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">--</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Coefficient table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600">Term</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">Coefficient beta</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">Std. Error</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">t</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600">p-value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.coefs.map(c => (
                  <tr key={c.term} className={c.significant ? 'bg-emerald-50/40' : ''}>
                    <td className="px-4 py-2.5 font-mono font-bold text-navy text-xs">{c.term}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{TERM_LABELS[c.term] || c.term}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{c.beta >= 0 ? '+' : ''}{c.beta.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{c.se.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{c.t.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right">{pValue(c.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Predicted vs Actual diagnostic */}
          {result.diagnostics && (() => {
            const allVals = result.diagnostics.flatMap(d => [d.actual, d.fitted]);
            const mn = Math.min(...allVals), mx = Math.max(...allVals);
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-700 mb-1">Predicted vs Actual</h3>
                <p className="text-xs text-slate-400 mb-4">Points close to the diagonal indicate good model fit</p>
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ left: 10, right: 10, top: 4, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fitted" name="Predicted" type="number" domain={['auto','auto']} label={{ value: 'Predicted', position: 'insideBottom', offset: -8, fontSize: 11 }} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="actual" name="Actual" type="number" domain={['auto','auto']} label={{ value: 'Actual', angle: -90, position: 'insideLeft', fontSize: 11 }} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v, n) => [v.toFixed(4), n]} />
                    <ReferenceLine segment={[{ x: mn, y: mn }, { x: mx, y: mx }]} stroke="#94a3b8" strokeDasharray="5 3" />
                    <Scatter data={result.diagnostics} fill="#1e3a8a" />
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50">
                      {['Run','Actual','Predicted','Residual'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-bold text-slate-600">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.diagnostics.map(d => (
                        <tr key={d.run} className={Math.abs(d.residual) > 2 * Math.sqrt(result.MSE || 1) ? 'bg-red-50' : ''}>
                          <td className="px-3 py-1.5 font-bold text-slate-700">{d.run}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{d.actual}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-navy">{d.fitted}</td>
                          <td className={`px-3 py-1.5 text-right font-mono ${Math.abs(d.residual) > 2 * Math.sqrt(result.MSE || 1) ? 'text-red-600 font-bold' : 'text-slate-500'}`}>{d.residual >= 0 ? '+' : ''}{d.residual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      );
    }

    // Kinetics Results
    if (result.type === 'kinetics') {
      if (result.modelType === 'luedeking_piret') {
        const sim = result.simulation;
        const stride = Math.max(1, Math.floor(sim.times.length / 80));
        const simData = sim.times.filter((_, i) => i % stride === 0).map((t, i) => ({
          t, X: sim.X[i * stride], S: sim.S[i * stride], P: sim.P[i * stride],
        }));
        const hasExpData = result.expPts?.length > 0;
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`flex-1 rounded-xl p-4 border text-center ${result.dominant === 'growth-associated' ? 'bg-slate-50 border-slate-200' : result.dominant === 'non-growth-associated' ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="text-lg font-black capitalize">{result.dominant} product</div>
                <div className="text-xs text-slate-500 mt-1">Luedeking-Piret classification</div>
              </div>
              {result.fittedFromData ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Parameters fitted from experimental data
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs font-semibold text-amber-700">
                  Using manual parameters -- add time-course data to fit automatically
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-sm">
              {[['mumax', result.muMax + ' h-1'], ['Ks', result.Ks + ' g/L'], ['Yx/s', result.Yxs], ['alpha', result.alpha], ['beta', result.beta]].map(([l, v]) => (
                <div key={l} className="bg-slate-50 rounded-xl p-3">
                  <div className="font-mono text-xs text-slate-500">{l}</div>
                  <div className="font-black text-navy mt-1">{v}</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-1">Batch Simulation vs Experimental Data</h3>
              <p className="text-xs text-slate-400 mb-4">Lines = ODE simulation · Dots = measured data points</p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart margin={{ left: 4, right: 8, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" domain={['auto','auto']} label={{ value: 'Time (h)', position: 'insideBottom', offset: -10, fontSize: 11 }} allowDuplicatedCategory={false} />
                  <YAxis label={{ value: 'g/L', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <Tooltip formatter={v => typeof v === 'number' ? v.toFixed(3) : v} />
                  <Legend verticalAlign="top" />
                  <Line data={simData} type="monotone" dataKey="X" stroke="#1e3a8a" strokeWidth={2} dot={false} name="Biomass X (sim)" />
                  <Line data={simData} type="monotone" dataKey="S" stroke="#16a34a" strokeWidth={2} dot={false} name="Substrate S (sim)" strokeDasharray="5 5" />
                  <Line data={simData} type="monotone" dataKey="P" stroke="#dc2626" strokeWidth={2} dot={false} name="Product P (sim)" />
                  {hasExpData && (
                    <>
                      <Scatter data={result.expPts.filter(p => p.X != null).map(p => ({ t: p.t, X: p.X }))} dataKey="X" fill="#1e3a8a" name="Biomass X (exp)" />
                      <Scatter data={result.expPts.filter(p => p.S != null).map(p => ({ t: p.t, S: p.S }))} dataKey="S" fill="#16a34a" name="Substrate S (exp)" />
                      <Scatter data={result.expPts.filter(p => p.P != null).map(p => ({ t: p.t, P: p.P }))} dataKey="P" fill="#dc2626" name="Product P (exp)" />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      }

      // Monod / MM curve
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="bg-navy/5 rounded-xl p-4">
              <div className="text-2xl font-black text-navy">{result.muMax}</div>
              <div className="text-xs text-slate-500 mt-1">{result.modelType === 'monod' ? 'μmax (h⁻¹)' : 'Vmax'}</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4">
              <div className="text-2xl font-black text-emerald-700">{result.Ks}</div>
              <div className="text-xs text-slate-500 mt-1">{result.modelType === 'monod' ? 'Ks (g/L)' : 'Km (mM)'}</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <div className="text-2xl font-black text-amber-700">{(result.r2 * 100).toFixed(1)}%</div>
              <div className="text-xs text-slate-500 mt-1">R² fit</div>
            </div>
          </div>
          {result.doublingTime && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-800 text-center">
              Doubling time at non-limiting substrate: <span className="font-bold">{result.doublingTime} h</span>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">
              {result.modelType === 'monod' ? 'Monod Curve' : 'Michaelis-Menten Curve'}
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={result.curve}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="s" label={{ value: result.modelType === 'monod' ? '[S] g/L' : '[S] mM', position: 'insideBottom', offset: -4, fontSize: 11 }} />
                <YAxis label={{ value: result.modelType === 'monod' ? 'μ (h⁻¹)' : 'v', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip formatter={v => v.toFixed(4)} />
                <Line type="monotone" dataKey="fitted" stroke="#1e3a8a" strokeWidth={2.5} dot={false} name="Fitted curve" />
                {result.rawPts?.map((pt, i) => null)}
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3">
              <div className="flex flex-wrap gap-2 justify-center">
                {result.rawPts?.map((pt, i) => (
                  <span key={i} className="text-xs text-slate-500 bg-slate-100 rounded px-2 py-0.5">
                    [S]={pt.s} → {result.modelType === 'monod' ? 'μ' : 'v'}={pt.r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {result.lwb?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-4">Lineweaver-Burk Plot (1/v vs 1/[S])</h3>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="invS" name="1/[S]" label={{ value: '1/[S]', position: 'insideBottom', offset: -4, fontSize: 11 }} type="number" domain={['auto','auto']} />
                  <YAxis dataKey="invR" name="1/rate" label={{ value: '1/rate', angle: -90, position: 'insideLeft', fontSize: 11 }} type="number" domain={['auto','auto']} />
                  <Tooltip />
                  <Scatter data={result.lwb} fill="#dc2626" />
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-400 text-center mt-2">Slope = Km/Vmax · y-intercept = 1/Vmax · x-intercept = −1/Km</p>
            </div>
          )}
        </div>
      );
    }

    return <div className="text-slate-500 text-sm">Unknown result type</div>;
  };

  // ── Tab: Interpretation ───────────────────────────────────────────────────
  const InterpretationTab = () => {
    if (!result?.interpretation?.length) return (
      <div className="text-center py-20">
        <Info className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-semibold">Run the analysis first to see interpretation</p>
      </div>
    );
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
            <Info className="w-4 h-4 text-navy" /> Scientific Interpretation
          </h3>
          {result.interpretation.map((line, i) => (
            <p key={i} className="text-sm text-slate-700 leading-relaxed border-l-2 border-navy/20 pl-4">{line}</p>
          ))}
        </div>

        {result.type === 'pbd' && result.significant?.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <h4 className="text-sm font-bold text-emerald-800 mb-3">Next Step: RSM Optimisation</h4>
            <p className="text-sm text-emerald-700 mb-3">
              Create a new RSM experiment with these significant factors. Set their centre levels to the PBD midpoints and widen/narrow ranges as appropriate.
            </p>
            <div className="space-y-2">
              {result.significant.map((f, i) => (
                <div key={f.code} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-emerald-100">
                  <span className="font-mono font-bold text-navy text-xs w-6">{['A','B','C','D'][i]}</span>
                  <span className="text-sm text-slate-700">{f.variable}</span>
                  <span className="text-xs text-slate-400 ml-auto">effect = {f.effect >= 0 ? '+' : ''}{f.effect.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.type === 'rsm' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h4 className="text-sm font-bold text-amber-800 mb-2">Validation Required</h4>
            <p className="text-sm text-amber-700">Run 2–3 confirmation experiments at the predicted optimal conditions and compare the measured response against the predicted value of {result.predictedResponse} {experiment.response_unit}. A good model predicts within ±10% of the actual response.</p>
          </div>
        )}

        {experiment?.type === 'rsm' && (experiment?.status === 'complete' || experiment?.status === 'completed') && (
          <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-sm font-bold text-slate-800 mb-1">Ready for production?</p>
            <p className="text-xs text-slate-600 mb-3">Use the predicted optimal conditions to start a production batch. The &quot;Create Batch&quot; button in the top-right pre-fills the batch notes with optimal factor values.</p>
          </div>
        )}
      </div>
    );
  };

  const tabs = [
    { id: 'setup', label: 'Setup', Icon: Settings },
    { id: 'data', label: 'Data Entry', Icon: FlaskConical },
    { id: 'analysis', label: 'Analysis', Icon: BarChart2 },
    { id: 'interpretation', label: 'Interpretation', Icon: Info },
    { id: 'scaledown', label: 'Scale-Down', Icon: BarChart2 },
    { id: 'models', label: 'Predictive Models', Icon: BarChart2 },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back + header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <Link href="/bioprocess" className="mt-1 p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tm.color}`}>{tm.label}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${experiment.status === 'complete' ? 'bg-emerald-50 text-emerald-700' : experiment.status === 'collecting' ? 'bg-slate-50 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>
                {experiment.status}
              </span>
              {experiment.sop_id && (
                <a href="/sops" className="text-xs font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100">Requires SOP</a>
              )}
            </div>
            <h1 className="text-xl font-black text-slate-900">{experiment.title}</h1>
            {experiment.description && <p className="text-sm text-slate-500 mt-0.5">{experiment.description}</p>}
            <p className="text-xs text-slate-400 mt-1">Response: {experiment.response_variable} {experiment.response_unit && `(${experiment.response_unit})`}</p>
            {experiment.creator && (
              <div className="flex items-center gap-1.5 mt-1">
                <CreatorBadge initials={experiment.creator.initials} fullName={experiment.creator.full_name} />
                <span className="text-xs text-slate-400">{experiment.creator.full_name}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 2C: R&D → Batch handoff — only shown when RSM is complete and has optimal conditions */}
          {experiment.type === 'rsm' && experiment.status === 'complete' && result?.actualOpt && localFactors.length >= 3 && (() => {
            const optimalNotes = localFactors.slice(0, 3).map((f, i) =>
              `${f.variable}: ${result.actualOpt[i]}${f.unit ? ' ' + f.unit : ''}`
            ).join(' · ');
            const prefill = btoa(JSON.stringify({
              notes: `[AUTO] Optimal conditions from ${experiment.title}:\n${optimalNotes}\nPredicted ${experiment.response_variable}: ${result.predictedResponse} ${experiment.response_unit || ''}`,
              product_name: experiment.title,
            }));
            return (
              <Link
                href={`/batches?prefill=${prefill}`}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap"
              >
                <FlaskConical className="w-4 h-4" />
                Create Batch →
              </Link>
            );
          })()}
          <button onClick={runAnalysis} disabled={analysing} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60">
            {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {result ? 'Re-run' : 'Analyse'}
          </button>
          <button onClick={handleDelete} className="flex items-center gap-1.5 border border-red-200 text-red-500 px-3 py-2 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'setup' && <SetupTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'analysis' && <AnalysisTab />}
        {activeTab === 'interpretation' && <InterpretationTab />}
        {activeTab === 'models' && <PredictiveModelsTab supabase={supabase} toast={toast} />}
        {activeTab === 'scaledown' && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
              <h3 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-slate-600"/>A-65 Scale-Down Model
              </h3>
              <p className="text-xs text-slate-600 font-semibold mb-4">Link this bench-scale experiment to a production-scale batch to compute scaling factor and comparability score.</p>
              <ScaleDownForm experimentId={id} supabase={supabase} toast={toast} batches={batches}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
