'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { useData } from '@/lib/hooks/useData';
import { ShieldCheck, AlertTriangle, ExternalLink, FlaskConical, Play, FileText, CheckCircle2 } from 'lucide-react';
import { syncStageToLNB } from '@/lib/lnbSync';

const METHODS  = ['Autoclave','Pressure Cooker','Dry Heat','Filter','Chemical','Other'];
const TAPE_RES = ['Positive','Negative'];
const BI_RESULTS = ['Pass','Fail','Not Used'];

// F₀ = hold_time_min × 10^((temp_c - 121.1) / 10)
function calcF0(tempC, holdMin) {
  const t = parseFloat(tempC);
  const h = parseFloat(holdMin);
  if (!t || !h || isNaN(t) || isNaN(h)) return null;
  return parseFloat((h * Math.pow(10, (t - 121.1) / 10)).toFixed(2));
}

export default function SterilisationPanel({ batch, employees, employeeProfile, role, availableStock, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast = useToast();
  const [saving,    setSaving]    = useState(false);
  const isInternOrRI = ['intern','research_intern'].includes(role);

  const { data: equipmentData } = useData({
    table: 'equipment',
    select: 'id, name, status, requires_calibration, calibration_due_date, iq_doc_url, oq_doc_url, pq_doc_url',
    order: { column: 'name' }
  });
  const equipment = equipmentData || [];

  const { register, handleSubmit, setValue, watch, reset, getValues } = useForm({
    defaultValues: {
      method: 'Pressure Cooker', equipId: '', temp: '', pressure: '', holdMin: '',
      cycleStart: '', cycleEnd: '', tape: 'Positive', passFail: 'Pending', notes: '',
      biUsed: false, biResult: 'Not Used', biIncDate: '',
      steamQuality: '', loadDesc: '', loadTotalVol: '', flaskSizes: '', condensateCheck: '',
      coolingMin: '',
      showCycle2: false, cycle2Temp: '', cycle2Hold: '', cycle2Start: '', cycle2End: '', cycle2Tape: 'Positive'
    }
  });

  const watchMethod = watch('method');
  const watchEquipId = watch('equipId');
  const watchTape = watch('tape');
  const watchPassFail = watch('passFail');
  const watchBiUsed = watch('biUsed');
  const watchBiResult = watch('biResult');
  const watchSteamQuality = watch('steamQuality');
  const watchCondensateCheck = watch('condensateCheck');
  const watchShowCycle2 = watch('showCycle2');
  const watchCycle2Tape = watch('cycle2Tape');
  const watchTemp = watch('temp');
  const watchHoldMin = watch('holdMin');
  const watchCycleStart = watch('cycleStart');
  const watchCycleEnd = watch('cycleEnd');

  // G-03: CAPA linkage
  const [capaDevId,  setCapaDevId]  = useState(null);
  const [raisingCapa, setRaisingCapa] = useState(false);

  const fetchRecord = useCallback(async () => {
    let isCurrent = true;
    let dRes;
    try {
      dRes = await withTimeout(
        supabase.from('batch_stage_sterilisation').select('*').eq('batch_id', batch.id).maybeSingle(),
        45000, 
        'Sterilisation data load timed out'
      );
    } catch (err) {
      console.error('SterilisationPanel fetch error:', err);
      return;
    }
    if (!isCurrent) return;
    if (dRes.data) {
      const d = dRes.data;
      reset({
        method: d.method||'Pressure Cooker', equipId: d.equipment_id||'',
        temp: d.cycle_temp_c||'', pressure: d.cycle_pressure_bar||'',
        holdMin: d.hold_time_min||'',
        cycleStart: d.cycle_start ? (() => { const d1 = new Date(d.cycle_start); d1.setMinutes(d1.getMinutes() - d1.getTimezoneOffset()); return d1.toISOString().slice(0,16); })() : '',
        cycleEnd: d.cycle_end ? (() => { const d1 = new Date(d.cycle_end); d1.setMinutes(d1.getMinutes() - d1.getTimezoneOffset()); return d1.toISOString().slice(0,16); })() : '',
        tape: d.autoclave_tape||'Positive', passFail: d.pass_fail||'Pending',
        notes: d.notes||'', biUsed: d.bi_used||false, biResult: d.bi_result||'Not Used',
        biIncDate: d.bi_incubation_date||'',
        steamQuality: d.steam_quality_check||'',
        loadDesc: d.load_description||'',
        loadTotalVol: d.load_total_volume_ml||'',
        flaskSizes: (d.flask_sizes||[]).join(', '),
        condensateCheck: d.condensate_check||'',
        coolingMin: d.cooling_time_min||'',
        showCycle2: !!d.cycle2_temp_c,
        cycle2Temp: d.cycle2_temp_c||'', cycle2Hold: d.cycle2_hold_min||'', cycle2Tape: d.cycle2_tape||'Positive',
        cycle2Start: d.cycle2_start ? (() => { const dt = new Date(d.cycle2_start); dt.setMinutes(dt.getMinutes()-dt.getTimezoneOffset()); return dt.toISOString().slice(0,16); })() : '',
        cycle2End: d.cycle2_end ? (() => { const dt = new Date(d.cycle2_end); dt.setMinutes(dt.getMinutes()-dt.getTimezoneOffset()); return dt.toISOString().slice(0,16); })() : ''
      });
      setCapaDevId(d.capa_deviation_id||null);
    }
    return () => { isCurrent = false; };
  }, [batch.id, supabase]);

  useEffect(() => { fetchRecord(); }, [fetchRecord]);

  const selectedEquip = equipment.find(e => e.id === watchEquipId);
  const isCalibExpired = selectedEquip?.requires_calibration !== false && selectedEquip?.calibration_due_date ? selectedEquip.calibration_due_date < new Date().toLocaleDateString('en-CA') : false;
  const isEquipBad     = selectedEquip && (selectedEquip.status !== 'Operational' || isCalibExpired);

  const holdTime = watchCycleStart && watchCycleEnd
    ? ((new Date(watchCycleEnd) - new Date(watchCycleStart)) / 60000).toFixed(0)
    : watchHoldMin;

  // G-02: F₀ auto-calculation
  const f0 = calcF0(watchTemp, holdTime);

  // G-03: Auto-raise CAPA when Fail is saved
  const autoRaiseCapa = async () => {
    if (capaDevId) return capaDevId; // already raised
    setRaisingCapa(true);
    try {
      const res = await fetch('/api/capa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'raise',
          payload: {
            title: `Sterilisation Fail — Batch ${batch.batch_id}`,
            severity: 'Major',
            source: 'Sterilisation',
            description: `Sterilisation stage failed for batch ${batch.batch_id}. Method: ${getValues('method')}. Tape: ${getValues('tape')}. Autoclave tape result did not confirm adequate sterilisation. Immediate investigation required.`,
          },
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        setCapaDevId(json.data.id);
        return json.data.id;
      }
    } catch {
      // non-blocking — CAPA raise failure should not block save
    } finally {
      setRaisingCapa(false);
    }
    return null;
  };

  const onSubmit = async (formData, advance = false) => {
    if (advance && formData.passFail !== 'Pass') {
      toast.error('Cannot advance — sterilisation must Pass before proceeding to Inoculation.');
      return;
    }
    if (isEquipBad) {
      toast.error('Cannot save — Equipment is not operational or calibration is expired.');
      return;
    }
    setSaving(true);
    try {
      let devId = capaDevId;
      // G-03: auto-raise CAPA on Fail save
      if (formData.passFail === 'Fail' && !capaDevId) {
        devId = await autoRaiseCapa();
        if (devId) toast.warn('CAPA deviation auto-raised for sterilisation failure. Review in Compliance module.');
      }

      const { error } = await supabase.from('batch_stage_sterilisation').upsert({
        batch_id: batch.id, method: formData.method, equipment_id: formData.equipId || null,
        cycle_temp_c: formData.temp ? parseFloat(formData.temp) : null, cycle_pressure_bar: formData.pressure ? parseFloat(formData.pressure) : null,
        hold_time_min: holdTime ? parseFloat(holdTime) : null,
        f0_value: f0,
        cycle_start: formData.cycleStart ? new Date(formData.cycleStart).toISOString() : null,
        cycle_end: formData.cycleEnd ? new Date(formData.cycleEnd).toISOString() : null,
        autoclave_tape: formData.tape, pass_fail: formData.passFail,
        bi_used: formData.biUsed,
        bi_result: formData.biUsed ? formData.biResult : 'Not Used',
        bi_incubation_date: formData.biUsed && formData.biIncDate ? formData.biIncDate : null,
        capa_deviation_id: devId || null,
        steam_quality_check:  formData.steamQuality || null,
        condensate_check:     formData.condensateCheck || null,
        load_description:     formData.loadDesc || null,
        load_total_volume_ml: formData.loadTotalVol ? parseFloat(formData.loadTotalVol) : null,
        flask_sizes:          formData.flaskSizes.trim() ? formData.flaskSizes.split(',').map(s=>s.trim()).filter(Boolean) : [],
        cooling_time_min: formData.coolingMin ? parseFloat(formData.coolingMin) : null,
        cycle2_temp_c:   formData.showCycle2 && formData.cycle2Temp  ? parseFloat(formData.cycle2Temp)  : null,
        cycle2_hold_min: formData.showCycle2 && formData.cycle2Hold  ? parseFloat(formData.cycle2Hold)  : null,
        cycle2_start:    formData.showCycle2 && formData.cycle2Start ? new Date(formData.cycle2Start).toISOString() : null,
        cycle2_end:      formData.showCycle2 && formData.cycle2End   ? new Date(formData.cycle2End).toISOString()   : null,
        cycle2_tape:     formData.showCycle2 ? formData.cycle2Tape   : null,
        operator_id: employeeProfile?.id, notes: formData.notes || null,
      }, { onConflict: 'batch_id' });
      if (error) throw error;

      if (formData.equipId) {
        supabase.from('calibration_logs').insert({
          equipment_id: formData.equipId,
          calibration_date: new Date().toISOString().slice(0, 10),
          result: `Used in batch ${batch.batch_id}`,
          status: 'Operational',
          logged_by: employeeProfile?.id || null,
        }).then(() => {}).catch(() => {});
      }

      toast.success(advance ? 'Sterilisation complete.' : 'Draft saved.');
      syncStageToLNB(supabase, batch.id, 'sterilisation', {
        method: formData.method,
        equipment: equipment.find(e => e.id === formData.equipId)?.name || null,
        cycle_temp_c: formData.temp ? parseFloat(formData.temp) : null,
        cycle_pressure_bar: formData.pressure ? parseFloat(formData.pressure) : null,
        hold_time_min: holdTime ? parseFloat(holdTime) : null,
        f0_value: f0,
        autoclave_tape: formData.tape,
        pass_fail: formData.passFail,
        bi_result: formData.biUsed ? formData.biResult : 'Not Used',
      });
      if (advance) {
        await onAdvanceStage('inoculation');
      } else {
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-slate-600"/>
        <div><h2 className="text-base font-bold text-slate-900">Sterilisation</h2>
          <p className="text-xs text-slate-500">CCP — autoclave/pressure cooker record. Pass required to proceed.</p></div>
        <span className={`ml-auto px-2 py-1 text-xs font-black rounded-lg border uppercase ${watchPassFail==='Pass'?'bg-emerald-50 text-emerald-700 border-emerald-200':watchPassFail==='Fail'?'bg-red-50 text-red-700 border-red-200':'bg-slate-100 text-slate-500 border-slate-200'}`}>{watchPassFail}</span>
      </div>

      {watchPassFail === 'Fail' && (
        <div className="card p-4 border-red-300 bg-red-50 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5"/>
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">Sterilisation Failed — Advance Blocked</p>
            <p className="text-xs text-red-700 mt-0.5">
              {capaDevId
                ? <>CAPA deviation raised. <a href="/compliance" className="underline font-bold">Review in Compliance →</a></>
                : 'Save to auto-raise a CAPA deviation record, then investigate before proceeding.'}
            </p>
          </div>
        </div>
      )}

      <div className="card p-5 space-y-4">
        {/* Method */}
        <div>
          <label className="field-label">Method</label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(m=>(
              <button key={m} type="button" onClick={()=>setValue('method', m)}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${watchMethod===m?'bg-navy text-white border-navy':'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Equipment */}
        <div>
          <label className="field-label">Equipment Used</label>
          <select {...register('equipId')} className={`field-input bg-white ${isEquipBad?'border-red-300':''}`}>
            <option value="">Select equipment...</option>
            {equipment.map(e=>(
              <option key={e.id} value={e.id}>{e.name} — {e.status}{(e.requires_calibration !== false && e.calibration_due_date && e.calibration_due_date < new Date().toLocaleDateString('en-CA'))?' ⚠ CALIB EXPIRED':''}</option>
            ))}
          </select>
          {isEquipBad && <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Equipment non-compliant — check Equipment module before proceeding.</p>}
        </div>

        {/* Cycle params */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="field-label">Cycle Temp (°C) ★ CCP</label><input type="number" step="0.1" {...register('temp')} className="field-input" placeholder="121.0"/></div>
          <div><label className="field-label">Cycle Pressure</label><input {...register('pressure')} className="field-input" placeholder="15 psi / 1 bar"/></div>
          <div>
            <label className="field-label">Cycle Start Time</label>
            <input type="datetime-local" {...register('cycleStart')} className="field-input"/>
          </div>
          <div>
            <label className="field-label">Cycle End Time</label>
            <input type="datetime-local" {...register('cycleEnd')} className="field-input"/>
          </div>
        </div>
        {holdTime && <p className="text-xs text-navy font-bold">Hold time: {holdTime} min</p>}
        {!watchCycleStart && <div><label className="field-label">Hold Time (min) ★ CCP</label><input type="number" {...register('holdMin')} className="field-input" placeholder="15"/></div>}

        {/* G-02: F₀ display */}
        {f0 !== null && (
          <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${f0 >= 12 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <FlaskConical className="w-4 h-4 shrink-0"/>
            <span>F₀ (calculated lethality): <span className="font-black">{f0} min</span></span>
            {f0 < 12 && <span className="ml-1 text-amber-700">⚠ Below recommended F₀ ≥12 for sterilisation validation</span>}
            {f0 >= 12 && <span className="text-emerald-700">✓ Meets F₀ ≥12 lethality target</span>}
          </div>
        )}

        {/* Autoclave tape */}
        <div>
          <label className="field-label">Autoclave Tape Result</label>
          <div className="flex gap-2">
            {TAPE_RES.map(o=>(
              <button key={o} type="button" onClick={()=>setValue('tape', o)}
                className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${watchTape===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200 hover:border-navy'}`}>
                {o === 'Positive' ? '✓ Positive (colour change)' : '✗ Negative (no change)'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">Positive = colour change confirmed = sterilisation indicator passed</p>
        </div>

        {/* G-01: Biological Indicator */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('biUsed')} className="w-4 h-4 rounded border-slate-300"/>
              <span className="text-xs font-black text-slate-900">Biological Indicator (BI) used in this cycle</span>
            </label>
            <span className="text-xs text-slate-500 font-semibold ml-1">Geobacillus stearothermophilus spore strip</span>
          </div>
          {watchBiUsed && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label text-slate-800">BI Result</label>
                <div className="flex gap-2">
                  {BI_RESULTS.map(o=>(
                    <button key={o} type="button" onClick={()=>setValue('biResult', o)}
                      className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${watchBiResult===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200 hover:border-navy'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label text-slate-800">BI Strip Incubation Date</label>
                <input type="date" {...register('biIncDate')} className="field-input"/>
                <p className="text-xs text-slate-400 mt-0.5">Incubate at 55–60°C for 48 hrs — record result date</p>
              </div>
            </div>
          )}
          {watchBiUsed && watchBiResult === 'Fail' && (
            <p className="text-xs text-red-700 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5"/>BI Fail — autoclave validation compromised. Do not use sterilised media.
            </p>
          )}
        </div>

        {/* G-84: Steam quality + condensate checks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Steam Quality Check</label>
            <div className="flex gap-2">
              {['Dry saturated','Wet steam','Not checked'].map(o=>(
                <button key={o} type="button" onClick={()=>setValue('steamQuality', watchSteamQuality===o?'':o)}
                  className={`flex-1 py-1.5 text-xs font-black rounded-xl border transition-all ${watchSteamQuality===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">Condensate Check</label>
            <div className="flex gap-2">
              {['Pass','Fail','N/A'].map(o=>(
                <button key={o} type="button" onClick={()=>setValue('condensateCheck', watchCondensateCheck===o?'':o)}
                  className={`flex-1 py-1.5 text-xs font-black rounded-xl border transition-all ${watchCondensateCheck===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200 hover:border-navy'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* G-59: Cooling time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Cooling Time (min) <span className="text-slate-400 text-xs">autoclave end → LAF transfer</span></label>
            <input type="number" step="1" {...register('coolingMin')} className="field-input" placeholder="e.g. 30"/>
          </div>
        </div>

        {/* G-58: Second sterilisation cycle */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button type="button" onClick={()=>setValue('showCycle2', !watchShowCycle2)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-xs font-black text-slate-700 transition-colors">
            <span>Second Sterilisation Cycle (optional)</span>
            <span className={`text-lg ${watchShowCycle2?'text-navy':'text-slate-300'}`}>{watchShowCycle2?'▼':'▶'}</span>
          </button>
          {watchShowCycle2 && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">Cycle 2 Temp (°C)</label><input type="number" step="0.1" {...register('cycle2Temp')} className="field-input" placeholder="121.0"/></div>
                <div><label className="field-label">Cycle 2 Hold (min)</label><input type="number" {...register('cycle2Hold')} className="field-input" placeholder="15"/></div>
                <div><label className="field-label">Cycle 2 Start</label><input type="datetime-local" {...register('cycle2Start')} className="field-input"/></div>
                <div><label className="field-label">Cycle 2 End</label><input type="datetime-local" {...register('cycle2End')} className="field-input"/></div>
              </div>
              <div>
                <label className="field-label">Cycle 2 Tape Result</label>
                <div className="flex gap-2">
                  {TAPE_RES.map(o=>(
                    <button key={o} type="button" onClick={()=>setValue('cycle2Tape', o)}
                      className={`flex-1 py-1.5 text-xs font-black rounded-xl border transition-all ${watchCycle2Tape===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200 hover:border-navy'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pass / Fail — gate */}
        <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
            Overall Result <span className="text-red-500">★ Gate — Fail blocks advance to Inoculation</span>
          </label>
          <div className="flex gap-3">
            {['Pass','Fail','Pending'].map(o=>(
              <button key={o} type="button" onClick={()=>setValue('passFail', o)}
                className={`flex-1 py-3 text-sm font-black rounded-xl border-2 transition-all ${watchPassFail===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200 hover:border-navy'}`}>
                {o}
              </button>
            ))}
          </div>
          {watchPassFail === 'Fail' && !capaDevId && (
            <p className="text-xs text-red-600 font-bold mt-2">Saving will auto-raise a CAPA deviation record.</p>
          )}
        </div>

        {/* A-48: IQ/OQ/PQ validation document linkage */}
        {selectedEquip && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <p className="font-black text-slate-700 uppercase text-xs mb-1">Equipment Validation Status (A-48)</p>
            <div className="flex flex-wrap gap-3">
              {[['IQ','iq_doc_url'],['OQ','oq_doc_url'],['PQ','pq_doc_url']].map(([label, field]) => (
                <span key={label} className={`px-2 py-1 rounded-lg border text-xs font-black ${selectedEquip[field] ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                  {label}: {selectedEquip[field] ? '✓' : 'Missing'}
                  {selectedEquip[field] && <a href={selectedEquip[field]} target="_blank" rel="noreferrer" className="ml-1 underline">View</a>}
                </span>
              ))}
            </div>
            {!selectedEquip.iq_doc_url && !selectedEquip.oq_doc_url && !selectedEquip.pq_doc_url && (
              <p className="text-amber-600 font-bold mt-1">⚠ No IQ/OQ/PQ docs linked — add them in Equipment module</p>
            )}
          </div>
        )}

        {/* A-28: Autoclave load configuration */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-slate-700">Load Configuration <span className="text-slate-400 font-semibold text-xs">(A-28 — affects heat penetration)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Total Load Volume (ml)</label><input type="number" {...register('loadTotalVol')} className="field-input" placeholder="e.g. 750"/></div>
            <div><label className="field-label">Flask Sizes (comma-separated)</label><input {...register('flaskSizes')} className="field-input" placeholder="e.g. 250ml, 500ml, 100ml"/></div>
          </div>
          <div><label className="field-label">Load Description</label><input {...register('loadDesc')} className="field-input" placeholder="e.g. 3 × 250ml media + 2 × 500ml broth in stainless rack"/></div>
        </div>

        <textarea {...register('notes')} rows={2} placeholder="Notes (cycle observations, deviations)..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={handleSubmit((data) => onSubmit(data, false))} disabled={saving||raisingCapa} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : raisingCapa ? 'Raising CAPA...' : 'Save Draft'}
          </button>
          <button onClick={handleSubmit((data) => onSubmit(data, true))} disabled={saving||actionLoading||watchPassFail!=='Pass'} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            {watchPassFail==='Pass'?'Complete → Inoculation':'🔒 Advance Blocked (Fail)'}
          </button>
        </div>
      </div>
    </div>
  );
}
