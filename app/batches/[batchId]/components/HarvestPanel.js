'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Package, AlertTriangle, Thermometer, CheckCircle2 } from 'lucide-react';

const HARVEST_METHODS = ['Centrifugation', 'Filtration', 'Decantation', 'Gravity settling'];
const VIABILITY_METHODS = ['Live/Dead staining', 'Methylene Blue', 'Flow Cytometry', 'Plate count', 'Not done'];

export default function HarvestPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [equipment, setEquipment] = useState([]);

  const [harvestStart,     setHarvestStart]     = useState('');
  const [method,           setMethod]           = useState('Centrifugation');
  const [equipId,          setEquipId]          = useState('');
  const [finalCultureVol,  setFinalCultureVol]  = useState('');
  const [harvestTempC,     setHarvestTempC]     = useState('');
  const [wetCellWeight,    setWetCellWeight]    = useState('');
  const [volumeRecovered,  setVolumeRecovered]  = useState('');
  const [biomassYieldPct,  setBiomassYieldPct]  = useState('');
  const [cellViabilityPct, setCellViabilityPct] = useState('');
  const [viabilityMethod,  setViabilityMethod]  = useState('Not done');
  const [coolingTimeMins,  setCoolingTimeMins]  = useState('');
  const [holdTempC,        setHoldTempC]        = useState('');
  // A-52: cooling rate tracking
  const [tempAt30Min,      setTempAt30Min]      = useState('');
  const [tempAt60Min,      setTempAt60Min]      = useState('');
  const [notes,            setNotes]            = useState('');

  const toLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const loadRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let data, eq;
    try {
      [{ data }, { data: eq }] = await withTimeout(Promise.all([
        supabase.from('batch_stage_harvest').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
        supabase.from('equipment').select('id, name, status').order('name'),
      ]), 45000, 'Harvest data load timed out');
    } catch (err) {
      console.error('HarvestPanel fetch error:', err);
      return;
    }
    if (eq) setEquipment(eq);
    if (data) {
      setRecord(data);
      setHarvestStart(toLocal(data.harvest_start));
      setMethod(data.method || 'Centrifugation');
      setEquipId(data.equipment_id || '');
      setFinalCultureVol(data.final_culture_vol_l || '');
      setHarvestTempC(data.harvest_temp_c || '');
      setWetCellWeight(data.wet_cell_weight_g || '');
      setVolumeRecovered(data.volume_recovered_l || '');
      setBiomassYieldPct(data.biomass_yield_pct || '');
      setCellViabilityPct(data.cell_viability_pct || '');
      setViabilityMethod(data.viability_method || 'Not done');
      setCoolingTimeMins(data.cooling_time_mins || '');
      setHoldTempC(data.hold_temp_c || '');
      setTempAt30Min(data.temp_at_30min || '');
      setTempAt60Min(data.temp_at_60min || '');
      setNotes(data.notes || '');
    }
  }, [activeFlask?.id, supabase]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  // Auto-calculate biomass yield when both values are entered
  const autoYield = finalCultureVol && wetCellWeight
    ? ((parseFloat(wetCellWeight) / (parseFloat(finalCultureVol) * 1000)) * 100).toFixed(1)
    : biomassYieldPct;

  const handleSave = async (advanceTarget = null) => {
    if (!activeFlask?.id) return;
    setSaving(true);
    try {
      const payload = {
        batch_id: batch.id,
        flask_id: activeFlask.id,
        harvest_start: harvestStart ? new Date(harvestStart).toISOString() : null,
        method,
        equipment_id: equipId || null,
        final_culture_vol_l: finalCultureVol ? parseFloat(finalCultureVol) : null,
        harvest_temp_c: harvestTempC ? parseFloat(harvestTempC) : null,
        wet_cell_weight_g: wetCellWeight ? parseFloat(wetCellWeight) : null,
        volume_recovered_l: volumeRecovered ? parseFloat(volumeRecovered) : null,
        biomass_yield_pct: autoYield ? parseFloat(autoYield) : null,
        cell_viability_pct: cellViabilityPct ? parseFloat(cellViabilityPct) : null,
        viability_method: viabilityMethod,
        cooling_time_mins: coolingTimeMins ? parseFloat(coolingTimeMins) : null,
        hold_temp_c: holdTempC ? parseFloat(holdTempC) : null,
        temp_at_30min: tempAt30Min ? parseFloat(tempAt30Min) : null,
        temp_at_60min: tempAt60Min ? parseFloat(tempAt60Min) : null,
        operator_id: employeeProfile?.id,
        notes: notes || null,
      };
      const { error } = await supabase.from('batch_stage_harvest')
        .upsert(payload, { onConflict: 'flask_id' });
      if (error) throw error;
      toast.success(advanceTarget ? 'Harvest saved. Advancing to Straining.' : 'Harvest record saved.');
      loadRecord();
      if (advanceTarget && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage(advanceTarget);
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
            <input type="datetime-local" value={harvestStart} onChange={e => setHarvestStart(e.target.value)} className="field-input"/>
          </div>
          <div>
            <label className="field-label">Harvest Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="field-input bg-white">
              {HARVEST_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="field-label">Equipment Used</label>
          <select value={equipId} onChange={e => setEquipId(e.target.value)} className="field-input bg-white">
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
              <input type="number" step="0.1" value={harvestTempC} onChange={e => setHarvestTempC(e.target.value)} className="field-input" placeholder="e.g. 8"/>
              {harvestTempC && parseFloat(harvestTempC) > 10 && (
                <p className="text-xs text-amber-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Above 10°C — cold chain risk</p>
              )}
            </div>
            <div>
              <label className="field-label">Hold Temp (°C)</label>
              <input type="number" step="0.1" value={holdTempC} onChange={e => setHoldTempC(e.target.value)} className="field-input" placeholder="2–8"/>
            </div>
            <div>
              <label className="field-label">Cooling Time (min)</label>
              <input type="number" value={coolingTimeMins} onChange={e => setCoolingTimeMins(e.target.value)} className="field-input" placeholder="e.g. 90"/>
              {coolingTimeMins && parseFloat(coolingTimeMins) > 120 && (
                <p className="text-xs text-red-600 font-bold mt-1">Exceeds 2-hour cold-chain target</p>
              )}
            </div>
            {/* A-52: Cooling rate checkpoints */}
            <div>
              <label className="field-label">Temp at 30 min (°C)</label>
              <input type="number" step="0.1" value={tempAt30Min} onChange={e => setTempAt30Min(e.target.value)} className="field-input" placeholder="e.g. 20"/>
            </div>
            <div>
              <label className="field-label">Temp at 60 min (°C)</label>
              <input type="number" step="0.1" value={tempAt60Min} onChange={e => setTempAt60Min(e.target.value)} className="field-input" placeholder="e.g. 12"/>
            </div>
          </div>
        </div>

        {/* Mass balance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="field-label">Final Culture Volume (L)</label>
            <input type="number" step="0.01" value={finalCultureVol} onChange={e => setFinalCultureVol(e.target.value)} className="field-input" placeholder="e.g. 0.25"/>
          </div>
          <div>
            <label className="field-label">Volume Recovered (L)</label>
            <input type="number" step="0.01" value={volumeRecovered} onChange={e => setVolumeRecovered(e.target.value)} className="field-input" placeholder="e.g. 0.20"/>
          </div>
          <div>
            <label className="field-label">Wet Cell Weight (g)</label>
            <input type="number" step="0.01" value={wetCellWeight} onChange={e => setWetCellWeight(e.target.value)} className="field-input" placeholder="e.g. 15"/>
          </div>
        </div>

        {/* Auto-calculated biomass yield */}
        {(autoYield !== biomassYieldPct || finalCultureVol) && (
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
              <select value={viabilityMethod} onChange={e => setViabilityMethod(e.target.value)} className="field-input bg-white">
                {VIABILITY_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label text-slate-800">Viability (%)</label>
              <input type="number" step="0.1" min="0" max="100" value={cellViabilityPct} onChange={e => setCellViabilityPct(e.target.value)} className="field-input" placeholder="e.g. 92.5"/>
              {cellViabilityPct && parseFloat(cellViabilityPct) < 80 && (
                <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Low viability — verify harvest conditions</p>
              )}
            </div>
          </div>
        </div>

        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Harvest observations, anomalies..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => handleSave(null)} disabled={saving} className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Harvest Record'}
          </button>
          <button onClick={() => handleSave('straining')} disabled={saving || actionLoading} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            Save & Advance to Straining
          </button>
        </div>
      </div>
    </div>
  );
}
