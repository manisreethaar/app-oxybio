'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { ShieldCheck, AlertTriangle, ExternalLink, FlaskConical } from 'lucide-react';
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

  // G-01: Biological Indicator fields
  const [biUsed,     setBiUsed]     = useState(false);
  const [biResult,   setBiResult]   = useState('Not Used');
  const [biIncDate,  setBiIncDate]  = useState('');

  // G-03: CAPA linkage
  const [capaDevId,  setCapaDevId]  = useState(null);
  const [raisingCapa, setRaisingCapa] = useState(false);
  // G-84: steam quality + condensate
  const [steamQuality,  setSteamQuality]  = useState('');
  // A-28: Autoclave load configuration
  const [loadDesc,      setLoadDesc]      = useState('');
  const [loadTotalVol,  setLoadTotalVol]  = useState('');
  const [flaskSizes,    setFlaskSizes]    = useState('');
  const [condensateCheck, setCondensateCheck] = useState('');
  // G-59: cooling time
  const [coolingMin, setCoolingMin] = useState('');
  // G-58: cycle 2
  const [showCycle2,  setShowCycle2]  = useState(false);
  const [cycle2Temp,  setCycle2Temp]  = useState('');
  const [cycle2Hold,  setCycle2Hold]  = useState('');
  const [cycle2Start, setCycle2Start] = useState('');
  const [cycle2End,   setCycle2End]   = useState('');
  const [cycle2Tape,  setCycle2Tape]  = useState('Positive');

  const fetchRecord = useCallback(async () => {
    let isCurrent = true;
    const [dRes, eqRes] = await Promise.all([
      supabase.from('batch_stage_sterilisation').select('*').eq('batch_id', batch.id).single(),
      supabase.from('equipment').select('id, name, status, calibration_due_date, iq_doc_url, oq_doc_url, pq_doc_url').order('name'),
    ]);
    if (!isCurrent) return;
    if (dRes.data) {
      const d = dRes.data;
      setMethod(d.method||'Pressure Cooker'); setEquipId(d.equipment_id||'');
      setTemp(d.cycle_temp_c||''); setPressure(d.cycle_pressure_bar||'');
      setHoldMin(d.hold_time_min||'');
      setCycleStart(d.cycle_start ? (() => { const d1 = new Date(d.cycle_start); d1.setMinutes(d1.getMinutes() - d1.getTimezoneOffset()); return d1.toISOString().slice(0,16); })() : '');
      setCycleEnd(d.cycle_end ? (() => { const d1 = new Date(d.cycle_end); d1.setMinutes(d1.getMinutes() - d1.getTimezoneOffset()); return d1.toISOString().slice(0,16); })() : '');
      setTape(d.autoclave_tape||'Positive'); setPassFail(d.pass_fail||'Pending');
      setNotes(d.notes||'');
      setBiUsed(d.bi_used||false);
      setBiResult(d.bi_result||'Not Used');
      setBiIncDate(d.bi_incubation_date||'');
      setCapaDevId(d.capa_deviation_id||null);
      setCoolingMin(d.cooling_time_min||'');
      setSteamQuality(d.steam_quality_check||'');
      setLoadDesc(d.load_description||'');
      setLoadTotalVol(d.load_total_volume_ml||'');
      setFlaskSizes((d.flask_sizes||[]).join(', '));
      setCondensateCheck(d.condensate_check||'');
      if (d.cycle2_temp_c) { setShowCycle2(true); setCycle2Temp(d.cycle2_temp_c||''); setCycle2Hold(d.cycle2_hold_min||''); setCycle2Tape(d.cycle2_tape||'Positive'); }
      if (d.cycle2_start) setCycle2Start((() => { const dt = new Date(d.cycle2_start); dt.setMinutes(dt.getMinutes()-dt.getTimezoneOffset()); return dt.toISOString().slice(0,16); })());
      if (d.cycle2_end)   setCycle2End  ((() => { const dt = new Date(d.cycle2_end);   dt.setMinutes(dt.getMinutes()-dt.getTimezoneOffset()); return dt.toISOString().slice(0,16); })());
    }
    if (eqRes.data) setEquipment(eqRes.data);
    return () => { isCurrent = false; };
  }, [batch.id, supabase]);

  useEffect(() => { fetchRecord(); }, [fetchRecord]);

  const selectedEquip = equipment.find(e => e.id === equipId);
  const isCalibExpired = selectedEquip?.calibration_due_date ? new Date(selectedEquip.calibration_due_date) < new Date() : false;
  const isEquipBad     = selectedEquip && (selectedEquip.status !== 'Operational' || isCalibExpired);

  const holdTime = cycleStart && cycleEnd
    ? ((new Date(cycleEnd) - new Date(cycleStart)) / 60000).toFixed(0)
    : holdMin;

  // G-02: F₀ auto-calculation
  const f0 = calcF0(temp, holdTime);

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
            description: `Sterilisation stage failed for batch ${batch.batch_id}. Method: ${method}. Tape: ${tape}. Autoclave tape result did not confirm adequate sterilisation. Immediate investigation required.`,
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

  const handleSave = async (advance = false) => {
    if (advance && passFail !== 'Pass') {
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
      if (passFail === 'Fail' && !capaDevId) {
        devId = await autoRaiseCapa();
        if (devId) toast.warn('CAPA deviation auto-raised for sterilisation failure. Review in Compliance module.');
      }

      const { error } = await supabase.from('batch_stage_sterilisation').upsert({
        batch_id: batch.id, method, equipment_id: equipId || null,
        cycle_temp_c: temp ? parseFloat(temp) : null, cycle_pressure_bar: pressure ? parseFloat(pressure) : null,
        hold_time_min: holdTime ? parseFloat(holdTime) : null,
        f0_value: f0,
        cycle_start: cycleStart ? new Date(cycleStart).toISOString() : null,
        cycle_end: cycleEnd ? new Date(cycleEnd).toISOString() : null,
        autoclave_tape: tape, pass_fail: passFail,
        bi_used: biUsed,
        bi_result: biUsed ? biResult : 'Not Used',
        bi_incubation_date: biUsed && biIncDate ? biIncDate : null,
        capa_deviation_id: devId || null,
        steam_quality_check:  steamQuality || null,
        condensate_check:     condensateCheck || null,
        load_description:     loadDesc || null,
        load_total_volume_ml: loadTotalVol ? parseFloat(loadTotalVol) : null,
        flask_sizes:          flaskSizes.trim() ? flaskSizes.split(',').map(s=>s.trim()).filter(Boolean) : [],
        cooling_time_min: coolingMin ? parseFloat(coolingMin) : null,
        cycle2_temp_c:   showCycle2 && cycle2Temp  ? parseFloat(cycle2Temp)  : null,
        cycle2_hold_min: showCycle2 && cycle2Hold  ? parseFloat(cycle2Hold)  : null,
        cycle2_start:    showCycle2 && cycle2Start ? new Date(cycle2Start).toISOString() : null,
        cycle2_end:      showCycle2 && cycle2End   ? new Date(cycle2End).toISOString()   : null,
        cycle2_tape:     showCycle2 ? cycle2Tape   : null,
        operator_id: employeeProfile?.id, notes: notes || null,
      }, { onConflict: 'batch_id' });
      if (error) throw error;

      if (equipId) {
        supabase.from('calibration_logs').insert({
          equipment_id: equipId,
          calibration_date: new Date().toISOString().slice(0, 10),
          result: `Used in batch ${batch.batch_id}`,
          status: 'Operational',
          performed_by: employeeProfile?.id || null,
        }).then(() => {}).catch(() => {});
      }

      toast.success(advance ? 'Sterilisation complete.' : 'Draft saved.');
      syncStageToLNB(supabase, batch.id, 'sterilisation', {
        method,
        equipment: equipment.find(e => e.id === equipId)?.name || null,
        cycle_temp_c: temp ? parseFloat(temp) : null,
        cycle_pressure_bar: pressure ? parseFloat(pressure) : null,
        hold_time_min: holdTime ? parseFloat(holdTime) : null,
        f0_value: f0,
        autoclave_tape: tape,
        pass_fail: passFail,
        bi_result: biUsed ? biResult : 'Not Used',
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
      <div className="surface p-5 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-slate-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Sterilisation</h2>
          <p className="text-xs text-gray-500">CCP — autoclave/pressure cooker record. Pass required to proceed.</p></div>
        <span className={`ml-auto px-2 py-1 text-[10px] font-black rounded-lg border uppercase ${passFail==='Pass'?'bg-emerald-50 text-emerald-700 border-emerald-200':passFail==='Fail'?'bg-red-50 text-red-700 border-red-200':'bg-gray-100 text-gray-500 border-gray-200'}`}>{passFail}</span>
      </div>

      {passFail === 'Fail' && (
        <div className="surface p-4 border-red-300 bg-red-50 flex items-start gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <button key={o} type="button" onClick={()=>setTape(o)}
                className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${tape===o?(o==='Positive'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                {o === 'Positive' ? '✓ Positive (colour change)' : '✗ Negative (no change)'}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Positive = colour change confirmed = sterilisation indicator passed</p>
        </div>

        {/* G-01: Biological Indicator */}
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={biUsed} onChange={e=>setBiUsed(e.target.checked)} className="w-4 h-4 rounded border-indigo-300"/>
              <span className="text-xs font-black text-indigo-900">Biological Indicator (BI) used in this cycle</span>
            </label>
            <span className="text-[10px] text-indigo-500 font-semibold ml-1">Geobacillus stearothermophilus spore strip</span>
          </div>
          {biUsed && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label text-indigo-800">BI Result</label>
                <div className="flex gap-2">
                  {BI_RESULTS.map(o=>(
                    <button key={o} type="button" onClick={()=>setBiResult(o)}
                      className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${biResult===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':o==='Fail'?'bg-red-600 text-white border-red-600':'bg-gray-500 text-white border-gray-500'):'bg-white text-gray-500 border-gray-200'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label text-indigo-800">BI Strip Incubation Date</label>
                <input type="date" value={biIncDate} onChange={e=>setBiIncDate(e.target.value)} className="field-input"/>
                <p className="text-[9px] text-indigo-400 mt-0.5">Incubate at 55–60°C for 48 hrs — record result date</p>
              </div>
            </div>
          )}
          {biUsed && biResult === 'Fail' && (
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
                <button key={o} type="button" onClick={()=>setSteamQuality(steamQuality===o?'':o)}
                  className={`flex-1 py-1.5 text-[9px] font-black rounded-xl border transition-all ${steamQuality===o?'bg-navy text-white border-navy':'bg-white text-gray-500 border-gray-200'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">Condensate Check</label>
            <div className="flex gap-2">
              {['Pass','Fail','N/A'].map(o=>(
                <button key={o} type="button" onClick={()=>setCondensateCheck(condensateCheck===o?'':o)}
                  className={`flex-1 py-1.5 text-[9px] font-black rounded-xl border transition-all ${condensateCheck===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':o==='Fail'?'bg-red-600 text-white border-red-600':'bg-gray-500 text-white border-gray-500'):'bg-white text-gray-500 border-gray-200'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* G-59: Cooling time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Cooling Time (min) <span className="text-gray-400 text-[9px]">autoclave end → LAF transfer</span></label>
            <input type="number" step="1" value={coolingMin} onChange={e=>setCoolingMin(e.target.value)} className="field-input" placeholder="e.g. 30"/>
          </div>
        </div>

        {/* G-58: Second sterilisation cycle */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button type="button" onClick={()=>setShowCycle2(p=>!p)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-xs font-black text-gray-700 transition-colors">
            <span>Second Sterilisation Cycle (optional)</span>
            <span className={`text-lg ${showCycle2?'text-navy':'text-gray-300'}`}>{showCycle2?'▼':'▶'}</span>
          </button>
          {showCycle2 && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">Cycle 2 Temp (°C)</label><input type="number" step="0.1" value={cycle2Temp} onChange={e=>setCycle2Temp(e.target.value)} className="field-input" placeholder="121.0"/></div>
                <div><label className="field-label">Cycle 2 Hold (min)</label><input type="number" value={cycle2Hold} onChange={e=>setCycle2Hold(e.target.value)} className="field-input" placeholder="15"/></div>
                <div><label className="field-label">Cycle 2 Start</label><input type="datetime-local" value={cycle2Start} onChange={e=>setCycle2Start(e.target.value)} className="field-input"/></div>
                <div><label className="field-label">Cycle 2 End</label><input type="datetime-local" value={cycle2End} onChange={e=>setCycle2End(e.target.value)} className="field-input"/></div>
              </div>
              <div>
                <label className="field-label">Cycle 2 Tape Result</label>
                <div className="flex gap-2">
                  {TAPE_RES.map(o=>(
                    <button key={o} type="button" onClick={()=>setCycle2Tape(o)}
                      className={`flex-1 py-1.5 text-xs font-black rounded-xl border transition-all ${cycle2Tape===o?(o==='Positive'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
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
          {passFail === 'Fail' && !capaDevId && (
            <p className="text-[10px] text-red-600 font-bold mt-2">Saving will auto-raise a CAPA deviation record.</p>
          )}
        </div>

        {/* A-48: IQ/OQ/PQ validation document linkage */}
        {selectedEquip && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs">
            <p className="font-black text-gray-700 uppercase text-[10px] mb-1">Equipment Validation Status (A-48)</p>
            <div className="flex flex-wrap gap-3">
              {[['IQ','iq_doc_url'],['OQ','oq_doc_url'],['PQ','pq_doc_url']].map(([label, field]) => (
                <span key={label} className={`px-2 py-1 rounded-lg border text-[10px] font-black ${selectedEquip[field] ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
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
          <p className="text-xs font-black text-slate-700">Load Configuration <span className="text-slate-400 font-semibold text-[10px]">(A-28 — affects heat penetration)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Total Load Volume (ml)</label><input type="number" value={loadTotalVol} onChange={e=>setLoadTotalVol(e.target.value)} className="field-input" placeholder="e.g. 750"/></div>
            <div><label className="field-label">Flask Sizes (comma-separated)</label><input value={flaskSizes} onChange={e=>setFlaskSizes(e.target.value)} className="field-input" placeholder="e.g. 250ml, 500ml, 100ml"/></div>
          </div>
          <div><label className="field-label">Load Description</label><input value={loadDesc} onChange={e=>setLoadDesc(e.target.value)} className="field-input" placeholder="e.g. 3 × 250ml media + 2 × 500ml broth in stainless rack"/></div>
        </div>

        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Notes (cycle observations, deviations)..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={()=>handleSave(false)} disabled={saving||raisingCapa} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : raisingCapa ? 'Raising CAPA...' : 'Save Draft'}
          </button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading||passFail!=='Pass'} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            {passFail==='Pass'?'Complete → Inoculation':'🔒 Advance Blocked (Fail)'}
          </button>
        </div>
      </div>
    </div>
  );
}
