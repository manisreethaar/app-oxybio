'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Plus, Trash2, FlaskConical } from 'lucide-react';

const VESSEL_TYPES = ['test_tube','flask_50ml','flask_125ml','flask_250ml','flask_500ml','flask_1000ml','bioreactor_1L','bioreactor_5L','bioreactor_10L'];
const SAMPLE_TYPE_OPTIONS = [
  { value: 'od_ph',        label: 'OD & pH',        shortLabel: 'OD & pH' },
  { value: 'biochemistry', label: 'Biochemistry (Glucose/Protein)', shortLabel: 'Biochem' },
  { value: 'plate_streak', label: 'Plate Streak / Colony Count',    shortLabel: 'Plate' },
  { value: 'sterility',    label: 'Sterility Check', shortLabel: 'Sterility' },
];
const DEFAULT_SCHEDULE = [0, 2, 4, 6, 8, 12, 18, 24, 36, 48];

export default function NewGrowthStudyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [strains, setStrains] = useState([]);
  const [preps, setPreps] = useState([]);
  const [formulations, setFormulations] = useState([]);
  const [vials, setVials] = useState([]);

  const [form, setForm] = useState({
    name: '',
    study_type: 'growth_curve',
    objective: '',
    // Step 1 - biology
    isolate_source: 'strain',
    cell_bank_strain_id: '',
    cell_bank_preparation_id: '',
    formulation_id: '',
    media_name: '',
    vial_id: '',
    // Step 2 - conditions
    vessel_type: 'flask_250ml',
    volume_ml: '',
    temperature_c: '37',
    agitation_rpm: '150',
    inoculum_percentage: '1',
    inoculum_volume_ml: '',
    od_wavelength: '600',
    initial_od: '',
    initial_ph: '',
    initial_glucose_g_l: '',
    expected_duration_hours: '48',
    notes: '',
  });

  // Step 3 - time points
  const [timePoints, setTimePoints] = useState(
    DEFAULT_SCHEDULE.map(h => ({ planned_hour: h, sample_types: ['od_ph'] }))
  );
  const [newHour, setNewHour] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('cell_bank_strains').select('id, name, accession_number').order('name'),
      supabase.from('cell_bank_preparations').select('id, prep_code, type, passage_number').order('created_at', { ascending: false }),
      supabase.from('formulations').select('id, name, code').eq('status', 'Approved').order('name'),
    ]).then(([s, p, f]) => {
      setStrains(s.data || []);
      setPreps(p.data || []);
      setFormulations(f.data || []);
    });
  }, [supabase]);

  // Fetch available vials when a preparation is selected
  useEffect(() => {
    if (form.isolate_source !== 'prep' || !form.cell_bank_preparation_id) {
      setVials([]);
      setField('vial_id', '');
      return;
    }
    supabase
      .from('cell_bank_vials')
      .select('id, vial_code, storage_temp, freezer_id, rack, box, position')
      .eq('preparation_id', form.cell_bank_preparation_id)
      .eq('status', 'Available')
      .order('vial_code')
      .then(({ data }) => setVials(data || []));
  }, [supabase, form.isolate_source, form.cell_bank_preparation_id]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleSampleType = (tpIdx, type) => {
    setTimePoints(prev => prev.map((tp, i) => {
      if (i !== tpIdx) return tp;
      const has = tp.sample_types.includes(type);
      return {
        ...tp,
        sample_types: has ? tp.sample_types.filter(t => t !== type) : [...tp.sample_types, type]
      };
    }));
  };

  const addTimePoint = () => {
    const h = parseFloat(newHour);
    if (isNaN(h) || h < 0) return;
    if (timePoints.some(t => t.planned_hour === h)) return;
    setTimePoints(prev => [...prev, { planned_hour: h, sample_types: ['od_ph'] }].sort((a, b) => a.planned_hour - b.planned_hour));
    setNewHour('');
  };

  const removeTimePoint = (i) => setTimePoints(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        study_type: form.study_type,
        objective: form.objective || null,
        cell_bank_strain_id: form.isolate_source === 'strain' && form.cell_bank_strain_id ? form.cell_bank_strain_id : null,
        cell_bank_preparation_id: form.isolate_source === 'prep' && form.cell_bank_preparation_id ? form.cell_bank_preparation_id : null,
        vial_id: form.isolate_source === 'prep' && form.vial_id ? form.vial_id : null,
        formulation_id: form.formulation_id || null,
        media_name: !form.formulation_id ? form.media_name || null : null,
        vessel_type: form.vessel_type || null,
        volume_ml: form.volume_ml ? parseFloat(form.volume_ml) : null,
        temperature_c: form.temperature_c ? parseFloat(form.temperature_c) : null,
        agitation_rpm: form.agitation_rpm ? parseInt(form.agitation_rpm) : null,
        inoculum_percentage: form.inoculum_percentage ? parseFloat(form.inoculum_percentage) : null,
        inoculum_volume_ml: form.inoculum_volume_ml ? parseFloat(form.inoculum_volume_ml) : null,
        od_wavelength: parseInt(form.od_wavelength) || 600,
        initial_od: form.initial_od ? parseFloat(form.initial_od) : null,
        initial_ph: form.initial_ph ? parseFloat(form.initial_ph) : null,
        initial_glucose_g_l: form.initial_glucose_g_l ? parseFloat(form.initial_glucose_g_l) : null,
        expected_duration_hours: form.expected_duration_hours ? parseInt(form.expected_duration_hours) : null,
        notes: form.notes || null,
        status: 'setup',
        time_points: timePoints.map(tp => ({
          planned_hour: tp.planned_hour,
          sample_types: tp.sample_types.length ? tp.sample_types : ['od_ph'],
        })),
      };

      const res = await fetch('/api/growth-studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/growth-studies/${data.data.id}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const canNext1 = form.name.trim() &&
    (form.isolate_source !== 'strain' || form.cell_bank_strain_id) &&
    (form.isolate_source !== 'prep' || form.cell_bank_preparation_id);

  const InputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent';
  const LabelCls = 'block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5';

  return (
    <div className="max-w-2xl mx-auto pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800">New Growth Study</h1>
        <p className="text-slate-500 mt-1 font-medium">Set up your isolate characterisation or fermentation run.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {['Isolate & Media', 'Conditions', 'Sampling Schedule'].map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-colors ${step > i + 1 ? 'bg-slate-600 border-slate-600 text-white' : step === i + 1 ? 'bg-white border-slate-600 text-slate-700' : 'bg-white border-slate-200 text-slate-400'}`}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-bold hidden sm:block ${step === i + 1 ? 'text-slate-700' : 'text-slate-400'}`}>{s}</span>
            {i < 2 && <div className={`flex-1 h-0.5 ${step > i + 1 ? 'bg-slate-500' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <div className="glass-card rounded-3xl p-8 space-y-6">
        {/* ─── Step 1 ─── */}
        {step === 1 && (
          <>
            <div>
              <label className={LabelCls}>Study Name *</label>
              <input className={InputCls} value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Lactobacillus GC Run 01" />
            </div>
            <div>
              <label className={LabelCls}>Study Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[['growth_curve', 'Growth Curve', 'Isolate characterisation, OD/pH tracking'], ['fermentation', 'Fermentation', 'Process monitoring, product formation']].map(([v, l, d]) => (
                  <button key={v} type="button" onClick={() => setField('study_type', v)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${form.study_type === v ? 'border-slate-500 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <p className="font-black text-sm text-slate-800">{l}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={LabelCls}>Isolate Source</label>
              <div className="flex gap-3 mb-3">
                {[['strain', 'Cell Bank Strain'], ['prep', 'Preparation / Vial']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setField('isolate_source', v)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-black transition-colors ${form.isolate_source === v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                  >{l}</button>
                ))}
              </div>
              {form.isolate_source === 'strain' ? (
                <select className={InputCls} value={form.cell_bank_strain_id} onChange={e => setField('cell_bank_strain_id', e.target.value)}>
                  <option value="">Select strain…</option>
                  {strains.map(s => <option key={s.id} value={s.id}>{s.name}{s.accession_number ? ` (${s.accession_number})` : ''}</option>)}
                </select>
              ) : (
                <>
                  <select className={InputCls} value={form.cell_bank_preparation_id} onChange={e => { setField('cell_bank_preparation_id', e.target.value); setField('vial_id', ''); }}>
                    <option value="">Select preparation…</option>
                    {preps.map(p => <option key={p.id} value={p.id}>{p.prep_code} — {p.type}{p.passage_number ? ` P${p.passage_number}` : ''}</option>)}
                  </select>
                  {form.cell_bank_preparation_id && (
                    <div className="mt-3">
                      <label className={LabelCls}>Select Vial to Use <span className="text-slate-600">*</span></label>
                      {vials.length === 0 ? (
                        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
                          No available vials for this preparation.
                        </div>
                      ) : (
                        <select className={InputCls} value={form.vial_id} onChange={e => setField('vial_id', e.target.value)}>
                          <option value="">Select vial…</option>
                          {vials.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.vial_code}{v.storage_temp ? ` · ${v.storage_temp}` : ''}{v.freezer_id ? ` · ${v.freezer_id}` : ''}{v.rack ? `/${v.rack}` : ''}{v.position ? `/${v.position}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="text-xs text-slate-400 font-medium mt-1">The selected vial will be marked as Used when the study is started.</p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className={LabelCls}>Growth Media</label>
              <select className={InputCls} value={form.formulation_id} onChange={e => setField('formulation_id', e.target.value)}>
                <option value="">Select from Formulation Library…</option>
                {formulations.map(f => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
              </select>
              {!form.formulation_id && (
                <input className={`${InputCls} mt-2`} value={form.media_name} onChange={e => setField('media_name', e.target.value)} placeholder="Or type media name manually (e.g. MRS Broth)" />
              )}
            </div>
            <div>
              <label className={LabelCls}>Objective (optional)</label>
              <textarea className={InputCls} rows={2} value={form.objective} onChange={e => setField('objective', e.target.value)} placeholder="What are you trying to characterise?" />
            </div>
          </>
        )}

        {/* ─── Step 2 ─── */}
        {step === 2 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LabelCls}>Vessel Type</label>
                <select className={InputCls} value={form.vessel_type} onChange={e => setField('vessel_type', e.target.value)}>
                  {VESSEL_TYPES.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className={LabelCls}>Working Volume (mL)</label>
                <input className={InputCls} type="number" value={form.volume_ml} onChange={e => setField('volume_ml', e.target.value)} placeholder="e.g. 100" />
              </div>
              <div>
                <label className={LabelCls}>Incubation Temp (°C)</label>
                <input className={InputCls} type="number" step="0.5" value={form.temperature_c} onChange={e => setField('temperature_c', e.target.value)} />
              </div>
              <div>
                <label className={LabelCls}>Agitation (rpm)</label>
                <input className={InputCls} type="number" value={form.agitation_rpm} onChange={e => setField('agitation_rpm', e.target.value)} />
              </div>
              <div>
                <label className={LabelCls}>Inoculum (%v/v)</label>
                <input className={InputCls} type="number" step="0.1" value={form.inoculum_percentage} onChange={e => setField('inoculum_percentage', e.target.value)} />
              </div>
              <div>
                <label className={LabelCls}>Inoculum Volume (mL)</label>
                <input className={InputCls} type="number" step="0.1" value={form.inoculum_volume_ml} onChange={e => setField('inoculum_volume_ml', e.target.value)} />
              </div>
              <div>
                <label className={LabelCls}>OD Wavelength (nm)</label>
                <input className={InputCls} type="number" value={form.od_wavelength} onChange={e => setField('od_wavelength', e.target.value)} />
              </div>
              <div>
                <label className={LabelCls}>Expected Duration (h)</label>
                <input className={InputCls} type="number" value={form.expected_duration_hours} onChange={e => setField('expected_duration_hours', e.target.value)} />
              </div>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-black text-slate-600 uppercase tracking-wider">Baseline at T=0 (optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={LabelCls}>Initial OD</label>
                  <input className={InputCls} type="number" step="0.001" value={form.initial_od} onChange={e => setField('initial_od', e.target.value)} placeholder="0.050" />
                </div>
                <div>
                  <label className={LabelCls}>Initial pH</label>
                  <input className={InputCls} type="number" step="0.01" value={form.initial_ph} onChange={e => setField('initial_ph', e.target.value)} placeholder="6.80" />
                </div>
                <div>
                  <label className={LabelCls}>Initial Glucose (g/L)</label>
                  <input className={InputCls} type="number" step="0.1" value={form.initial_glucose_g_l} onChange={e => setField('initial_glucose_g_l', e.target.value)} placeholder="10.0" />
                </div>
              </div>
            </div>
            <div>
              <label className={LabelCls}>Notes</label>
              <textarea className={InputCls} rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Special conditions, media prep notes…" />
            </div>
          </>
        )}

        {/* ─── Step 3 ─── */}
        {step === 3 && (
          <>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <input
                className="w-24 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                type="number" step="0.5" min="0" value={newHour}
                onChange={e => setNewHour(e.target.value)}
                placeholder="Hours"
                onKeyDown={e => e.key === 'Enter' && addTimePoint()}
              />
              <button onClick={addTimePoint} className="px-4 py-2 bg-slate-600 text-white rounded-xl text-xs font-black hover:bg-slate-700 flex items-center gap-1.5 min-h-[38px]">
                <Plus className="w-3.5 h-3.5" /> Add Point
              </button>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">Press Enter or click Add</span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {timePoints.map((tp, i) => (
                <div key={tp.planned_hour} className="flex items-start gap-3 bg-slate-50 rounded-2xl p-3">
                  <div className="w-16 shrink-0 text-center">
                    <span className="text-lg font-black text-slate-700">T+{tp.planned_hour}h</span>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {SAMPLE_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleSampleType(i, opt.value)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-colors ${
                          tp.sample_types.includes(opt.value)
                            ? 'bg-slate-600 text-white border-slate-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                        }`}
                        title={opt.label}
                      >
                        <span className="hidden sm:inline">{opt.label}</span>
                        <span className="sm:hidden">{opt.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeTimePoint(i)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 font-medium">{timePoints.length} time points defined.</p>
          </>
        )}

        {error && <p className="text-sm text-red-600 font-bold bg-red-50 rounded-xl px-4 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="flex items-center px-5 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 text-sm">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !canNext1}
              className="flex-1 flex items-center justify-center px-5 py-3 bg-slate-700 hover:bg-slate-800 text-white font-black rounded-2xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 bg-slate-700 hover:bg-slate-800 text-white font-black rounded-2xl text-sm disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Study'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
