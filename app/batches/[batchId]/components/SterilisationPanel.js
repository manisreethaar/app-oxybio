'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';

const METHODS  = ['Autoclave','Pressure Cooker','Dry Heat','Filter','Chemical','Other'];
const TAPE_RES = ['Positive','Negative'];

export default function SterilisationPanel({ batch, employees, employeeProfile, role, availableStock, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast = useToast();
  const [equipment, setEquipment] = useState([]);
  const [saving,    setSaving]    = useState(false);
  const isInternOrRI = ['intern','research_intern'].includes(role);

  const [method,    setMethod]    = useState('Pressure Cooker');
  const [equipId,   setEquipId]   = useState('');
  const [temp,      setTemp]      = useState('');
  const [pressure,  setPressure]  = useState('');
  const [holdMin,   setHoldMin]   = useState('');
  const [cycleStart,setCycleStart]= useState('');
  const [cycleEnd,  setCycleEnd]  = useState('');
  const [tape,      setTape]      = useState('Positive');
  const [passFail,  setPassFail]  = useState('Pending');
  const [notes,     setNotes]     = useState('');

  const fetch = useCallback(async () => {
    const [dRes, eqRes] = await Promise.all([
      supabase.from('batch_stage_sterilisation').select('*').eq('batch_id', batch.id).single(),
      supabase.from('equipment').select('id, name, status, calibration_due_date').order('name'),
    ]);
    if (dRes.data) {
      const d = dRes.data;
      setMethod(d.method||'Pressure Cooker'); setEquipId(d.equipment_id||'');
      setTemp(d.cycle_temp_c||''); setPressure(d.cycle_pressure||'');
      setHoldMin(d.hold_time_min||'');
      setCycleStart(d.cycle_start?d.cycle_start.slice(0,16):'');
      setCycleEnd(d.cycle_end?d.cycle_end.slice(0,16):'');
      setTape(d.autoclave_tape||'Positive'); setPassFail(d.pass_fail||'Pending');
      setNotes(d.notes||'');
    }
    if (eqRes.data) setEquipment(eqRes.data);
  }, [batch.id, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const selectedEquip = equipment.find(e => e.id === equipId);
  const isCalibExpired = selectedEquip?.calibration_due_date ? new Date(selectedEquip.calibration_due_date) < new Date() : false;
  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));
  const isEquipBad     = selectedEquip && (selectedEquip.status !== 'Operational' || isCalibExpired);

  const holdTime = cycleStart && cycleEnd
    ? ((new Date(cycleEnd) - new Date(cycleStart)) / 60000).toFixed(0)
    : holdMin;

  const handleSave = async (advance = false) => {
    if (advance && passFail !== 'Pass') {
      toast.error('Cannot advance — sterilisation must Pass before proceeding to Inoculation.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_stage_sterilisation').upsert({
        batch_id: batch.id, method, equipment_id: equipId || null,
        cycle_temp_c: temp ? parseFloat(temp) : null, cycle_pressure: pressure || null,
        hold_time_min: holdTime ? parseFloat(holdTime) : null,
        cycle_start: cycleStart ? new Date(cycleStart).toISOString() : null,
        cycle_end: cycleEnd ? new Date(cycleEnd).toISOString() : null,
        autoclave_tape: tape, pass_fail: passFail,
        operator_id: employeeProfile?.id, notes: notes || null,
      }, { onConflict: 'batch_id' });
      if (error) throw error;
      toast.success(advance ? 'Sterilisation complete.' : 'Draft saved.');
      if (advance) {
        await onAdvanceStage('inoculation');
      } else {
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-slate-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Sterilisation</h2>
          <p className="text-xs text-gray-500">CCP — autoclave/pressure cooker record. Pass required to proceed.</p></div>
        <span className={`ml-auto px-2 py-1 text-[10px] font-black rounded-lg border uppercase ${passFail==='Pass'?'bg-emerald-50 text-emerald-700 border-emerald-200':passFail==='Fail'?'bg-red-50 text-red-700 border-red-200':'bg-gray-100 text-gray-500 border-gray-200'}`}>{passFail}</span>
      </div>

      {/* Fail warning */}
      {passFail === 'Fail' && (
        <div className="surface p-4 border-red-300 bg-red-50 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-red-800">Sterilisation Failed — Advance Blocked</p>
            <p className="text-xs text-red-700 mt-0.5">Raise a CAPA or move batch to Rejected before proceeding.</p>
          </div>
        </div>
      )}

      <div className="surface p-5 space-y-4">
        {/* Method */}
        <div>
          <label className="field-label">Method</label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(m=>(
              <button key={m} type="button" onClick={()=>setMethod(m)}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${method===m?'bg-navy text-white border-navy':'bg-white text-gray-600 border-gray-200 hover:border-navy'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Equipment */}
        <div>
          <label className="field-label">Equipment Used</label>
          <select value={equipId} onChange={e=>setEquipId(e.target.value)} className={`field-input bg-white ${isEquipBad?'border-red-300':''}`}>
            <option value="">Select equipment...</option>
            {equipment.map(e=>(
              <option key={e.id} value={e.id}>{e.name} — {e.status}{e.calibration_due_date&&new Date(e.calibration_due_date)<new Date()?' ⚠ CALIB EXPIRED':''}</option>
            ))}
          </select>
          {isEquipBad && <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Equipment non-compliant — check Equipment module before proceeding.</p>}
        </div>

        {/* Cycle params */}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Cycle Temp (°C) ★ CCP</label><input type="number" step="0.1" value={temp} onChange={e=>setTemp(e.target.value)} className="field-input" placeholder="121.0"/></div>
          <div><label className="field-label">Cycle Pressure</label><input value={pressure} onChange={e=>setPressure(e.target.value)} className="field-input" placeholder="15 psi / 1 bar"/></div>
          <div>
            <label className="field-label">Cycle Start Time</label>
            <input type="datetime-local" value={cycleStart} onChange={e=>setCycleStart(e.target.value)} className="field-input"/>
          </div>
          <div>
            <label className="field-label">Cycle End Time</label>
            <input type="datetime-local" value={cycleEnd} onChange={e=>setCycleEnd(e.target.value)} className="field-input"/>
          </div>
        </div>
        {holdTime && <p className="text-xs text-navy font-bold">Hold time: {holdTime} min</p>}
        {!cycleStart && <div><label className="field-label">Hold Time (min) ★ CCP</label><input type="number" value={holdMin} onChange={e=>setHoldMin(e.target.value)} className="field-input" placeholder="15"/></div>}

        {/* Autoclave tape */}
        <div>
          <label className="field-label">Autoclave Tape Result</label>
          <div className="flex gap-2">
            {TAPE_RES.map(o=>(
              <button key={o} type="button" onClick={()=>setTape(o)}
                className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${tape===o?(o==='Positive'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                {o === 'Positive' ? '✓ Positive (colour change)' : '✗ Negative (no change)'}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Positive = colour change confirmed = sterilisation indicator passed</p>
        </div>

        {/* Pass / Fail — gate */}
        <div className="p-4 bg-gray-50 rounded-2xl border-2 border-gray-200">
          <label className="block text-[11px] font-black uppercase tracking-wider text-gray-600 mb-2">
            Overall Result <span className="text-red-500">★ Gate — Fail blocks advance to Inoculation</span>
          </label>
          <div className="flex gap-3">
            {['Pass','Fail','Pending'].map(o=>(
              <button key={o} type="button" onClick={()=>setPassFail(o)}
                className={`flex-1 py-3 text-sm font-black rounded-xl border-2 transition-all ${passFail===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':o==='Fail'?'bg-red-600 text-white border-red-600':'bg-gray-500 text-white border-gray-500'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                {o}
              </button>
            ))}
          </div>
        </div>

        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Notes (cycle observations, deviations)..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">Save Draft</button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading||passFail!=='Pass'} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            {passFail==='Pass'?'Complete → Inoculation':'🔒 Advance Blocked (Fail)'}
          </button>
        </div>
      </div>
    </div>
  );
}
