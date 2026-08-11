'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { useData } from '@/lib/hooks/useData';
import { Beaker, CheckCircle2, AlertTriangle, Wrench } from 'lucide-react';

const CLARITY_OPTS = ['Very clear, transparent', 'Slightly cloudy', 'Moderately turbid', 'Highly turbid / opaque'];

function CalibrationBadge({ equipment }) {
  if (!equipment) return null;
  const due = equipment.requires_calibration !== false && equipment.calibration_due_date ? new Date(equipment.calibration_due_date) : null;
  const today = new Date();
  const daysLeft = due ? Math.ceil((due - today) / 86400000) : null;
  if (!due)          return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">No Cal. Data</span>;
  if (daysLeft < 0)  return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5"/>OVERDUE</span>;
  if (daysLeft <= 30) return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Due in {daysLeft}d</span>;
  return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Cal. OK</span>;
}

function EquipmentPicker({ label, value, onChange, equipment, placeholder }) {
  const selected = equipment.find(e => e.id === value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="field-label mb-0">{label}</label>
        {selected && <CalibrationBadge equipment={selected}/>}
      </div>
      <select value={value} onChange={e => onChange(e.target.value)} className="field-input bg-white text-xs">
        <option value="">{placeholder}</option>
        {equipment.map(e => (
          <option key={e.id} value={e.id}>{e.name}{e.model ? ` (${e.model})` : ''}</option>
        ))}
      </select>
      {selected?.requires_calibration !== false && selected?.calibration_due_date && selected.calibration_due_date < new Date().toLocaleDateString('en-CA') && (
        <p className="text-xs text-red-600 font-bold flex items-center gap-1 mt-1">
          <AlertTriangle className="w-3 h-3"/>Calibration overdue — raise a deviation before use.
        </p>
      )}
    </div>
  );
}

