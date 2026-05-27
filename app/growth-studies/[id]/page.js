'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Clock, CheckCircle2, AlertCircle, Play, Square, BarChart2,
  FlaskConical, Microscope, X, Upload, ChevronRight, FileText, Loader2
} from 'lucide-react';

const GrowthCurveChart = dynamic(() => import('@/components/charts/GrowthCurveChart'), { ssr: false });

const TURBIDITY_OPTIONS = ['clear', 'slightly_turbid', 'turbid', 'very_turbid'];
const PLATE_MEDIA_OPTIONS = ['TSA', 'LB Agar', 'MRS Agar', 'PDA', 'Nutrient Agar', 'R2A', 'Other'];
const DILUTION_OPTIONS = ['undiluted', '10⁻¹', '10⁻²', '10⁻³', '10⁻⁴', '10⁻⁵', '10⁻⁶'];

function elapsedHours(inocTime) {
  if (!inocTime) return 0;
  return (Date.now() - new Date(inocTime).getTime()) / 3600000;
}

function StatusBadge({ status }) {
  const map = {
    setup: 'bg-slate-100 text-slate-600 border-slate-200',
    active: 'bg-teal-50 text-teal-700 border-teal-200',
    completed: 'bg-blue-50 text-blue-700 border-blue-200',
    analysed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${map[status] || map.setup}`}>{status}</span>;
}

export default function GrowthStudyDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Modal state
  const [modal, setModal] = useState(null); // null | { type: 'measurement' | 'plate', tp }
  const [mForm, setMForm] = useState({});
  const [pForm, setPForm] = useState({});
  const [modalErr, setModalErr] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Chart config
  const [showLines, setShowLines] = useState(['od', 'ph']);
  const [logScale, setLogScale] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/growth-studies/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data?.study?.inoculation_time) return;
    const itv = setInterval(() => setElapsed(elapsedHours(data.study.inoculation_time)), 60000);
    setElapsed(elapsedHours(data.study.inoculation_time));
    return () => clearInterval(itv);
  }, [data?.study?.inoculation_time]);

  const handleStatusChange = async (newStatus) => {
    setActionLoading(true);
    await fetch(`/api/growth-studies/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setActionLoading(false);
    load();
  };

  const openMeasurementModal = (tp) => {
    setMForm({ actual_hour: tp ? tp.planned_hour : parseFloat(elapsed.toFixed(2)), time_point_id: tp?.id || '' });
    setModal({ type: 'measurement', tp });
    setModalErr('');
  };

  const openPlateModal = (tp) => {
    setPForm({ time_point_hours: tp ? tp.planned_hour : parseFloat(elapsed.toFixed(2)), time_point_id: tp?.id || '', observation_type: 'colony_count', result: 'pending', incubation_temp_c: data?.study?.temperature_c || '' });
    setModal({ type: 'plate', tp });
    setModalErr('');
  };

  const saveMeasurement = async () => {
    setModalSaving(true);
    setModalErr('');
    const payload = { ...mForm };
    Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);
    const res = await fetch(`/api/growth-studies/${id}/measurements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setModalSaving(false);
    if (!res.ok) { setModalErr(json.error); return; }
    setModal(null);
    load();
  };

  const savePlate = async () => {
    setModalSaving(true);
    setModalErr('');
    const payload = { ...pForm };
    Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);
    const res = await fetch(`/api/growth-studies/${id}/plate-obs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setModalSaving(false);
    if (!res.ok) { setModalErr(json.error); return; }
    setModal(null);
    load();
  };

  const InputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';
  const LabelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1';

  if (loading) return <div className="p-8 text-center text-slate-500">Loading study…</div>;
  if (!data?.study) return <div className="p-8 text-center text-red-500">Study not found.</div>;

  const { study, time_points, measurements, plate_observations } = data;
  const isFermentation = study.study_type === 'fermentation';
  const isActive = study.status === 'active';

  const isolateName = study.cell_bank_strains?.name || study.cell_bank_preparations?.prep_code || '—';
  const mediaName = study.formulations?.name || study.media_name || '—';

  const tpDone = time_points.filter(t => t.status === 'completed').length;
  const tpPending = time_points.filter(t => t.status === 'pending').sort((a, b) => a.planned_hour - b.planned_hour);
  const nextTp = tpPending.find(tp => tp.planned_hour >= elapsed) || tpPending[0];
  const overdueTps = isActive ? tpPending.filter(tp => tp.planned_hour < elapsed - 0.25) : [];

  const availableLines = [
    { key: 'od', label: `OD${study.od_wavelength || 600}` },
    { key: 'ph', label: 'pH' },
    { key: 'glucose', label: 'Glucose' },
    { key: 'protein', label: 'Protein' },
    ...(isFermentation ? [{ key: 'do2', label: 'DO%' }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge status={study.status} />
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${isFermentation ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
              {isFermentation ? 'Fermentation' : 'Growth Curve'}
            </span>
            {isActive && (
              <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-full border border-teal-100">
                T + {elapsed.toFixed(1)}h elapsed
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black text-slate-800">{study.name}</h1>
          <p className="text-slate-500 mt-1 font-medium">{isolateName} · {mediaName}</p>
          {study.objective && <p className="text-sm text-slate-500 mt-1 italic max-w-xl">{study.objective}</p>}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {study.status === 'setup' && (
            <button onClick={() => handleStatusChange('active')} disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-xl text-sm disabled:opacity-50"
            >
              <Play className="w-4 h-4" /> Start Study
            </button>
          )}
          {study.status === 'active' && (
            <button onClick={() => handleStatusChange('completed')} disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-black rounded-xl text-sm disabled:opacity-50"
            >
              <Square className="w-4 h-4" /> Mark Complete
            </button>
          )}
          {['completed', 'analysed'].includes(study.status) && (
            <Link href={`/growth-studies/${id}/report`}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-700 hover:bg-violet-800 text-white font-black rounded-xl text-sm"
            >
              <FileText className="w-4 h-4" /> View Report
            </Link>
          )}
          {isActive && (
            <>
              <button onClick={() => openMeasurementModal(nextTp)}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl text-sm"
              >
                <FlaskConical className="w-4 h-4" /> Record Sample
              </button>
            </>
          )}
        </div>
      </div>

      {/* Conditions strip */}
      <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-500 bg-slate-50 rounded-2xl px-5 py-3">
        {study.temperature_c && <span>🌡 {study.temperature_c}°C</span>}
        {study.agitation_rpm && <span>🔄 {study.agitation_rpm} rpm</span>}
        {study.vessel_type && <span>🧪 {study.vessel_type.replace(/_/g, ' ')}</span>}
        {study.volume_ml && <span>💧 {study.volume_ml} mL</span>}
        {study.inoculum_percentage && <span>💉 {study.inoculum_percentage}% inoculum</span>}
        {study.od_wavelength && <span>📊 OD@{study.od_wavelength}nm</span>}
        {study.expected_duration_hours && <span>⏱ {study.expected_duration_hours}h planned</span>}
      </div>

      {/* Overdue alerts */}
      {overdueTps.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-red-700 text-sm">Overdue Samples</p>
            <p className="text-xs text-red-600 mt-0.5">
              {overdueTps.map(t => `T+${t.planned_hour}h`).join(', ')} — please record now.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Timeline */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" /> Sampling Timeline
              <span className="ml-auto text-slate-400 font-bold text-xs">{tpDone}/{time_points.length}</span>
            </h3>
            <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full" style={{ width: `${time_points.length ? (tpDone / time_points.length) * 100 : 0}%` }} />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {time_points.map(tp => {
                const isDone = tp.status === 'completed';
                const isMissed = tp.status === 'missed';
                const isNext = nextTp?.id === tp.id;
                const isOverdue = isActive && tp.status === 'pending' && tp.planned_hour < elapsed - 0.25;

                return (
                  <div key={tp.id} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${isNext ? 'bg-teal-50 border border-teal-200' : isOverdue ? 'bg-red-50 border border-red-100' : 'bg-white/50 border border-white'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs ${isDone ? 'bg-teal-500' : isMissed ? 'bg-slate-300' : isOverdue ? 'bg-red-400' : isNext ? 'bg-teal-200' : 'bg-slate-100'}`}>
                      {isDone ? '✓' : isMissed ? '—' : tp.planned_hour}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black ${isDone ? 'text-teal-700' : isMissed ? 'text-slate-400' : isOverdue ? 'text-red-700' : 'text-slate-700'}`}>
                        T + {tp.planned_hour}h
                      </p>
                      <p className="text-[9px] text-slate-400 font-medium truncate">
                        {tp.sample_types.map(t => t.replace(/_/g, ' ')).join(' · ')}
                      </p>
                    </div>
                    {isActive && !isDone && !isMissed && (
                      <button
                        onClick={() => {
                          if (tp.sample_types.includes('od_ph') || tp.sample_types.includes('biochemistry')) openMeasurementModal(tp);
                          else openPlateModal(tp);
                        }}
                        className="text-[10px] font-black text-teal-600 hover:text-teal-800 shrink-0"
                      >
                        Record
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Plate observations list */}
          {plate_observations.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Microscope className="w-4 h-4 text-violet-600" /> Plate Observations
              </h3>
              <div className="space-y-2">
                {plate_observations.map(obs => (
                  <div key={obs.id} className="bg-white/60 border border-white rounded-xl p-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black text-slate-700">T+{obs.time_point_hours}h — {obs.observation_type === 'sterility' ? 'Sterility' : 'Colony Count'}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${obs.result === 'sterile' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : obs.result === 'contaminated' ? 'bg-red-50 text-red-600 border-red-200' : obs.result === 'normal_growth' ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                        {obs.result || 'pending'}
                      </span>
                    </div>
                    {obs.plate_media && <p className="text-[10px] text-slate-400 mt-0.5">{obs.plate_media} {obs.dilution ? `· ${obs.dilution}` : ''}</p>}
                    {obs.colony_count !== null && obs.colony_count !== undefined && (
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">{obs.colony_count} CFU</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isActive && (
            <button onClick={() => openPlateModal(null)}
              className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-teal-400 text-slate-500 hover:text-teal-600 text-xs font-black rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              <Microscope className="w-3.5 h-3.5" /> Add Plate Observation
            </button>
          )}
        </div>

        {/* Right: Chart + Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chart */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-teal-600" /> Growth Curve
              </h3>
              <div className="flex gap-2 flex-wrap">
                {availableLines.map(l => (
                  <button key={l.key} onClick={() => setShowLines(prev => prev.includes(l.key) ? prev.filter(k => k !== l.key) : [...prev, l.key])}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${showLines.includes(l.key) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}
                  >{l.label}</button>
                ))}
                <button onClick={() => setLogScale(p => !p)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${logScale ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-200'}`}
                >log₁₀</button>
              </div>
            </div>
            <div style={{ height: 280 }}>
              <GrowthCurveChart data={measurements} wavelength={study.od_wavelength || 600} showLines={showLines} logScale={logScale} />
            </div>
          </div>

          {/* Measurements table */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-black text-slate-800 text-sm mb-4">Measurement Log</h3>
            {measurements.length === 0 ? (
              <p className="text-slate-400 text-sm font-medium text-center py-6">No measurements recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-medium">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Hour', `OD${study.od_wavelength || 600}`, 'pH', 'Temp (°C)', 'Glucose (g/L)', 'Protein (mg/mL)', ...(isFermentation ? ['DO%'] : []), 'Turbidity', 'Notes'].map(h => (
                        <th key={h} className="pb-2 pr-4 text-left font-black text-slate-400 uppercase tracking-wider text-[9px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map(m => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 pr-4 font-black text-teal-700">T+{m.actual_hour}h</td>
                        <td className="py-2 pr-4">{m.od_value ?? '—'}</td>
                        <td className="py-2 pr-4">{m.ph_value ?? '—'}</td>
                        <td className="py-2 pr-4">{m.temperature_actual_c ?? '—'}</td>
                        <td className="py-2 pr-4">{m.glucose_g_l ?? '—'}</td>
                        <td className="py-2 pr-4">{m.protein_mg_ml ?? '—'}</td>
                        {isFermentation && <td className="py-2 pr-4">{m.dissolved_oxygen_pct ?? '—'}</td>}
                        <td className="py-2 pr-4">{m.culture_turbidity ? m.culture_turbidity.replace(/_/g, ' ') : '—'}</td>
                        <td className="py-2 pr-4 max-w-[120px] truncate text-slate-400">{m.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Measurement Modal ── */}
      {modal?.type === 'measurement' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">Record Measurement</h3>
                {modal.tp && <p className="text-xs text-slate-500 mt-0.5">Scheduled: T+{modal.tp.planned_hour}h · {modal.tp.sample_types.join(', ')}</p>}
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LabelCls}>Actual Hour *</label>
                  <input className={InputCls} type="number" step="0.1" value={mForm.actual_hour || ''} onChange={e => setMForm(f => ({ ...f, actual_hour: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>OD@{study.od_wavelength || 600}nm</label>
                  <input className={InputCls} type="number" step="0.001" value={mForm.od_value || ''} onChange={e => setMForm(f => ({ ...f, od_value: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>pH</label>
                  <input className={InputCls} type="number" step="0.01" value={mForm.ph_value || ''} onChange={e => setMForm(f => ({ ...f, ph_value: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>Temperature (°C)</label>
                  <input className={InputCls} type="number" step="0.1" value={mForm.temperature_actual_c || ''} onChange={e => setMForm(f => ({ ...f, temperature_actual_c: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>Glucose (g/L) — DNS</label>
                  <input className={InputCls} type="number" step="0.001" value={mForm.glucose_g_l || ''} onChange={e => setMForm(f => ({ ...f, glucose_g_l: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>Protein (mg/mL)</label>
                  <input className={InputCls} type="number" step="0.001" value={mForm.protein_mg_ml || ''} onChange={e => setMForm(f => ({ ...f, protein_mg_ml: e.target.value }))} />
                </div>
                {isFermentation && (
                  <div>
                    <label className={LabelCls}>Dissolved O₂ (%)</label>
                    <input className={InputCls} type="number" step="0.1" value={mForm.dissolved_oxygen_pct || ''} onChange={e => setMForm(f => ({ ...f, dissolved_oxygen_pct: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className={LabelCls}>Culture Turbidity</label>
                  <select className={InputCls} value={mForm.culture_turbidity || ''} onChange={e => setMForm(f => ({ ...f, culture_turbidity: e.target.value }))}>
                    <option value="">Select…</option>
                    {TURBIDITY_OPTIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Culture Color</label>
                  <input className={InputCls} type="text" placeholder="e.g. pale yellow" value={mForm.culture_color || ''} onChange={e => setMForm(f => ({ ...f, culture_color: e.target.value }))} />
                </div>
              </div>

              {/* Plate streak entry inline if this time point needs it */}
              {modal.tp?.sample_types?.some(t => ['plate_streak', 'sterility'].includes(t)) && (
                <div className="bg-violet-50 rounded-2xl p-4 space-y-3 border border-violet-100">
                  <p className="text-xs font-black text-violet-700 uppercase tracking-wider">Plate / Sterility at this point</p>
                  <button
                    type="button"
                    onClick={() => { setModal(null); openPlateModal(modal.tp); }}
                    className="text-xs font-bold text-violet-600 hover:underline"
                  >
                    → Open plate entry form
                  </button>
                </div>
              )}

              <div>
                <label className={LabelCls}>Notes</label>
                <textarea className={InputCls} rows={2} value={mForm.notes || ''} onChange={e => setMForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {modalErr && <p className="text-xs text-red-600 font-bold">{modalErr}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModal(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-50">Cancel</button>
                <button onClick={saveMeasurement} disabled={modalSaving || !mForm.actual_hour}
                  className="flex-1 py-3 bg-teal-700 text-white font-black rounded-2xl text-sm hover:bg-teal-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {modalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Plate Observation Modal ── */}
      {modal?.type === 'plate' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">Plate Observation</h3>
                {modal.tp && <p className="text-xs text-slate-500 mt-0.5">T+{modal.tp.planned_hour}h time point</p>}
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LabelCls}>Time Point (h) *</label>
                  <input className={InputCls} type="number" step="0.1" value={pForm.time_point_hours || ''} onChange={e => setPForm(f => ({ ...f, time_point_hours: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>Observation Type</label>
                  <select className={InputCls} value={pForm.observation_type || 'colony_count'} onChange={e => setPForm(f => ({ ...f, observation_type: e.target.value }))}>
                    <option value="colony_count">Colony Count</option>
                    <option value="sterility">Sterility Check</option>
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Plate Media</label>
                  <select className={InputCls} value={pForm.plate_media || ''} onChange={e => setPForm(f => ({ ...f, plate_media: e.target.value }))}>
                    <option value="">Select…</option>
                    {PLATE_MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Dilution</label>
                  <select className={InputCls} value={pForm.dilution || ''} onChange={e => setPForm(f => ({ ...f, dilution: e.target.value }))}>
                    <option value="">Select…</option>
                    {DILUTION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Incubation Temp (°C)</label>
                  <input className={InputCls} type="number" step="0.5" value={pForm.incubation_temp_c || ''} onChange={e => setPForm(f => ({ ...f, incubation_temp_c: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>Incubation Time (h)</label>
                  <input className={InputCls} type="number" value={pForm.incubation_hours || ''} onChange={e => setPForm(f => ({ ...f, incubation_hours: e.target.value }))} />
                </div>
                {pForm.observation_type !== 'sterility' ? (
                  <>
                    <div>
                      <label className={LabelCls}>Colony Count (CFU)</label>
                      <input className={InputCls} type="number" value={pForm.colony_count || ''} onChange={e => setPForm(f => ({ ...f, colony_count: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Colony Color</label>
                      <input className={InputCls} type="text" value={pForm.colony_color || ''} onChange={e => setPForm(f => ({ ...f, colony_color: e.target.value }))} placeholder="e.g. cream white" />
                    </div>
                  </>
                ) : null}
                <div className="col-span-2">
                  <label className={LabelCls}>Result</label>
                  <div className="flex gap-2">
                    {(pForm.observation_type === 'sterility'
                      ? ['sterile', 'contaminated']
                      : ['normal_growth', 'contaminated', 'pending']
                    ).map(r => (
                      <button key={r} type="button" onClick={() => setPForm(f => ({ ...f, result: r }))}
                        className={`flex-1 py-2 rounded-xl border text-xs font-black transition-colors ${pForm.result === r ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                      >{r.replace(/_/g, ' ')}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className={LabelCls}>Colony Morphology</label>
                <textarea className={InputCls} rows={2} value={pForm.colony_morphology || ''} onChange={e => setPForm(f => ({ ...f, colony_morphology: e.target.value }))} placeholder="Shape, margin, elevation, surface texture…" />
              </div>
              <div>
                <label className={LabelCls}>Notes</label>
                <textarea className={InputCls} rows={1} value={pForm.notes || ''} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {modalErr && <p className="text-xs text-red-600 font-bold">{modalErr}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModal(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-50">Cancel</button>
                <button onClick={savePlate} disabled={modalSaving || !pForm.time_point_hours}
                  className="flex-1 py-3 bg-violet-700 text-white font-black rounded-2xl text-sm hover:bg-violet-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {modalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Observation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
