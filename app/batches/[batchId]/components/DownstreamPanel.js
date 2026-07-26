'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Layers, CheckCircle2 } from 'lucide-react';

const PACKAGING_TYPES = ['Glass bottle', 'HDPE bottle', 'Foil pouch', 'PET bottle', 'Sachet', 'Drum', 'Other'];
const PROCESS_STEPS = [
  { key: 'concentration', label: 'Concentration / Evaporation' },
  { key: 'spray_drying',  label: 'Spray Drying' },
  { key: 'freeze_drying', label: 'Freeze Drying' },
  { key: 'encapsulation', label: 'Microencapsulation' },
  { key: 'blending',      label: 'Blending / Mixing' },
  { key: 'filling',       label: 'Fill & Seal' },
  { key: 'labelling',     label: 'Labelling' },
  { key: 'inspection',    label: 'Visual Inspection' },
];

export default function DownstreamPanel({ batch, activeFlask, employeeProfile, role, supabase, onDataSaved }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const [stepsCompleted, setStepsCompleted] = useState({});
  const [stepNotes,      setStepNotes]      = useState({});
  const [finalConc,      setFinalConc]      = useState('');
  const [moisturePct,    setMoisturePct]    = useState('');
  const [finalWeightKg,  setFinalWeightKg]  = useState('');
  const [tempRange,      setTempRange]      = useState('');
  const [packagingType,  setPackagingType]  = useState('');
  const [fillWeightG,    setFillWeightG]    = useState('');
  const [unitsProduced,  setUnitsProduced]  = useState('');
  const [notes,          setNotes]          = useState('');

  const loadRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let data;
    try {
      ({ data } = await withTimeout(supabase.from('batch_stage_downstream').select('*').eq('flask_id', activeFlask.id).maybeSingle(), 20000, 'Downstream record load timed out'));
    } catch (err) {
      console.error('DownstreamPanel fetch error:', err);
      return;
    }
    if (data) {
      setRecord(data);
      const s = data.steps || {};
      setStepsCompleted(Object.fromEntries(PROCESS_STEPS.map(p => [p.key, s[p.key]?.completed || false])));
      setStepNotes(Object.fromEntries(PROCESS_STEPS.map(p => [p.key, s[p.key]?.notes || ''])));
      setFinalConc(data.final_concentration || '');
      setMoisturePct(data.moisture_pct || '');
      setFinalWeightKg(data.final_weight_kg || '');
      setTempRange(data.temp_range_c || '');
      setPackagingType(data.packaging_type || '');
      setFillWeightG(data.fill_weight_g || '');
      setUnitsProduced(data.units_produced || '');
      setNotes(data.notes || '');
    } else {
      setStepsCompleted(Object.fromEntries(PROCESS_STEPS.map(p => [p.key, false])));
      setStepNotes(Object.fromEntries(PROCESS_STEPS.map(p => [p.key, ''])));
    }
  }, [activeFlask?.id, supabase]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  const handleSave = async () => {
    if (!activeFlask?.id) return;
    setSaving(true);
    try {
      const steps = Object.fromEntries(PROCESS_STEPS.map(p => [p.key, {
        completed: stepsCompleted[p.key] || false,
        notes: stepNotes[p.key] || null,
      }]));
      const { error } = await supabase.from('batch_stage_downstream').upsert({
        batch_id: batch.id,
        flask_id: activeFlask.id,
        steps,
        final_concentration: finalConc || null,
        moisture_pct: moisturePct ? parseFloat(moisturePct) : null,
        final_weight_kg: finalWeightKg ? parseFloat(finalWeightKg) : null,
        temp_range_c: tempRange || null,
        packaging_type: packagingType || null,
        fill_weight_g: fillWeightG ? parseFloat(fillWeightG) : null,
        units_produced: unitsProduced ? parseInt(unitsProduced) : null,
        operator_id: employeeProfile?.id,
        notes: notes || null,
      }, { onConflict: 'flask_id' });
      if (error) throw error;
      toast.success('Downstream processing record saved.');
      loadRecord();
      onDataSaved?.();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Downstream details.</div>;

  const completedCount = PROCESS_STEPS.filter(p => stepsCompleted[p.key]).length;

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-3 border-l-4 border-l-slate-500">
        <Layers className="w-5 h-5 text-slate-600"/>
        <div>
          <h2 className="text-base font-bold text-slate-900">Downstream Processing: <span className="text-slate-600">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-slate-500">Concentration, drying, packaging and fill/finish record.</p>
        </div>
        <span className="ml-auto text-xs font-black text-slate-700 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
          {completedCount}/{PROCESS_STEPS.length} steps
        </span>
      </div>

      {/* Process steps checklist */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-900">Process Steps Completed</h3>
        {PROCESS_STEPS.map(step => (
          <div key={step.key} className={`p-3 rounded-xl border transition-all ${stepsCompleted[step.key] ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={stepsCompleted[step.key] || false}
                onChange={e => setStepsCompleted(prev => ({ ...prev, [step.key]: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300"/>
              <span className={`text-sm font-bold ${stepsCompleted[step.key] ? 'text-emerald-800' : 'text-slate-700'}`}>{step.label}</span>
              {stepsCompleted[step.key] && <CheckCircle2 className="w-4 h-4 text-emerald-600 ml-auto"/>}
            </label>
            {stepsCompleted[step.key] && (
              <input value={stepNotes[step.key] || ''} onChange={e => setStepNotes(prev => ({...prev, [step.key]: e.target.value}))}
                className="mt-2 w-full px-3 py-1.5 border border-emerald-200 rounded-lg text-xs font-semibold outline-none bg-white"
                placeholder="Notes for this step (optional)"/>
            )}
          </div>
        ))}
      </div>

      {/* Output specifications */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-black text-slate-900">Output Specifications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Final Concentration</label>
            <input value={finalConc} onChange={e => setFinalConc(e.target.value)} className="field-input" placeholder="e.g. 10⁹ CFU/g or 1:5 v/v"/>
          </div>
          <div>
            <label className="field-label">Moisture Content (%)</label>
            <input type="number" step="0.1" value={moisturePct} onChange={e => setMoisturePct(e.target.value)} className="field-input" placeholder="e.g. 5.2"/>
          </div>
          <div>
            <label className="field-label">Final Weight / Yield (kg)</label>
            <input type="number" step="0.001" value={finalWeightKg} onChange={e => setFinalWeightKg(e.target.value)} className="field-input" placeholder="e.g. 0.250"/>
          </div>
          <div>
            <label className="field-label">Processing Temp Range (°C)</label>
            <input value={tempRange} onChange={e => setTempRange(e.target.value)} className="field-input" placeholder="e.g. 60–80 (inlet/outlet)"/>
          </div>
        </div>

        {/* Packaging */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="field-label">Packaging Type</label>
            <select value={packagingType} onChange={e => setPackagingType(e.target.value)} className="field-input bg-white">
              <option value="">Select...</option>
              {PACKAGING_TYPES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Fill Weight (g)</label>
            <input type="number" step="0.1" value={fillWeightG} onChange={e => setFillWeightG(e.target.value)} className="field-input" placeholder="e.g. 250"/>
          </div>
          <div>
            <label className="field-label">Units Produced</label>
            <input type="number" value={unitsProduced} onChange={e => setUnitsProduced(e.target.value)} className="field-input" placeholder="e.g. 24"/>
          </div>
        </div>

        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Downstream notes, deviations, rework..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <button onClick={handleSave} disabled={saving} className="w-full py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Downstream Record'}
        </button>
      </div>
    </div>
  );
}
