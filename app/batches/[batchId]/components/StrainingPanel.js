'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Beaker, CheckCircle2, AlertTriangle, Wrench } from 'lucide-react';

const CLARITY_OPTS = ['Very clear, transparent', 'Slightly cloudy', 'Moderately turbid', 'Highly turbid / opaque'];

function CalibrationBadge({ equipment }) {
  if (!equipment) return null;
  const due = equipment.calibration_due_date ? new Date(equipment.calibration_due_date) : null;
  const today = new Date();
  const daysLeft = due ? Math.ceil((due - today) / 86400000) : null;
  if (!due)          return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">No Cal. Data</span>;
  if (daysLeft < 0)  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5"/>OVERDUE</span>;
  if (daysLeft <= 30) return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Due in {daysLeft}d</span>;
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Cal. OK</span>;
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
      {selected?.calibration_due_date && new Date(selected.calibration_due_date) < new Date() && (
        <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3"/>Calibration overdue — raise a deviation before use.
        </p>
      )}
    </div>
  );
}

export default function StrainingPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [record,     setRecord]     = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [equipment,  setEquipment]  = useState([]);
  const isIntern = ['intern','research_intern'].includes(role);

  // Centrifuge parameters
  const [rpm,           setRpm]           = useState('');
  const [centTemp,      setCentTemp]      = useState('');
  const [duration,      setDuration]      = useState('');
  // Equipment links
  const [centEqId,      setCentEqId]      = useState('');
  const [phEqId,        setPhEqId]        = useState('');
  const [scaleEqId,     setScaleEqId]     = useState('');
  // Weight measurements
  const [brothBefore,   setBrothBefore]   = useState('');
  const [supernAfter,   setSupernAfter]   = useState('');
  const [pelletWt,      setPelletWt]      = useState('');
  // Supernatant quality
  const [colour,        setColour]        = useState('Reddish-purple');
  const [clarity,       setClarity]       = useState(CLARITY_OPTS[0]);
  const [ph,            setPh]            = useState('');
  const [notes,         setNotes]         = useState('');
  const [supervisedBy,  setSupervisedBy]  = useState('');
  // G-65: rotor radius for RCF
  const [rotorRadius,    setRotorRadius]    = useState('');
  // G-66: second pass
  const [showPass2,      setShowPass2]      = useState(false);
  const [pass2Rpm,       setPass2Rpm]       = useState('');
  const [pass2Duration,  setPass2Duration]  = useState('');
  const [pass2Temp,      setPass2Temp]      = useState('');
  // G-67: method selection (default Centrifugation but allow Filtration)
  const [method,         setMethod]         = useState('Centrifugation');
  // G-68: turbidity NTU
  const [turbidityNtu,   setTurbidityNtu]   = useState('');
  // G-69: volume after (already in DB as post_straining_vol_ml)
  const [volAfterMl,     setVolAfterMl]     = useState('');
  // G-70: pellet resuspension
  const [resuspBuffer,   setResuspBuffer]   = useState('');
  const [resuspVol,      setResuspVol]      = useState('');
  // A-53: hold time before centrifuge
  const [holdTimeBefore, setHoldTimeBefore] = useState('');
  // A-29: cell wash step
  const [washSteps,      setWashSteps]      = useState('');
  const [washBuffer,     setWashBuffer]     = useState('');
  const [washVolMl,      setWashVolMl]      = useState('');
  // A-30: post-centrifuge viability
  const [postCentVia,    setPostCentVia]    = useState('');
  const [postCentViaMethod, setPostCentViaMethod] = useState('');

  const fetchRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let isCurrent = true;
    const [{ data }, { data: eqData }] = await Promise.all([
      supabase.from('batch_flask_straining').select('*').eq('flask_id', activeFlask.id).single(),
      supabase.from('equipment').select('id, name, model, status, calibration_due_date').order('name'),
    ]);
    if (!isCurrent) return;
    if (eqData) setEquipment(eqData);
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
      setColour(data.filtrate_colour || 'Reddish-purple');
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
    if (!activeFlask) return;
    if (advance && (!brothBefore || !supernAfter || !ph || !rpm || !duration)) {
      toast.warn('Please fill all required fields (RPM, duration, weights, pH) to advance.'); return;
    }
    if (isIntern && advance && !supervisedBy) { toast.warn('Select a supervisor before advancing.'); return; }

    const checkEquip = (id) => {
      const e = equipment.find(eq => eq.id === id);
      return e && e.calibration_due_date && new Date(e.calibration_due_date) < new Date();
    };
    if (checkEquip(centEqId) || checkEquip(phEqId) || checkEquip(scaleEqId)) {
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

      const { error } = await supabase.from('batch_flask_straining').upsert(payload, { onConflict: 'flask_id' });
      if (error) throw error;

      toast.success(advance ? `Trial ${activeFlask.flask_label} Centrifugation complete.` : 'Draft saved.');
      if (advance && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage('extract_addition');
      } else {
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Centrifugation.</div>;

  return (
    <div className="space-y-5">
      <div className="surface p-5 border-l-4 border-l-amber-500">
        <div className="flex items-center gap-2 mb-1">
          <Beaker className="w-5 h-5 text-amber-600"/>
          <h2 className="text-base font-bold text-gray-900">Centrifugation: <span className="text-amber-600">{activeFlask.flask_label}</span></h2>
        </div>
        <p className="text-xs text-gray-500">Log centrifuge run parameters and mass-balance recovery for this trial.</p>
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
      <div className="surface p-5 space-y-4">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <Wrench className="w-3 h-3"/>Equipment Used
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <EquipmentPicker label="Centrifuge" value={centEqId} onChange={setCentEqId} equipment={equipment} placeholder="Select centrifuge…"/>
          <EquipmentPicker label="pH Meter" value={phEqId} onChange={setPhEqId} equipment={equipment} placeholder="Select pH meter…"/>
          <EquipmentPicker label="Weighing Scale" value={scaleEqId} onChange={setScaleEqId} equipment={equipment} placeholder="Select scale…"/>
        </div>
      </div>

      {/* G-67: Method selection */}
      <div className="surface p-5 space-y-3">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Separation Method</p>
        <div className="flex gap-2">
          {['Centrifugation','Membrane Filtration','Gravity Filtration','Depth Filtration'].map(m=>(
            <button key={m} type="button" onClick={()=>setMethod(m)}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${method===m?'bg-amber-600 text-white border-amber-600':'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Centrifuge Run Parameters */}
      <div className="surface p-5 space-y-4">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          {method === 'Centrifugation' ? 'Centrifuge Run Parameters' : 'Filtration Parameters'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="field-label">{method==='Centrifugation' ? 'Speed (RPM) *' : 'Pressure / Flow'}</label>
            <input type="number" value={rpm} onChange={e=>setRpm(e.target.value)} className="field-input" placeholder="e.g. 4000"/>
          </div>
          <div>
            <label className="field-label">Temperature (°C)</label>
            <input type="number" step="0.1" value={centTemp} onChange={e=>setCentTemp(e.target.value)} className="field-input" placeholder="e.g. 4"/>
          </div>
          <div>
            <label className="field-label">Duration (min) *</label>
            <input type="number" value={duration} onChange={e=>setDuration(e.target.value)} className="field-input" placeholder="e.g. 15"/>
          </div>
          {/* G-65: Rotor radius for RCF */}
          {method==='Centrifugation' && (
            <div>
              <label className="field-label">Rotor Radius (cm)</label>
              <input type="number" step="0.1" value={rotorRadius} onChange={e=>setRotorRadius(e.target.value)} className="field-input" placeholder="e.g. 10.5"/>
            </div>
          )}
        </div>
        {/* G-65: RCF auto-display */}
        {method==='Centrifugation' && rotorRadius && rpm && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
            RCF (Relative Centrifugal Force): <span className="font-black text-amber-900">
              {Math.round(1.118 * parseFloat(rotorRadius) * Math.pow(parseFloat(rpm)/1000, 2))} × g
            </span>
            <span className="ml-2 text-amber-500 font-normal text-[9px]">= 1.118 × r × (RPM/1000)²</span>
          </div>
        )}
        {/* G-66: Second pass */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button type="button" onClick={()=>setShowPass2(p=>!p)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-xs font-black text-gray-700 transition-colors">
            <span>Second Centrifuge Pass (optional)</span>
            <span className={`text-lg ${showPass2?'text-amber-600':'text-gray-300'}`}>{showPass2?'▼':'▶'}</span>
          </button>
          {showPass2 && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="field-label">Pass 2 RPM</label><input type="number" value={pass2Rpm} onChange={e=>setPass2Rpm(e.target.value)} className="field-input" placeholder="e.g. 6000"/></div>
              <div><label className="field-label">Pass 2 Duration (min)</label><input type="number" value={pass2Duration} onChange={e=>setPass2Duration(e.target.value)} className="field-input" placeholder="e.g. 10"/></div>
              <div><label className="field-label">Pass 2 Temp (°C)</label><input type="number" step="0.1" value={pass2Temp} onChange={e=>setPass2Temp(e.target.value)} className="field-input" placeholder="e.g. 4"/></div>
            </div>
          )}
        </div>
      </div>

      {/* Mass Balance */}
      <div className="surface p-5 space-y-4">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mass Balance (g)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="field-label">Total Broth Before (g) *</label>
            <input type="number" step="0.01" value={brothBefore} onChange={e=>setBrothBefore(e.target.value)} className="field-input" placeholder="e.g. 480"/>
          </div>
          <div>
            <label className="field-label">Supernatant After (g) *</label>
            <input type="number" step="0.01" value={supernAfter} onChange={e=>setSupernAfter(e.target.value)} className="field-input" placeholder="e.g. 420"/>
          </div>
          <div>
            <label className="field-label">Pellet After (g)</label>
            <input type="number" step="0.01" value={pelletWt} onChange={e=>setPelletWt(e.target.value)} className="field-input" placeholder="e.g. 55"/>
          </div>
        </div>
        {recoveryPct && (
          <div className="flex gap-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
            <span>Supernatant Recovery: <span className="text-lg font-black">{recoveryPct}%</span></span>
            {brothBefore && pelletWt && supernAfter && (
              <span className="ml-4 text-gray-500 font-semibold">
                Mass check: {(parseFloat(supernAfter) + parseFloat(pelletWt)).toFixed(1)} g recovered of {parseFloat(brothBefore).toFixed(1)} g input
              </span>
            )}
          </div>
        )}
      </div>

      {/* Supernatant Quality + Volume */}
      <div className="surface p-5 space-y-4">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Supernatant / Filtrate Quality</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="field-label">Colour</label>
            <input value={colour} onChange={e=>setColour(e.target.value)} className="field-input" placeholder="Reddish-purple"/>
          </div>
          <div>
            <label className="field-label">Clarity</label>
            <select value={clarity} onChange={e=>setClarity(e.target.value)} className="field-input bg-white text-xs">
              {CLARITY_OPTS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">pH *</label>
            <input type="number" step="0.01" value={ph} onChange={e=>setPh(e.target.value)} className="field-input" placeholder="4.35"/>
          </div>
          {/* G-68: Turbidity NTU */}
          <div>
            <label className="field-label">Turbidity (NTU)</label>
            <input type="number" step="0.1" value={turbidityNtu} onChange={e=>setTurbidityNtu(e.target.value)} className="field-input" placeholder="e.g. 5.2"/>
            <p className="text-[9px] text-gray-400 mt-0.5">Objective clarity measurement</p>
          </div>
        </div>
        {/* G-69: Volume after */}
        <div>
          <label className="field-label">Volume After Separation (ml)</label>
          <input type="number" step="0.1" value={volAfterMl} onChange={e=>setVolAfterMl(e.target.value)} className="field-input" placeholder="e.g. 400"/>
          <p className="text-[9px] text-gray-400 mt-0.5">Measurable volume of clarified supernatant/filtrate</p>
        </div>
        {/* A-53: Hold time before centrifuge */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <label className="block text-xs font-black text-blue-900 mb-1">Hold Time Before Centrifuge (min) <span className="text-blue-400 text-[10px]">(A-53 — time between fermentation end and centrifuge start)</span></label>
          <input type="number" step="1" value={holdTimeBefore} onChange={e=>setHoldTimeBefore(e.target.value)} className="field-input" placeholder="e.g. 30"/>
          {holdTimeBefore && parseFloat(holdTimeBefore) > 120 && <p className="text-[10px] text-amber-700 font-bold mt-1">⚠ Hold &gt;2h at room temp — risk of culture quality degradation</p>}
        </div>

        {/* A-29: Cell wash step */}
        <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-violet-900">Cell Wash Steps <span className="text-violet-400 text-[10px]">(A-29)</span></p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="field-label">Number of Washes</label><input type="number" min="0" max="5" value={washSteps} onChange={e=>setWashSteps(e.target.value)} className="field-input" placeholder="0"/></div>
            <div><label className="field-label">Wash Buffer</label><input value={washBuffer} onChange={e=>setWashBuffer(e.target.value)} className="field-input" placeholder="e.g. 0.9% saline"/></div>
            <div><label className="field-label">Wash Volume (ml)</label><input type="number" step="0.1" value={washVolMl} onChange={e=>setWashVolMl(e.target.value)} className="field-input" placeholder="e.g. 50"/></div>
          </div>
        </div>

        {/* A-30: Post-centrifuge viability */}
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-indigo-900">Post-Centrifuge Cell Viability <span className="text-indigo-400 text-[10px]">(A-30)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label text-indigo-800">Viability (%)</label><input type="number" step="0.1" min="0" max="100" value={postCentVia} onChange={e=>setPostCentVia(e.target.value)} className="field-input" placeholder="e.g. 85"/></div>
            <div><label className="field-label text-indigo-800">Method</label>
              <select value={postCentViaMethod} onChange={e=>setPostCentViaMethod(e.target.value)} className="field-input bg-white text-xs">
                {['','Methylene Blue','Live/Dead stain','Plate count','Flow Cytometry'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* G-70: Pellet resuspension */}
        {pelletWt && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase">Pellet Resuspension (if applicable)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="field-label">Resuspension Buffer</label>
                <input value={resuspBuffer} onChange={e=>setResuspBuffer(e.target.value)} className="field-input" placeholder="e.g. PBS, distilled water, media"/>
              </div>
              <div><label className="field-label">Resuspension Volume (ml)</label>
                <input type="number" step="0.1" value={resuspVol} onChange={e=>setResuspVol(e.target.value)} className="field-input" placeholder="e.g. 50"/>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Supervisor + Notes */}
      <div className="surface p-5 space-y-4">
        {isIntern && (
          <div>
            <label className="field-label text-red-500">Supervised By (Required for Juniors)</label>
            <select value={supervisedBy} onChange={e=>setSupervisedBy(e.target.value)} className="field-input bg-white border-red-200">
              <option value="">Select supervisor...</option>
              {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="field-label">Notes</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} className="field-input" placeholder="Observed losses, equipment issues, deviations..."/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : record ? 'Update Draft' : 'Save Draft'}
          </button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Advance Trial → Extract Addition
          </button>
        </div>
      </div>
    </div>
  );
}
