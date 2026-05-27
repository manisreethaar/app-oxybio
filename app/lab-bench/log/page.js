'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  FlaskConical, Activity, ChevronDown, CheckCircle2,
  AlertCircle, Loader2, X, Thermometer, Waves,
  ArrowLeft, SkipForward, RotateCcw, ClipboardList
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';

// ── Constants ──────────────────────────────────────────────────────────────
const TURBIDITY_OPTIONS = ['clear', 'slightly_turbid', 'turbid', 'very_turbid'];
const PLATE_MEDIA_OPTIONS = ['MRS Agar', 'TSA', 'LB Agar', 'PDA', 'Nutrient Agar', 'R2A', 'Other'];
const DILUTION_OPTIONS = ['undiluted', '10⁻¹', '10⁻²', '10⁻³', '10⁻⁴', '10⁻⁵', '10⁻⁶'];
const SKIP_REASONS = [
  'Not required at this timepoint',
  'Instrument unavailable',
  'Sample unavailable',
  'Reagent unavailable',
  'Not performed — time constraint',
  'Other',
];

// ── Default test state ─────────────────────────────────────────────────────
function defaultTests() {
  return {
    ph: {
      active: true, skipped: false, skip_reason: '',
      numeric_value: '',
      detail: { incubator_temp_c: '' },
    },
    od: {
      active: true, skipped: false, skip_reason: '',
      numeric_value: '',
      detail: { wavelength: 600, culture_turbidity: '', culture_color: '' },
    },
    sterility: {
      active: true, skipped: false, skip_reason: '',
      text_value: '',   // 'Pass' | 'Fail' | 'Pending'
      detail: {},
    },
    plate_analysis: {
      active: false, skipped: false, skip_reason: '',
      detail: { media_type: '', dilution: '', plate_count: '', incubation_temp_c: 37, expected_hours: 48 },
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function elapsedHours(inocTime) {
  if (!inocTime) return null;
  return (Date.now() - new Date(inocTime).getTime()) / 3600000;
}

function buildSourceLabel(sourceType, batch, study) {
  if (sourceType === 'batch' && batch)  return `Batch ${batch.batch_id}`;
  if (sourceType === 'growth_study' && study) {
    return study.study_code
      ? `Growth Study ${study.study_code}`
      : `Growth Study ${study.name}`;
  }
  return null;
}

function buildTimepointLabel(logHour) {
  if (logHour === '' || logHour == null) return null;
  const h = Number(logHour);
  if (Number.isNaN(h)) return null;
  // Use fractional hours as-is; whole hours show clean "T+24h"
  return h % 1 === 0 ? `T+${h}h` : `T+${h.toFixed(1)}h`;
}

function autoSampleLabel(sourceType, batch, study, flaskLabel, logHour) {
  const src  = buildSourceLabel(sourceType, batch, study) || (sourceType === 'batch' ? 'Batch' : 'Study');
  const flask = flaskLabel ? ` · ${flaskLabel}` : '';
  const tp   = buildTimepointLabel(logHour);
  return `${src}${flask}${tp ? ` ${tp}` : ''}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────
const InputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const LabelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5';

function SkipPanel({ reason, onChange }) {
  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
      <label className={LabelCls + ' text-amber-700'}>Reason (GMP record)</label>
      <select
        className="w-full px-3 py-2 rounded-lg border border-amber-200 text-sm font-medium text-amber-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        value={reason}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Select reason…</option>
        {SKIP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  );
}

function TestCard({ title, icon: Icon, color, skipped, onSkipToggle, children, skip_reason, onSkipReasonChange }) {
  return (
    <div className={clsx(
      'rounded-2xl border p-4 transition-all',
      skipped
        ? 'bg-slate-50 border-slate-200 opacity-70'
        : `bg-white border-slate-200 shadow-sm`
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-slate-700 text-sm">{title}</span>
          {skipped && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full border border-amber-200 uppercase tracking-wide">
              Skipped
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSkipToggle}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all',
            skipped
              ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
          )}
        >
          {skipped ? (
            <><RotateCcw className="w-3 h-3" /> Undo</>
          ) : (
            <><SkipForward className="w-3 h-3" /> Skip</>
          )}
        </button>
      </div>

      {skipped ? (
        <SkipPanel reason={skip_reason} onChange={onSkipReasonChange} />
      ) : (
        children
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function QuickLogPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { employeeProfile } = useAuth();

  const [sources, setSources]       = useState({ batches: [], growth_studies: [] });
  const [sourcesLoading, setSourcesLoading] = useState(true);

  const [sourceType, setSourceType] = useState('batch');
  const [sourceId, setSourceId]     = useState('');
  const [flaskId, setFlaskId]       = useState('');
  const [flaskLabel, setFlaskLabel] = useState('');
  const [timePointId, setTimePointId] = useState('');
  const [logHour, setLogHour]       = useState('');
  const [collectedAt, setCollectedAt] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [notes, setNotes]           = useState('');
  const [tests, setTests]           = useState(defaultTests);

  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState(null);

  // ── Load active sources, then apply URL pre-fill ─────────────
  // Deep-link format (from Active Queue "Log Now"):
  //   ?source_type=batch&source_id=OXY-B-26-001&flask_id=uuid
  //   ?source_type=growth_study&source_id=uuid&tp_id=uuid
  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const res  = await fetch('/api/lab-bench/sources');
      const json = await res.json();
      if (json.success) {
        setSources(json);

        // Apply URL params after sources are available
        const paramType  = searchParams.get('source_type');
        const paramSrc   = searchParams.get('source_id');
        const paramFlask = searchParams.get('flask_id');
        const paramTp    = searchParams.get('tp_id');

        if (paramType && paramSrc) {
          setSourceType(paramType);
          setSourceId(paramSrc);

          if (paramType === 'batch' && paramFlask) {
            const batch = json.batches?.find(b => b.batch_id === paramSrc || b.id === paramSrc);
            const flask = batch?.batch_flasks?.find(f => f.id === paramFlask);
            if (flask) {
              setFlaskId(flask.id);
              setFlaskLabel(flask.flask_label || '');
            }
          }

          if (paramType === 'growth_study' && paramTp) {
            setTimePointId(paramTp);
            const study = json.growth_studies?.find(s => s.id === paramSrc);
            const tp    = study?.growth_study_time_points?.find(t => t.id === paramTp);
            if (tp) setLogHour(String(tp.planned_hour));
          }
        }
      }
    } catch (_) {}
    setSourcesLoading(false);
  }, [searchParams]);

  useEffect(() => { loadSources(); }, [loadSources]);

  // ── Derived data ─────────────────────────────────────────────
  const selectedBatch = sources.batches.find(b =>
    b.batch_id === sourceId || b.id === sourceId
  );
  const selectedStudy = sources.growth_studies.find(s => s.id === sourceId);

  // Auto-suggest hour when selecting a growth study time point
  useEffect(() => {
    if (!timePointId || !selectedStudy) return;
    const tp = (selectedStudy.growth_study_time_points || []).find(t => t.id === timePointId);
    if (tp) setLogHour(String(tp.planned_hour));
  }, [timePointId, selectedStudy]);

  // Auto-suggest elapsed hour for batch (from current time)
  useEffect(() => {
    if (sourceType !== 'batch' || !selectedBatch) return;
    // We don't have inoculation time in sources, so leave hour for user to enter
    // (could be enhanced later)
  }, [sourceType, selectedBatch]);

  // ── Helpers ──────────────────────────────────────────────────
  const updateTest = (type, patch) =>
    setTests(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const updateTestDetail = (type, patch) =>
    setTests(prev => ({
      ...prev,
      [type]: { ...prev[type], detail: { ...prev[type].detail, ...patch } },
    }));

  const resetForm = () => {
    setSourceId(''); setFlaskId(''); setFlaskLabel('');
    setTimePointId(''); setLogHour(''); setNotes('');
    setTests(defaultTests());
    setCollectedAt(new Date().toISOString().slice(0, 16));
    setError('');
  };

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!sourceId) { setError('Select a batch or growth study first.'); return; }
    if (logHour === '' || isNaN(Number(logHour))) { setError('Enter the log hour.'); return; }
    if (sourceType === 'batch' && !flaskId) { setError('Select a flask.'); return; }

    // At least one test must be active (not skipped) or provide a skip reason
    const hasActive = Object.values(tests).some(t =>
      (t.active || t.test_type === 'plate_analysis') && !t.skipped
    );
    // Build test array — only include tests the user interacted with
    const testPayload = [];

    if (!tests.ph.skipped || tests.ph.active) {
      testPayload.push({
        test_type: 'ph',
        numeric_value: tests.ph.skipped ? null : (tests.ph.numeric_value !== '' ? Number(tests.ph.numeric_value) : null),
        skipped: tests.ph.skipped,
        skip_reason: tests.ph.skip_reason || null,
        detail: tests.ph.detail,
      });
    }
    if (!tests.od.skipped || tests.od.active) {
      testPayload.push({
        test_type: 'od',
        numeric_value: tests.od.skipped ? null : (tests.od.numeric_value !== '' ? Number(tests.od.numeric_value) : null),
        unit: `OD${tests.od.detail.wavelength || 600}`,
        skipped: tests.od.skipped,
        skip_reason: tests.od.skip_reason || null,
        detail: tests.od.detail,
      });
    }
    if (!tests.sterility.skipped || tests.sterility.active) {
      testPayload.push({
        test_type: 'sterility',
        text_value: tests.sterility.skipped ? null : (tests.sterility.text_value || null),
        skipped: tests.sterility.skipped,
        skip_reason: tests.sterility.skip_reason || null,
        detail: tests.sterility.detail,
      });
    }
    // Plate analysis: only include if toggled active or explicitly skipped
    if (tests.plate_analysis.active || tests.plate_analysis.skipped) {
      testPayload.push({
        test_type: 'plate_analysis',
        skipped: tests.plate_analysis.skipped,
        skip_reason: tests.plate_analysis.skip_reason || null,
        detail: tests.plate_analysis.detail,
      });
    }

    const actualSourceId = sourceType === 'batch'
      ? (selectedBatch?.id || sourceId)   // use UUID for FK purposes
      : sourceId;

    // For batch fermentation, source_id in the readings is the text batch_id
    const batchTextId = selectedBatch?.batch_id || sourceId;

    const payload = {
      source_type:      sourceType,
      source_id:        sourceType === 'batch' ? batchTextId : actualSourceId,
      flask_id:         sourceType === 'batch' ? flaskId : null,
      flask_label:      sourceType === 'batch' ? flaskLabel : null,
      log_hour:         Number(logHour),
      source_label:     buildSourceLabel(sourceType, selectedBatch, selectedStudy),
      timepoint_label:  buildTimepointLabel(logHour),
      sample_label:     autoSampleLabel(sourceType, selectedBatch, selectedStudy, flaskLabel, logHour),
      collected_at:     new Date(collectedAt).toISOString(),
      notes:            notes || null,
      tests:            testPayload,
      time_point_id:    sourceType === 'growth_study' ? (timePointId || null) : null,
    };

    setSaving(true);
    try {
      const res = await fetch('/api/lab-bench/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to save.'); setSaving(false); return; }

      setSuccess({
        sample_label: json.sample?.sample_label || 'Sample logged',
        alarms: json.bridge?.alarms || null,
      });
      resetForm();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  // ── Render ────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-teal-600" />
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-1">Sample Logged</h2>
        <p className="text-slate-500 text-sm font-medium mb-2">{success.sample_label}</p>

        {success.alarms?.ph && (
          <div className="mx-auto max-w-xs mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            pH alarm triggered — admin notified
          </div>
        )}
        {success.alarms?.temp && (
          <div className="mx-auto max-w-xs mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-orange-700 text-sm font-bold">
            <Thermometer className="w-4 h-4 shrink-0" />
            Temperature alarm triggered — admin notified
          </div>
        )}

        <p className="text-slate-400 text-xs mb-8">Data saved to module records and unified log.</p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setSuccess(null)}
            className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-xl text-sm"
          >
            Log Another Sample
          </button>
          <Link href="/lab-bench"
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-sm"
          >
            Lab Bench
          </Link>
        </div>
      </div>
    );
  }

  const flasksForBatch = selectedBatch?.batch_flasks || [];
  const studyTimePoints = selectedStudy?.pending_time_points || [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/lab-bench" className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Lab Bench</p>
          <h1 className="text-xl font-black text-slate-800">Quick Log</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Source Type Selector ── */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'batch',       label: 'Batch Production', icon: FlaskConical },
            { value: 'growth_study', label: 'Growth Study',    icon: Activity },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value} type="button"
              onClick={() => { setSourceType(value); setSourceId(''); setFlaskId(''); setFlaskLabel(''); setTimePointId(''); setLogHour(''); }}
              className={clsx(
                'flex flex-col items-center justify-center py-4 rounded-2xl border-2 font-black text-sm transition-all',
                sourceType === value
                  ? 'border-teal-600 bg-teal-50 text-teal-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <Icon className={clsx('w-6 h-6 mb-1.5', sourceType === value ? 'text-teal-600' : 'text-slate-400')} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Source Selection ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
            {sourceType === 'batch' ? 'Select Batch & Flask' : 'Select Study & Timepoint'}
          </h3>

          {sourcesLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading active {sourceType === 'batch' ? 'batches' : 'studies'}…
            </div>
          ) : sourceType === 'batch' ? (
            <>
              {sources.batches.length === 0 ? (
                <p className="text-slate-400 text-sm font-medium py-2">
                  No batches in fermentation stage.{' '}
                  <Link href="/batches" className="text-teal-600 font-bold hover:underline">Go to Batches →</Link>
                </p>
              ) : (
                <div>
                  <label className={LabelCls}>Batch</label>
                  <select
                    className={InputCls}
                    value={sourceId}
                    onChange={e => {
                      setSourceId(e.target.value);
                      setFlaskId(''); setFlaskLabel('');
                    }}
                  >
                    <option value="">Select batch…</option>
                    {sources.batches.map(b => (
                      <option key={b.id} value={b.batch_id}>{b.batch_id}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedBatch && flasksForBatch.length > 0 && (
                <div>
                  <label className={LabelCls}>Flask</label>
                  <select
                    className={InputCls}
                    value={flaskId}
                    onChange={e => {
                      const flask = flasksForBatch.find(f => f.id === e.target.value);
                      setFlaskId(e.target.value);
                      setFlaskLabel(flask?.flask_label || '');
                    }}
                  >
                    <option value="">Select flask…</option>
                    {flasksForBatch.map(f => (
                      <option key={f.id} value={f.id}>{f.flask_label}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedBatch && flasksForBatch.length === 0 && (
                <p className="text-amber-600 text-xs font-bold">No flasks found for this batch.</p>
              )}
            </>
          ) : (
            <>
              {sources.growth_studies.length === 0 ? (
                <p className="text-slate-400 text-sm font-medium py-2">
                  No active growth studies.{' '}
                  <Link href="/growth-studies" className="text-teal-600 font-bold hover:underline">Go to Growth Studies →</Link>
                </p>
              ) : (
                <div>
                  <label className={LabelCls}>Study</label>
                  <select
                    className={InputCls}
                    value={sourceId}
                    onChange={e => { setSourceId(e.target.value); setTimePointId(''); setLogHour(''); }}
                  >
                    <option value="">Select study…</option>
                    {sources.growth_studies.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.study_code ? `${s.study_code} — ` : ''}{s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedStudy && (
                <div>
                  <label className={LabelCls}>Scheduled Timepoint (optional)</label>
                  {studyTimePoints.length === 0 ? (
                    <p className="text-slate-400 text-xs font-medium">No pending timepoints — enter hour manually below.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {studyTimePoints.map(tp => (
                        <button
                          key={tp.id} type="button"
                          onClick={() => setTimePointId(prev => prev === tp.id ? '' : tp.id)}
                          className={clsx(
                            'flex flex-col items-center py-2 px-1 rounded-xl border text-xs font-black transition-all',
                            timePointId === tp.id
                              ? 'border-teal-600 bg-teal-50 text-teal-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          )}
                        >
                          <span>T+{tp.planned_hour}h</span>
                          {tp.sample_types?.length > 0 && (
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5 truncate max-w-full px-1">
                              {tp.sample_types.slice(0, 2).join(', ')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Hour & Time ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-4">Sample Timepoint</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LabelCls}>Log Hour (T+)</label>
              <div className="relative">
                <input
                  className={InputCls + ' pr-8'}
                  type="number" step="0.1" min="0"
                  placeholder="e.g. 24"
                  value={logHour}
                  onChange={e => setLogHour(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">h</span>
              </div>
            </div>
            <div>
              <label className={LabelCls}>Logged At</label>
              <input
                className={InputCls}
                type="datetime-local"
                value={collectedAt}
                onChange={e => setCollectedAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Tests ── */}
        <div className="space-y-3">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">Common Tests</h3>

          {/* pH */}
          <TestCard
            title="pH"
            icon={Waves}
            color="bg-blue-500"
            skipped={tests.ph.skipped}
            skip_reason={tests.ph.skip_reason}
            onSkipToggle={() => updateTest('ph', { skipped: !tests.ph.skipped, skip_reason: '' })}
            onSkipReasonChange={v => updateTest('ph', { skip_reason: v })}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LabelCls}>pH Value</label>
                <input
                  className={InputCls}
                  type="number" step="0.01" min="0" max="14"
                  placeholder="e.g. 6.8"
                  value={tests.ph.numeric_value}
                  onChange={e => updateTest('ph', { numeric_value: e.target.value })}
                />
              </div>
              <div>
                <label className={LabelCls}>Incubator Temp (°C)</label>
                <input
                  className={InputCls}
                  type="number" step="0.1"
                  placeholder="e.g. 37"
                  value={tests.ph.detail.incubator_temp_c}
                  onChange={e => updateTestDetail('ph', { incubator_temp_c: e.target.value })}
                />
              </div>
            </div>
          </TestCard>

          {/* OD */}
          <TestCard
            title={`OD (Optical Density${selectedStudy?.od_wavelength ? ` @${selectedStudy.od_wavelength}nm` : ''})`}
            icon={Activity}
            color="bg-teal-500"
            skipped={tests.od.skipped}
            skip_reason={tests.od.skip_reason}
            onSkipToggle={() => updateTest('od', { skipped: !tests.od.skipped, skip_reason: '' })}
            onSkipReasonChange={v => updateTest('od', { skip_reason: v })}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LabelCls}>OD Value</label>
                <input
                  className={InputCls}
                  type="number" step="0.001" min="0"
                  placeholder="e.g. 0.420"
                  value={tests.od.numeric_value}
                  onChange={e => updateTest('od', { numeric_value: e.target.value })}
                />
              </div>
              <div>
                <label className={LabelCls}>Wavelength (nm)</label>
                <input
                  className={InputCls}
                  type="number" step="1"
                  value={tests.od.detail.wavelength}
                  onChange={e => updateTestDetail('od', { wavelength: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={LabelCls}>Turbidity</label>
                <select
                  className={InputCls}
                  value={tests.od.detail.culture_turbidity}
                  onChange={e => updateTestDetail('od', { culture_turbidity: e.target.value })}
                >
                  <option value="">— optional —</option>
                  {TURBIDITY_OPTIONS.map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LabelCls}>Culture Colour</label>
                <input
                  className={InputCls}
                  type="text" placeholder="e.g. pale yellow"
                  value={tests.od.detail.culture_color}
                  onChange={e => updateTestDetail('od', { culture_color: e.target.value })}
                />
              </div>
            </div>
          </TestCard>

          {/* Sterility */}
          <TestCard
            title="Sterility Check"
            icon={ClipboardList}
            color="bg-violet-500"
            skipped={tests.sterility.skipped}
            skip_reason={tests.sterility.skip_reason}
            onSkipToggle={() => updateTest('sterility', { skipped: !tests.sterility.skipped, skip_reason: '' })}
            onSkipReasonChange={v => updateTest('sterility', { skip_reason: v })}
          >
            <div>
              <label className={LabelCls}>Result</label>
              <div className="grid grid-cols-3 gap-2">
                {['Pass', 'Fail', 'Pending'].map(opt => (
                  <button
                    key={opt} type="button"
                    onClick={() => updateTest('sterility', { text_value: opt })}
                    className={clsx(
                      'py-2 rounded-xl border text-sm font-black transition-all',
                      tests.sterility.text_value === opt
                        ? opt === 'Fail'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : opt === 'Pass'
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </TestCard>

          {/* Plate Analysis */}
          <div className={clsx(
            'rounded-2xl border p-4 transition-all',
            tests.plate_analysis.skipped
              ? 'bg-slate-50 border-slate-200 opacity-70'
              : 'bg-white border-slate-200 shadow-sm'
          )}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-500">
                  <FlaskConical className="w-4 h-4 text-white" />
                </div>
                <span className="font-black text-slate-700 text-sm">Plate Analysis</span>
                {tests.plate_analysis.skipped && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full border border-amber-200 uppercase tracking-wide">
                    Skipped
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!tests.plate_analysis.skipped && (
                  <button
                    type="button"
                    onClick={() => updateTest('plate_analysis', { active: !tests.plate_analysis.active })}
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all',
                      tests.plate_analysis.active
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600'
                    )}
                  >
                    {tests.plate_analysis.active ? (
                      <><CheckCircle2 className="w-3 h-3" /> Done</>
                    ) : (
                      '+ Mark Done'
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => updateTest('plate_analysis', {
                    skipped: !tests.plate_analysis.skipped,
                    active: false,
                    skip_reason: '',
                  })}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all',
                    tests.plate_analysis.skipped
                      ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
                  )}
                >
                  {tests.plate_analysis.skipped ? (
                    <><RotateCcw className="w-3 h-3" /> Undo</>
                  ) : (
                    <><SkipForward className="w-3 h-3" /> Skip</>
                  )}
                </button>
              </div>
            </div>

            {tests.plate_analysis.skipped ? (
              <SkipPanel
                reason={tests.plate_analysis.skip_reason}
                onChange={v => updateTest('plate_analysis', { skip_reason: v })}
              />
            ) : tests.plate_analysis.active ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LabelCls}>Media Type</label>
                  <select
                    className={InputCls}
                    value={tests.plate_analysis.detail.media_type}
                    onChange={e => updateTestDetail('plate_analysis', { media_type: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {PLATE_MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Dilution</label>
                  <select
                    className={InputCls}
                    value={tests.plate_analysis.detail.dilution}
                    onChange={e => updateTestDetail('plate_analysis', { dilution: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {DILUTION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Colony Count</label>
                  <input
                    className={InputCls}
                    type="number" min="0"
                    placeholder="colonies"
                    value={tests.plate_analysis.detail.plate_count}
                    onChange={e => updateTestDetail('plate_analysis', { plate_count: e.target.value })}
                  />
                </div>
                <div>
                  <label className={LabelCls}>Incubation Temp (°C)</label>
                  <input
                    className={InputCls}
                    type="number" step="0.5"
                    value={tests.plate_analysis.detail.incubation_temp_c}
                    onChange={e => updateTestDetail('plate_analysis', { incubation_temp_c: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className={LabelCls}>Expected Incubation (hours)</label>
                  <input
                    className={InputCls}
                    type="number"
                    value={tests.plate_analysis.detail.expected_hours}
                    onChange={e => updateTestDetail('plate_analysis', { expected_hours: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-xs font-medium py-1">
                Not performed at this timepoint - toggle &quot;Mark Done&quot; if a plate was taken, or &quot;Skip&quot; to record it was not done with a reason.
              </p>
            )}
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <label className={LabelCls}>Notes (optional)</label>
          <textarea
            className={InputCls + ' min-h-[72px] resize-none'}
            placeholder="Visual observations, deviations, anything unusual…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white font-black rounded-2xl text-base transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
          ) : (
            'Save Sample Log'
          )}
        </button>

      </form>
    </div>
  );
}