export default function SeparationPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [record,     setRecord]     = useState(null);
  const [saving,     setSaving]     = useState(false);
  
  const { data: equipmentData } = useData({
    table: 'equipment',
    select: 'id, name, model, status, requires_calibration, calibration_due_date',
    order: { column: 'name' }
  });
  const equipment = equipmentData || [];

  const form = useForm({
    defaultValues: {
      rpm: '', centTemp: '', duration: '',
      centEqId: '', phEqId: '', scaleEqId: '',
      brothBefore: '', supernAfter: '', pelletWt: '',
      colour: 'Reddish-slate', clarity: 'Opaque/turbid', ph: '', notes: '', supervisedBy: '',
      rotorRadius: '', showPass2: false, pass2Rpm: '', pass2Duration: '', pass2Temp: '',
      method: 'Centrifugation', turbidityNtu: '', volAfterMl: '',
      resuspBuffer: '', resuspVol: '', holdTimeBefore: '',
      washSteps: '', washBuffer: '', washVolMl: '', postCentVia: '', postCentViaMethod: ''
    }
  });
  const { register, handleSubmit, reset, watch, setValue, getValues } = form;

  const method = watch('method');
  const showPass2 = watch('showPass2');
  const supervisedBy = watch('supervisedBy');
  const brothBefore = watch('brothBefore');
  const supernAfter = watch('supernAfter');


  const isIntern = ['intern','research_intern'].includes(role);

  // Centrifuge parameters
  // Equipment links
  // Weight measurements
  // Supernatant quality
  // G-65: rotor radius for RCF
  // G-66: second pass
  // G-67: method selection (default Centrifugation but allow Filtration)
  // G-68: turbidity NTU
  // G-69: volume after (already in DB as post_straining_vol_ml)
  // G-70: pellet resuspension
  // A-53: hold time before centrifuge
  // A-29: cell wash step
  // A-30: post-centrifuge viability

  const fetchRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let isCurrent = true;
    let data;
    try {
      ({ data } = await withTimeout(
        supabase.from('batch_flask_straining').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
        45000, 
        'Straining data load timed out'
      ));
    } catch (err) {
      console.error('StrainingPanel fetch error:', err);
      return;
    }
    if (!isCurrent) return;
    if (data) {
      setRecord(data);
      setRpm(data.centrifuge_rpm ?? '');
      setCentTemp(data.centrifuge_temp_c ?? '');
      setDuration(data.centrifuge_duration_min ?? '');
      setCentEqId(data.centrifuge_equipment_id || '');
      setPhEqId(data.ph_meter_equipment_id || '');
      setScaleEqId(data.scale_equipment_id || '');
      setBrothBefore(data.broth_wt_before_g ?? '');
      setSupernAfter(data.supernatant_wt_after_g ?? '');
      setPelletWt(data.pellet_wt_g ?? '');
      setColour(data.filtrate_colour || 'Reddish-slate');
      setClarity(data.filtrate_clarity || CLARITY_OPTS[0]);
      setPh(data.filtrate_ph ?? '');
      setNotes(data.notes || '');
      setSupervisedBy(data.supervised_by || '');
      setRotorRadius(data.rotor_radius_cm||'');
      setMethod(data.method||'Centrifugation');
      setTurbidityNtu(data.turbidity_ntu||'');
      setVolAfterMl(data.post_straining_vol_ml||'');
      setResuspBuffer(data.pellet_resuspension_buffer||'');
      setResuspVol(data.pellet_resuspension_vol_ml||'');
      setHoldTimeBefore(data.hold_time_before_centrifuge_min||'');
      setWashSteps(data.wash_steps||'');
      setWashBuffer(data.wash_buffer||'');
      setWashVolMl(data.wash_volume_ml||'');
      setPostCentVia(data.post_centrifuge_viability_pct||'');
      setPostCentViaMethod(data.viability_method||'');
      if (data.pass2_rpm) { setShowPass2(true); setPass2Rpm(data.pass2_rpm||''); setPass2Duration(data.pass2_duration_min||''); setPass2Temp(data.pass2_temp_c||''); }
    } else { setRecord(null); }
    return () => { isCurrent = false; };
  }, [activeFlask?.id, supabase]);

  useEffect(() => { setRecord(null); fetchRecord(); }, [fetchRecord]);

  const recoveryPct = brothBefore && supernAfter
    ? ((parseFloat(supernAfter) / parseFloat(brothBefore)) * 100).toFixed(1)
    : null;

  const handleSave = async (advance = false) => {
    const data = getValues();
    const { rpm, duration, centTemp, centEqId, phEqId, scaleEqId, pelletWt, colour, clarity, ph, notes, rotorRadius, pass2Rpm, pass2Duration, pass2Temp, turbidityNtu, volAfterMl, resuspBuffer, resuspVol, holdTimeBefore, washSteps, washBuffer, washVolMl, postCentVia, postCentViaMethod } = data;
    if (!activeFlask) return;
    if (setGlobalError) setGlobalError(null);
    if (advance) {
      const missing = [];
      if (!rpm) missing.push(method === 'Centrifugation' ? 'Speed (RPM)' : 'Pressure / Flow');
      if (!duration) missing.push('Duration (min)');
      if (!brothBefore) missing.push('Total Broth Before (g)');
      if (!supernAfter) missing.push('Supernatant / Filtrate After (g)');
      if (!ph) missing.push('pH');
      
      if (missing.length > 0) {
        if (setGlobalError) setGlobalError(`Cannot advance to Extract Addition. Missing mandatory details: ${missing.join(', ')}.`);
        toast.warn(`Cannot advance to Extract Addition. Missing mandatory details: ${missing.join(', ')}.`);
        return;
      }
    }
    if (isIntern && advance && !supervisedBy) { 
      if (setGlobalError) setGlobalError('Select a supervisor before advancing.'); 
      toast.warn('Select a supervisor before advancing.'); 
      return; 
    }

    const checkEquip = (id) => {
      const e = equipment.find(eq => eq.id === id);
      return e && e.requires_calibration !== false && e.calibration_due_date && e.calibration_due_date < new Date().toLocaleDateString('en-CA');
    };
    if (checkEquip(centEqId) || checkEquip(phEqId) || checkEquip(scaleEqId)) {
      if (setGlobalError) setGlobalError('Cannot save — One or more selected equipment items have expired calibration.');
      toast.error('Cannot save — One or more selected equipment items have expired calibration.');
      return;
    }

    setSaving(true);
    try {
      // G-65: RCF = 1.118 × r × (RPM/1000)²
      const rcf = rotorRadius && rpm
        ? parseFloat((1.118 * parseFloat(rotorRadius) * Math.pow(parseFloat(rpm)/1000, 2)).toFixed(0))
        : null;

      const payload = {
        flask_id: activeFlask.id, batch_id: batch.id,
        method,  // G-67: method now selectable
        centrifuge_rpm:            rpm       ? parseFloat(rpm)      : null,
        centrifuge_temp_c:         centTemp  ? parseFloat(centTemp) : null,
        centrifuge_duration_min:   duration  ? parseFloat(duration) : null,
        centrifuge_equipment_id:   centEqId  || null,
        ph_meter_equipment_id:     phEqId    || null,
        scale_equipment_id:        scaleEqId || null,
        broth_wt_before_g:         brothBefore ? parseFloat(brothBefore) : null,
        supernatant_wt_after_g:    supernAfter ? parseFloat(supernAfter) : null,
        pellet_wt_g:               pelletWt    ? parseFloat(pelletWt)    : null,
        recovery_pct:              recoveryPct ? parseFloat(recoveryPct) : null,
        filtrate_colour:  colour,
        filtrate_clarity: clarity,
        filtrate_ph:      ph ? parseFloat(ph) : null,
        notes,
        operator_id:   employeeProfile?.id,
        supervised_by: supervisedBy || null,
        rotor_radius_cm:             rotorRadius  ? parseFloat(rotorRadius)  : null,
        turbidity_ntu:               turbidityNtu ? parseFloat(turbidityNtu) : null,
        post_straining_vol_ml:       volAfterMl   ? parseFloat(volAfterMl)   : null,
        pellet_resuspension_buffer:  resuspBuffer  || null,
        pellet_resuspension_vol_ml:  resuspVol    ? parseFloat(resuspVol)    : null,
        hold_time_before_centrifuge_min: holdTimeBefore ? parseFloat(holdTimeBefore) : null,
        wash_steps:               washSteps ? parseInt(washSteps) : null,
        wash_buffer:              washBuffer || null,
        wash_volume_ml:           washVolMl ? parseFloat(washVolMl) : null,
        post_centrifuge_viability_pct: postCentVia ? parseFloat(postCentVia) : null,
        viability_method:         postCentViaMethod || null,
        pass2_rpm:                   showPass2 && pass2Rpm      ? parseFloat(pass2Rpm)      : null,
        pass2_duration_min:          showPass2 && pass2Duration ? parseFloat(pass2Duration) : null,
        pass2_temp_c:                showPass2 && pass2Temp     ? parseFloat(pass2Temp)     : null,
      };

      const { error } = await withTimeout(
        supabase.from('batch_flask_straining').upsert(payload, { onConflict: 'flask_id' }),
        15000,
        'Database save timed out. Please try again.'
      );
      if (error) throw error;

      toast.success(advance ? `Trial ${activeFlask.flask_label} Centrifugation complete.` : 'Draft saved.');
      if (advance && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage('extract_addition');
      } else {
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { 
      if (setGlobalError) setGlobalError(err.message);
      toast.error(err.message); 
    }
    finally { setSaving(false); }
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Centrifugation.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 border-l-4 border-l-amber-500">
        <div className="flex items-center gap-2 mb-1">
          <Beaker className="w-5 h-5 text-amber-600"/>
          <h2 className="text-base font-bold text-slate-900">Centrifugation: <span className="text-amber-600">{activeFlask.flask_label}</span></h2>
        </div>
        <p className="text-xs text-slate-500">Log centrifuge run parameters and mass-balance recovery for this trial.</p>
        {record && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600"/>
            <span className="text-xs font-bold text-emerald-800">
              Record saved. Recovery: {record.recovery_pct ?? '—'}%
              {record.pellet_wt_g != null && <> · Pellet: {record.pellet_wt_g} g</>}
            </span>
          </div>
        )}
      </div>

      {/* Equipment Traceability */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Wrench className="w-3 h-3"/>Equipment Used
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <EquipmentPicker label="Centrifuge" value={centEqId} onChange={setCentEqId} equipment={equipment} placeholder="Select centrifuge…"/>
          <EquipmentPicker label="pH Meter" value={phEqId} onChange={setPhEqId} equipment={equipment} placeholder="Select pH meter…"/>
          <EquipmentPicker label="Weighing Scale" value={scaleEqId} onChange={setScaleEqId} equipment={equipment} placeholder="Select scale…"/>
        </div>
      </div>

      {/* G-67: Method selection */}
      <div className="card p-5 space-y-3">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Separation Method</p>
        <div className="flex gap-2 flex-wrap">
          {['Centrifugation','Membrane Filtration','Gravity Filtration','Depth Filtration'].map(m=>(
            <button key={m} type="button" onClick={()=>setMethod(m)}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${method===m?'bg-amber-600 text-white border-amber-600':'bg-white text-slate-600 border-slate-200 hover:border-amber-300'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Centrifuge Run Parameters */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
          {method === 'Centrifugation' ? 'Centrifuge Run Parameters' : 'Filtration Parameters'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="field-label">{method==='Centrifugation' ? 'Speed (RPM) *' : 'Pressure / Flow'}</label>
            <input type="number" {...register('rpm')} className="field-input" placeholder="e.g. 4000"/>
          </div>
          <div>
            <label className="field-label">Temperature (°C)</label>
            <input type="number" step="0.1" {...register('centTemp')} className="field-input" placeholder="e.g. 4"/>
          </div>
          <div>
            <label className="field-label">Duration (min) *</label>
            <input type="number" {...register('duration')} className="field-input" placeholder="e.g. 15"/>
          </div>
          {/* G-65: Rotor radius for RCF */}
          {method==='Centrifugation' && (
            <div>
              <label className="field-label">Rotor Radius (cm)</label>
              <input type="number" step="0.1" {...register('rotorRadius')} className="field-input" placeholder="e.g. 10.5"/>
            </div>
          )}
        </div>
        {/* G-65: RCF auto-display */}
        {method==='Centrifugation' && rotorRadius && rpm && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
            RCF (Relative Centrifugal Force): <span className="font-black text-amber-900">
              {Math.round(1.118 * parseFloat(rotorRadius) * Math.pow(parseFloat(rpm)/1000, 2))} × g
            </span>
            <span className="ml-2 text-amber-500 font-normal text-xs">= 1.118 × r × (RPM/1000)²</span>
          </div>
        )}
        {/* G-66: Second pass */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button type="button" onClick={()=>setShowPass2(p=>!p)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-xs font-black text-slate-700 transition-colors">
            <span>Second Centrifuge Pass (optional)</span>
            <span className={`text-lg ${showPass2?'text-amber-600':'text-slate-300'}`}>{showPass2?'▼':'▶'}</span>
          </button>
          {showPass2 && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="field-label">Pass 2 RPM</label><input type="number" {...register('pass2Rpm')} className="field-input" placeholder="e.g. 6000"/></div>
              <div><label className="field-label">Pass 2 Duration (min)</label><input type="number" {...register('pass2Duration')} className="field-input" placeholder="e.g. 10"/></div>
              <div><label className="field-label">Pass 2 Temp (°C)</label><input type="number" step="0.1" {...register('pass2Temp')} className="field-input" placeholder="e.g. 4"/></div>
            </div>
          )}
        </div>
      </div>

      {/* Mass Balance */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Mass Balance (g)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="field-label">Total Broth Before (g) *</label>
            <input type="number" step="0.01" {...register('brothBefore')} className="field-input" placeholder="e.g. 480"/>
          </div>
          <div>
            <label className="field-label">Supernatant After (g) *</label>
            <input type="number" step="0.01" {...register('supernAfter')} className="field-input" placeholder="e.g. 420"/>
          </div>
          <div>
            <label className="field-label">Pellet After (g)</label>
            <input type="number" step="0.01" {...register('pelletWt')} className="field-input" placeholder="e.g. 55"/>
          </div>
        </div>
        {recoveryPct && (
          <div className="flex gap-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
            <span>Supernatant Recovery: <span className="text-lg font-black">{recoveryPct}%</span></span>
            {brothBefore && pelletWt && supernAfter && (
              <span className="ml-4 text-slate-500 font-semibold">
                Mass check: {(parseFloat(supernAfter) + parseFloat(pelletWt)).toFixed(1)} g recovered of {parseFloat(brothBefore).toFixed(1)} g input
              </span>
            )}
          </div>
        )}
      </div>

      {/* Supernatant Quality + Volume */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Supernatant / Filtrate Quality</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="field-label">Colour</label>
            <input {...register('colour')} className="field-input" placeholder="Reddish-slate"/>
          </div>
          <div>
            <label className="field-label">Clarity</label>
            <select {...register('clarity')} className="field-input bg-white text-xs">
              {CLARITY_OPTS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">pH *</label>
            <input type="number" step="0.01" {...register('ph')} className="field-input" placeholder="4.35"/>
          </div>
          {/* G-68: Turbidity NTU */}
          <div>
            <label className="field-label">Turbidity (NTU)</label>
            <input type="number" step="0.1" {...register('turbidityNtu')} className="field-input" placeholder="e.g. 5.2"/>
            <p className="text-xs text-slate-400 mt-0.5">Objective clarity measurement</p>
          </div>
        </div>
        {/* G-69: Volume after */}
        <div>
          <label className="field-label">Volume After Separation (ml)</label>
          <input type="number" step="0.1" {...register('volAfterMl')} className="field-input" placeholder="e.g. 400"/>
          <p className="text-xs text-slate-400 mt-0.5">Measurable volume of clarified supernatant/filtrate</p>
        </div>
        {/* A-53: Hold time before centrifuge */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <label className="block text-xs font-black text-slate-900 mb-1">Hold Time Before Centrifuge (min) <span className="text-slate-400 text-xs">(A-53 — time between fermentation end and centrifuge start)</span></label>
          <input type="number" step="1" {...register('holdTimeBefore')} className="field-input" placeholder="e.g. 30"/>
          {holdTimeBefore && parseFloat(holdTimeBefore) > 120 && <p className="text-xs text-amber-700 font-bold mt-1">⚠ Hold &gt;2h at room temp — risk of culture quality degradation</p>}
        </div>

        {/* A-29: Cell wash step */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-slate-900">Cell Wash Steps <span className="text-slate-400 text-xs">(A-29)</span></p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="field-label">Number of Washes</label><input type="number" min="0" max="5" {...register('washSteps')} className="field-input" placeholder="0"/></div>
            <div><label className="field-label">Wash Buffer</label><input {...register('washBuffer')} className="field-input" placeholder="e.g. 0.9% saline"/></div>
            <div><label className="field-label">Wash Volume (ml)</label><input type="number" step="0.1" {...register('washVolMl')} className="field-input" placeholder="e.g. 50"/></div>
          </div>
        </div>

        {/* A-30: Post-centrifuge viability */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-slate-900">Post-Centrifuge Cell Viability <span className="text-slate-400 text-xs">(A-30)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label text-slate-800">Viability (%)</label><input type="number" step="0.1" min="0" max="100" {...register('postCentVia')} className="field-input" placeholder="e.g. 85"/></div>
            <div><label className="field-label text-slate-800">Method</label>
              <select {...register('postCentViaMethod')} className="field-input bg-white text-xs">
                {['','Methylene Blue','Live/Dead stain','Plate count','Flow Cytometry'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* G-70: Pellet resuspension */}
        {pelletWt && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase">Pellet Resuspension (if applicable)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="field-label">Resuspension Buffer</label>
                <input {...register('resuspBuffer')} className="field-input" placeholder="e.g. PBS, distilled water, media"/>
              </div>
              <div><label className="field-label">Resuspension Volume (ml)</label>
                <input type="number" step="0.1" {...register('resuspVol')} className="field-input" placeholder="e.g. 50"/>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Supervisor + Notes */}
      <div className="card p-5 space-y-4">
        {isIntern && (
          <div>
            <label className="field-label text-red-500">Supervised By (Required for Juniors)</label>
            <select {...register('supervisedBy')} className="field-input bg-white border-red-200">
              <option value="">Select supervisor...</option>
              {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="field-label">Notes</label>
          <input {...register('notes')} className="field-input" placeholder="Observed losses, equipment issues, deviations..."/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : record ? 'Update Draft' : 'Save Draft'}
          </button>
          <div className="relative">
            <button onClick={()=>handleSave(true)} disabled={saving||actionLoading} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
              Advance Trial → Extract Addition
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
