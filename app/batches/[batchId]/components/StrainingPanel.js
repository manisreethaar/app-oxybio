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

    setSaving(true);
    try {
      const payload = {
        flask_id: activeFlask.id, batch_id: batch.id,
        method: 'Centrifugation',
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

      {/* Centrifuge Run Parameters */}
      <div className="surface p-5 space-y-4">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Centrifuge Run Parameters</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="field-label">Speed (RPM) *</label>
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

      {/* Supernatant Quality */}
      <div className="surface p-5 space-y-4">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Supernatant Quality</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        </div>
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
