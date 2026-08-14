'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { useData } from '@/lib/hooks/useData';
import { Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getHarvestWarnings } from '@/lib/batches/stageGates';

const HARVEST_METHODS = ['Centrifugation', 'Filtration', 'Decantation', 'Gravity settling'];
const VIABILITY_METHODS = ['Live/Dead staining', 'Methylene Blue', 'Flow Cytometry', 'Plate count', 'Not done'];

export default function HarvestPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: equipmentData } = useData({
    table: 'equipment',
    select: 'id, name, status',
    order: { column: 'name' }
  });
  const equipment = equipmentData || [];

  const { register, handleSubmit, setValue, getValues, reset, watch } = useForm({
    defaultValues: {
      harvestStart: '',
      method: 'Centrifugation',
      equipId: '',
      finalCultureVol: '',
      harvestTempC: '',
      wetCellWeight: '',
      volumeRecovered: '',
      biomassYieldPct: '',
      cellViabilityPct: '',
      viabilityMethod: 'Not done',
      coolingTimeMins: '',
      holdTempC: '',
      tempAt30Min: '',
      tempAt60Min: '',
      notes: ''
    }
  });

  const watchFinalCultureVol = watch('finalCultureVol');
  const watchWetCellWeight = watch('wetCellWeight');
  const watchBiomassYieldPct = watch('biomassYieldPct');
  const watchHarvestTempC = watch('harvestTempC');
  const watchCoolingTimeMins = watch('coolingTimeMins');
  const watchCellViabilityPct = watch('cellViabilityPct');

  const toLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const loadRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let data;
    try {
      ({ data } = await withTimeout(
        supabase.from('batch_stage_harvest').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
        45000, 
        'Harvest data load timed out'
      ));
    } catch (err) {
      console.error('HarvestPanel fetch error:', err);
      return;
    }
    if (data) {
      setRecord(data);
      reset({
        harvestStart: toLocal(data.harvest_start),
        method: data.method || 'Centrifugation',
        equipId: data.equipment_id || '',
        finalCultureVol: data.final_culture_vol_l || '',
        harvestTempC: data.harvest_temp_c || '',
        wetCellWeight: data.wet_cell_weight_g || '',
        volumeRecovered: data.volume_recovered_l || '',
        biomassYieldPct: data.biomass_yield_pct || '',
        cellViabilityPct: data.cell_viability_pct || '',
        viabilityMethod: data.viability_method || 'Not done',
        coolingTimeMins: data.cooling_time_mins || '',
        holdTempC: data.hold_temp_c || '',
        tempAt30Min: data.temp_at_30min || '',
        tempAt60Min: data.temp_at_60min || '',
        notes: data.notes || ''
      });
    }
  }, [activeFlask?.id, supabase]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  // Auto-calculate biomass yield when both values are entered
  const autoYield = watchFinalCultureVol && watchWetCellWeight
    ? ((parseFloat(watchWetCellWeight) / (parseFloat(watchFinalCultureVol) * 1000)) * 100).toFixed(1)
    : watchBiomassYieldPct;

  const onSubmit = async (formData, advanceTarget = null) => {
    if (!activeFlask?.id) return;
    setSaving(true);
    try {
      const payload = {
        batch_id: batch.id,
        flask_id: activeFlask.id,
        harvest_start: formData.harvestStart ? new Date(formData.harvestStart).toISOString() : null,
        method: formData.method,
        equipment_id: formData.equipId || null,
        final_culture_vol_l: formData.finalCultureVol ? parseFloat(formData.finalCultureVol) : null,
        harvest_temp_c: formData.harvestTempC ? parseFloat(formData.harvestTempC) : null,
        wet_cell_weight_g: formData.wetCellWeight ? parseFloat(formData.wetCellWeight) : null,
        volume_recovered_l: formData.volumeRecovered ? parseFloat(formData.volumeRecovered) : null,
        biomass_yield_pct: autoYield ? parseFloat(autoYield) : null,
        cell_viability_pct: formData.cellViabilityPct ? parseFloat(formData.cellViabilityPct) : null,
        viability_method: formData.viabilityMethod,
        cooling_time_mins: formData.coolingTimeMins ? parseFloat(formData.coolingTimeMins) : null,
        hold_temp_c: formData.holdTempC ? parseFloat(formData.holdTempC) : null,
        temp_at_30min: formData.tempAt30Min ? parseFloat(formData.tempAt30Min) : null,
        temp_at_60min: formData.tempAt60Min ? parseFloat(formData.tempAt60Min) : null,
        operator_id: employeeProfile?.id,
        notes: formData.notes || null,
      };
      const { error } = await supabase.from('batch_stage_harvest')
        .upsert(payload, { onConflict: 'flask_id' });
      if (error) throw error;
      toast.success(advanceTarget ? 'Harvest complete. Trial sent to Downstream Processing.' : 'Harvest record saved.');
      loadRecord();
      if (advanceTarget && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage(advanceTarget, getHarvestWarnings(formData));
      } else {
        onDataSaved?.();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Harvest details.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-3 border-l-4 border-l-orange-500">
        <Package className="w-5 h-5 text-amber-600"/>
        <div>
          <h2 className="text-base font-bold text-slate-900">Harvest: <span className="text-amber-600">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-slate-500">Post-fermentation biomass collection — cooling, transfer, and cell viability record.</p>
        </div>
        {record && <span className="ml-auto px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black rounded-lg uppercase">Saved</span>}
      </div>

      <div className="card p-5 space-y-4">
        {/* Harvest start + method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Harvest Start Time</label>
            <input type="datetime-local" {...register('harvestStart')} className="field-input"/>
          </div>
          <div>
            <label className="field-label">Harvest Method</label>
            <select {...register('method')} className="field-input bg-white">
              {HARVEST_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="field-label">Equipment Used</label>
          <select {...register('equipId')} className="field-input bg-white">
            <option value="">Select equipment...</option>
            {equipment.map(e => <option key={e.id} value={e.id}>{e.name} ({e.status})</option>)}
          </select>
        </div>

        {/* Temperature control */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <p className="text-xs font-black text-slate-900">Cold Chain — LAB must reach &lt;10°C within 2 hours of endpoint</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="field-label">Harvest Temp (°C)</label>
              <input type="number" step="0.1" {...register('harvestTempC')} className="field-input" placeholder="e.g. 8"/>
              {watchHarvestTempC && parseFloat(watchHarvestTempC) > 10 && (
                <p className="text-xs text-amber-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Above 10°C — cold chain risk</p>
              )}
            </div>
            <div>
              <label className="field-label">Hold Temp (°C)</label>
              <input type="number" step="0.1" {...register('holdTempC')} className="field-input" placeholder="2–8"/>
            </div>
            <div>
              <label className="field-label">Cooling Time (min)</label>
              <input type="number" {...register('coolingTimeMins')} className="field-input" placeholder="e.g. 90"/>
              {watchCoolingTimeMins && parseFloat(watchCoolingTimeMins) > 120 && (
                <p className="text-xs text-red-600 font-bold mt-1">Exceeds 2-hour cold-chain target</p>
              )}
            </div>
            {/* A-52: Cooling rate checkpoints */}
            <div>
              <label className="field-label">Temp at 30 min (°C)</label>
              <input type="number" step="0.1" {...register('tempAt30Min')} className="field-input" placeholder="e.g. 20"/>
            </div>
            <div>
              <label className="field-label">Temp at 60 min (°C)</label>
              <input type="number" step="0.1" {...register('tempAt60Min')} className="field-input" placeholder="e.g. 12"/>
            </div>
          </div>
        </div>

        {/* Mass balance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="field-label">Final Culture Volume (L)</label>
            <input type="number" step="0.01" {...register('finalCultureVol')} className="field-input" placeholder="e.g. 0.25"/>
          </div>
          <div>
            <label className="field-label">Volume Recovered (L)</label>
            <input type="number" step="0.01" {...register('volumeRecovered')} className="field-input" placeholder="e.g. 0.20"/>
          </div>
          <div>
            <label className="field-label">Wet Cell Weight (g)</label>
            <input type="number" step="0.01" {...register('wetCellWeight')} className="field-input" placeholder="e.g. 15"/>
          </div>
        </div>

        {/* Auto-calculated biomass yield */}
        {(autoYield !== watchBiomassYieldPct || watchFinalCultureVol) && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0"/>
            Biomass Yield: <span className="font-black text-lg ml-1">{autoYield}%</span>
            <span className="text-emerald-600 font-semibold">(wet cell mass / total culture volume × 100)</span>
          </div>
        )}

        {/* Cell viability */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <p className="text-xs font-black text-slate-900">Cell Viability at Harvest</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label text-slate-800">Viability Method</label>
              <select {...register('viabilityMethod')} className="field-input bg-white">
                {VIABILITY_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label text-slate-800">Viability (%)</label>
              <input type="number" step="0.1" min="0" max="100" {...register('cellViabilityPct')} className="field-input" placeholder="e.g. 92.5"/>
              {watchCellViabilityPct && parseFloat(watchCellViabilityPct) < 80 && (
                <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Low viability — verify harvest conditions</p>
              )}
            </div>
          </div>
        </div>

        <textarea {...register('notes')} rows={2} placeholder="Harvest observations, anomalies..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={handleSubmit((data) => onSubmit(data, null))} disabled={saving} className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Harvest Record'}
          </button>
          <button onClick={handleSubmit((data) => onSubmit(data, 'straining'))} disabled={saving || actionLoading} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            Complete Harvest & Send to DSP
          </button>
        </div>
      </div>
    </div>
  );
}
