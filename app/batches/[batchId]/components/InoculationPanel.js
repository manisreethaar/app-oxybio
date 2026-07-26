'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Droplets, AlertTriangle, Dna, ChevronDown } from 'lucide-react';
import { syncStageToLNB } from '@/lib/lnbSync';

const TRANSFER_METHODS = ['Pipette', 'Syringe', 'Sterile spoon'];
const SOURCE_TYPES = [
  { value: 'cell_bank', label: 'Cell Bank Vial' },
  { value: 'back_slop', label: 'Back-Slop' },
  { value: 'other',     label: 'External / Other' },
];

export default function InoculationPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const isInternOrRI = ['intern','research_intern'].includes(role);

  const toLocalDatetime = (utcStr) => {
    if (!utcStr) return '';
    const d = new Date(utcStr);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
  };

  const [sourceType, setSourceType] = useState('other');
  const [source,    setSource]    = useState('');
  const [vialId,    setVialId]    = useState('');
  const [availVials, setAvailVials] = useState([]);
  const [vialsLoading, setVialsLoading] = useState(false);
  const [inVol,     setInVol]     = useState('');
  const [plannedHr, setPlannedHr] = useState('');
  const [tZero,     setTZero]     = useState('');
  const [transfer,  setTransfer]  = useState('Pipette');
  const [lafUsed,   setLafUsed]   = useState(false);
  const [contCheck, setContCheck] = useState('Clear');
  const [contNotes, setContNotes] = useState('');
  // G-19: pre-inoculation pH
  const [preInocuPh,          setPreInocuPh]          = useState('');
  // A-26: inoculum viability at point of use
  const [inoculumViabilityPct,    setInoculumViabilityPct]    = useState('');
  const [inoculumViabilityMethod, setInoculumViabilityMethod] = useState('Not checked');
  // A-27: post-inoculation pH at 15 min
  const [postInocuPh15min,    setPostInocuPh15min]    = useState('');
  // A-49: back-slop prep log
  const [backSlopSourceBatch, setBackSlopSourceBatch] = useState('');
  const [backSlopFinalPh,     setBackSlopFinalPh]     = useState('');
  const [backSlopFinalTa,     setBackSlopFinalTa]     = useState('');
  // G-34: sampling plan
  const [samplingPlanHrs, setSamplingPlanHrs] = useState('');
  // G-55: flask temperature
  const [flaskTempC, setFlaskTempC] = useState('');
  // G-56: back-slop ratio
  const [backSlopPct, setBackSlopPct] = useState('');
  // G-57: co-starters [{source_type, source, vol_ml}]
  const [coStarters, setCoStarters] = useState([]);
  // G-04: CAPA linkage for contamination
  const [capaDevId, setCapaDevId] = useState(null);
  const [raisingCapa, setRaisingCapa] = useState(false);

  // Load available cell bank vials when source type switches to cell_bank
  useEffect(() => {
    if (sourceType !== 'cell_bank') return;
    setVialsLoading(true);
    withTimeout(fetch('/api/research/cell-bank/vials?status=Available'), 20000, 'Available vials load timed out')
      .then(r => r.json())
      .then(j => { if (j.success) setAvailVials(j.data || []); })
      .catch(() => {})
      .finally(() => setVialsLoading(false));
  }, [sourceType]);

  const fetchRecord = useCallback(() => {
    if (!activeFlask?.id) return;
    withTimeout(supabase.from('batch_flask_inoculations').select('*').eq('flask_id', activeFlask.id).single(), 20000, 'Inoculation record load timed out')
      .then(({ data: d }) => {
        if (d) {
          setSourceType(d.inoculum_source_type || 'other');
          setSource(d.inoculum_source||'');
          setVialId(d.cell_bank_vial_id||'');
          setInVol(d.inoculum_vol_ml||'');
          setPlannedHr(d.planned_fermentation_hrs||'');
          setTZero(toLocalDatetime(d.t_zero_time));
          setTransfer(d.transfer_method||'Pipette');
          setLafUsed(d.laf_used||false);
          setContCheck(d.contamination_check||'Clear');
          setContNotes(d.contamination_notes||'');
          setCapaDevId(d.capa_deviation_id||null);
          setPreInocuPh(d.pre_inocu_ph||'');
          setInoculumViabilityPct(d.inoculum_viability_pct||'');
          setInoculumViabilityMethod(d.inoculum_viability_method||'Not checked');
          setPostInocuPh15min(d.post_inocu_ph_15min||'');
          setBackSlopSourceBatch(d.back_slop_source_batch_id||'');
          setBackSlopFinalPh(d.back_slop_final_ph||'');
          setBackSlopFinalTa(d.back_slop_final_ta_pct||'');
          setSamplingPlanHrs((d.sampling_plan_hrs||[]).join(', '));
          setFlaskTempC(d.flask_temp_c||'');
          setBackSlopPct(d.back_slop_ratio_pct||'');
          setCoStarters(d.co_starters||[]);
        } else {
          setSourceType('other'); setSource(''); setVialId(''); setInVol(''); setPlannedHr('');
          setTransfer('Pipette'); setLafUsed(false); setContCheck('Clear'); setContNotes('');
          setTZero('');
        }
      })
      .catch(err => console.error('InoculationPanel fetch error:', err));
  }, [activeFlask?.id, supabase]);

  useEffect(() => { fetchRecord(); }, [fetchRecord]);

  const selectedVial = availVials.find(v => v.id === vialId);

  // G-04: auto-raise CAPA when contamination is suspected
  const autoRaiseContaminationCapa = async () => {
    if (capaDevId) return capaDevId;
    setRaisingCapa(true);
    try {
      const res = await fetch('/api/capa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'raise',
          payload: {
            title: `Suspected Contamination at Inoculation — ${activeFlask.flask_label} (${batch.batch_id})`,
            severity: 'Major',
            source: 'Inoculation',
            description: `Contamination suspected during inoculation of trial ${activeFlask.flask_label} in batch ${batch.batch_id}. Notes: ${contNotes || 'No details provided'}. Investigate source and scope before proceeding.`,
          },
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        setCapaDevId(json.data.id);
        return json.data.id;
      }
    } catch {
      // non-blocking
    } finally {
      setRaisingCapa(false);
    }
    return null;
  };

  const handleSave = async (advance = false) => {
    if (!activeFlask) return;
    if (advance && !tZero) { toast.warn('T=0 inoculation time is required to advance.'); return; }
    if (advance && !plannedHr) { toast.warn('Please define a planned fermentation time.'); return; }

    setSaving(true);
    try {
      let devId = capaDevId;
      // G-04: auto-raise CAPA when contamination is suspected
      if (contCheck === 'Suspected' && !capaDevId) {
        devId = await autoRaiseContaminationCapa();
        if (devId) toast.warn('CAPA deviation raised for suspected contamination. Review in Compliance module.');
      }

      const { error } = await supabase.from('batch_flask_inoculations').upsert({
        flask_id: activeFlask.id, batch_id: batch.id,
        inoculum_source_type: sourceType,
        inoculum_source: sourceType === 'cell_bank' ? (selectedVial ? `${selectedVial.vial_code} — ${selectedVial.cell_bank_preparations?.cell_bank_strains?.name || ''}` : null) : (source || null),
        cell_bank_vial_id: sourceType === 'cell_bank' && vialId ? vialId : null,
        inoculum_vol_ml: inVol ? parseFloat(inVol) : null,
        planned_fermentation_hrs: plannedHr ? parseFloat(plannedHr) : null,
        t_zero_time: tZero ? new Date(tZero).toISOString() : null,
        transfer_method: transfer, laf_used: lafUsed,
        contamination_check: contCheck,
        contamination_notes: contCheck === 'Suspected' ? contNotes : null,
        capa_deviation_id: devId || null,
        pre_inocu_ph: preInocuPh ? parseFloat(preInocuPh) : null,
        flask_temp_c: flaskTempC ? parseFloat(flaskTempC) : null,
        back_slop_ratio_pct: backSlopPct ? parseFloat(backSlopPct) : null,
        co_starters: coStarters,
        sampling_plan_hrs: samplingPlanHrs.trim()
          ? samplingPlanHrs.split(',').map(s=>s.trim()).filter(Boolean)
          : [],
        inoculum_viability_pct: inoculumViabilityPct ? parseFloat(inoculumViabilityPct) : null,
        inoculum_viability_method: inoculumViabilityMethod !== 'Not checked' ? inoculumViabilityMethod : null,
        post_inocu_ph_15min: postInocuPh15min ? parseFloat(postInocuPh15min) : null,
        back_slop_source_batch_id: sourceType === 'back_slop' ? (backSlopSourceBatch || null) : null,
        back_slop_final_ph: sourceType === 'back_slop' && backSlopFinalPh ? parseFloat(backSlopFinalPh) : null,
        back_slop_final_ta_pct: sourceType === 'back_slop' && backSlopFinalTa ? parseFloat(backSlopFinalTa) : null,
        operator_id: employeeProfile?.id,
      }, { onConflict: 'flask_id' });
      if (error) throw error;

      // Mark vial as used
      if (sourceType === 'cell_bank' && vialId) {
        fetch(`/api/research/cell-bank/vials/${vialId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'use', batch_id: batch.id, flask_id: activeFlask.id }),
        }).catch(() => {});
      }

      toast.success(advance ? `Trial ${activeFlask.flask_label} Inoculated. T=0 anchored.` : 'Draft saved.');
      syncStageToLNB(supabase, batch.id, 'inoculation', {
        inoculum_source_type: sourceType,
        inoculum_source: sourceType === 'cell_bank' ? (selectedVial?.vial_code || null) : (source || null),
        cell_bank_vial_id: vialId || null,
        strain_name: selectedVial?.cell_bank_preparations?.cell_bank_strains?.name || null,
        inoculum_vol_ml: inVol ? parseFloat(inVol) : null,
        planned_fermentation_hrs: plannedHr ? parseFloat(plannedHr) : null,
        t_zero_time: tZero || null,
        transfer_method: transfer,
        laf_used: lafUsed,
        contamination_check: contCheck,
      }, activeFlask.flask_label);
      if (advance && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage('fermentation');
      } else {
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Inoculation details.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-3 border-l-4 border-l-blue-500">
        <Droplets className="w-5 h-5 text-slate-600"/>
        <div><h2 className="text-base font-bold text-slate-900">Inoculation: <span className="text-slate-600">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-slate-500">Define the independent starter source and timeline for this specific trial.</p></div>
      </div>

      <div className="card p-5 space-y-4">
        {/* Source Type */}
        <div>
          <label className="field-label">Inoculum Source Type</label>
          <div className="flex gap-2">
            {SOURCE_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setSourceType(t.value)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${sourceType === t.value ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cell Bank Vial picker */}
        {sourceType === 'cell_bank' && (
          <div className="space-y-2">
            <label className="field-label flex items-center gap-1"><Dna className="w-3.5 h-3.5 text-slate-600"/> Cell Bank Vial</label>
            {vialsLoading ? (
              <div className="field-input text-slate-400 text-xs">Loading available vials...</div>
            ) : availVials.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-semibold">
                No available cell bank vials found. Register vials in the Cell Bank module first.
              </div>
            ) : (
              <select value={vialId} onChange={e => setVialId(e.target.value)} className="field-input bg-white">
                <option value="">Select vial...</option>
                {availVials.map(v => {
                  const strain = v.cell_bank_preparations?.cell_bank_strains;
                  const prep = v.cell_bank_preparations;
                  return (
                    <option key={v.id} value={v.id}>
                      {v.vial_code} — {strain?.name || 'Unknown strain'} ({prep?.type} {prep?.prep_code}{prep?.passage_number != null ? ` P${prep.passage_number}` : ''}) · {v.storage_temp}
                    </option>
                  );
                })}
              </select>
            )}
            {selectedVial && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <p className="font-black text-slate-800">{selectedVial.vial_code}</p>
                <p className="text-slate-700 font-semibold">{selectedVial.cell_bank_preparations?.cell_bank_strains?.name}</p>
                <p className="text-slate-600">{selectedVial.cell_bank_preparations?.type} · {selectedVial.cell_bank_preparations?.prep_code}{selectedVial.cell_bank_preparations?.passage_number != null ? ` · Passage P${selectedVial.cell_bank_preparations.passage_number}` : ''} · Stored at {selectedVial.storage_temp}</p>
                {selectedVial.freezer_id && <p className="text-slate-500">Freezer: {selectedVial.freezer_id} / Rack {selectedVial.rack} / Box {selectedVial.box}</p>}
              </div>
            )}
          </div>
        )}

        {/* Free text for back-slop or other */}
        {sourceType !== 'cell_bank' && (
          <div>
            <label className="field-label">Inoculum Source</label>
            <input value={source} onChange={e=>setSource(e.target.value)} className="field-input"
              placeholder={sourceType === 'back_slop' ? 'e.g. Back-slop from Batch OXY-2026-001' : 'e.g. Isolate ISOL-001 / External culture'}/>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Inoculum Volume (ml)</label>
            <input type="number" step="0.1" value={inVol} onChange={e=>setInVol(e.target.value)} className="field-input" placeholder="12.5"/>
          </div>
          <div>
            <label className="field-label">Planned Fermentation Time (hr)</label>
            <input type="number" step="0.1" value={plannedHr} onChange={e=>{
              setPlannedHr(e.target.value);
              // G-34: auto-suggest sampling plan (4 evenly spaced points)
              const hrs = parseFloat(e.target.value);
              if (hrs > 0 && !samplingPlanHrs) {
                const interval = hrs / 4;
                const suggested = [1,2,3,4].map(i => Math.round(interval*i)).join(', ');
                setSamplingPlanHrs(suggested);
              }
            }} className="field-input" placeholder="e.g. 12"/>
            <p className="text-xs text-slate-400 mt-1">User-defined threshold for alerting</p>
          </div>
        </div>

        {/* G-55: Flask temperature at inoculation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Flask Temp at Inoculation (°C) <span className="text-slate-400 text-xs">must be &lt;40°C for LAB</span></label>
            <input type="number" step="0.5" value={flaskTempC} onChange={e=>setFlaskTempC(e.target.value)} className="field-input" placeholder="e.g. 35.0"/>
            {flaskTempC && parseFloat(flaskTempC) > 42 && <p className="text-xs text-red-600 font-bold mt-0.5">⚠ Temperature exceeds 42°C — LAB may not survive inoculation</p>}
          </div>
          {/* G-54: Inoculation rate auto-calc */}
          <div>
            <label className="field-label">Inoculation Rate (% v/v) <span className="text-slate-400 text-xs">auto-calculated</span></label>
            <div className="field-input bg-slate-50 font-black text-navy text-sm">
              {inVol && batch.planned_volume_ml
                ? `${((parseFloat(inVol) / (batch.planned_volume_ml)) * 100).toFixed(2)}%`
                : '—'}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">= vol_inocu / vol_flask × 100</p>
          </div>
        </div>

        {/* G-56: Back-slop ratio */}
        {sourceType === 'back_slop' && (
          <div>
            <label className="field-label">Back-Slop Ratio (% v/v of previous batch)</label>
            <input type="number" step="0.5" min="0" max="100" value={backSlopPct} onChange={e=>setBackSlopPct(e.target.value)} className="field-input" placeholder="e.g. 10"/>
            <p className="text-xs text-slate-400 mt-0.5">Typical back-slop ratio: 3–15% v/v</p>
          </div>
        )}

        {/* G-57: Multi-starter / co-culture */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="field-label mb-0">Co-Culture / Additional Starters</label>
            <button type="button" onClick={()=>setCoStarters(p=>[...p,{source_type:'other',source:'',vol_ml:''}])}
              className="px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 text-xs font-black rounded-lg uppercase hover:bg-slate-100">
              + Add Organism
            </button>
          </div>
          {coStarters.map((cs, idx) => (
            <div key={idx} className="p-3 bg-slate-50/30 border border-slate-100 rounded-xl grid grid-cols-3 gap-2">
              <input value={cs.source} onChange={e=>setCoStarters(p=>p.map((s,i)=>i===idx?{...s,source:e.target.value}:s))} placeholder="e.g. Saccharomyces cerevisiae" className="field-input text-xs col-span-2 p-1.5"/>
              <input type="number" value={cs.vol_ml} onChange={e=>setCoStarters(p=>p.map((s,i)=>i===idx?{...s,vol_ml:e.target.value}:s))} placeholder="ml" className="field-input text-xs p-1.5"/>
              <button type="button" onClick={()=>setCoStarters(p=>p.filter((_,i)=>i!==idx))} className="col-span-3 text-right text-xs text-red-400 hover:text-red-600 font-black">✕ Remove</button>
            </div>
          ))}
          {coStarters.length === 0 && <p className="text-xs text-slate-400 italic">No co-cultures. Single-starter inoculation.</p>}
        </div>

        {/* G-34: Sampling plan */}
        <div className="p-3 bg-navy/5 border border-navy/15 rounded-xl">
          <label className="block text-xs font-black uppercase tracking-wider text-navy/80 mb-1.5">
            Fermentation Sampling Schedule <span className="text-slate-400 font-normal normal-case text-xs">(comma-separated hours)</span>
          </label>
          <input value={samplingPlanHrs} onChange={e=>setSamplingPlanHrs(e.target.value)}
            className="w-full px-3 py-2 border border-navy/20 rounded-xl text-xs font-semibold outline-none bg-white focus:border-navy"
            placeholder="e.g. 6, 12, 18, 24"/>
          {samplingPlanHrs && (
            <div className="flex flex-wrap gap-1 mt-2">
              {samplingPlanHrs.split(',').map(h=>h.trim()).filter(Boolean).map(hr => (
                <span key={hr} className="px-2 py-0.5 bg-navy/10 text-navy text-xs font-black rounded border border-navy/15">T+{hr}h</span>
              ))}
            </div>
          )}
        </div>

        {/* G-19: Pre-inoculation pH check */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
          <label className="block text-xs font-black uppercase tracking-wider text-amber-900">
            Pre-Inoculation Substrate pH <span className="text-amber-500">(check before adding starter)</span>
          </label>
          <input type="number" step="0.01" value={preInocuPh} onChange={e=>setPreInocuPh(e.target.value)}
            className="w-full px-4 py-2 border-2 border-amber-200 rounded-xl text-lg font-black font-mono text-center text-amber-900 bg-white outline-none focus:border-amber-400"
            placeholder="e.g. 6.50"/>
          {preInocuPh && (parseFloat(preInocuPh) < 5.5 || parseFloat(preInocuPh) > 7.0) && (
            <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Substrate pH is outside typical pre-inoculation range (5.5–7.0). Verify before proceeding.</p>
          )}
          {preInocuPh && parseFloat(preInocuPh) >= 5.5 && parseFloat(preInocuPh) <= 7.0 && (
            <p className="text-xs text-emerald-700 font-bold">✓ pH in acceptable pre-inoculation range</p>
          )}
        </div>

        {/* A-26: Inoculum viability at point of use */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-slate-900">Inoculum Viability at Point of Use <span className="text-slate-500 font-semibold text-xs">(A-26)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label text-slate-800">Viability (%)</label>
              <input type="number" step="0.1" min="0" max="100" value={inoculumViabilityPct} onChange={e=>setInoculumViabilityPct(e.target.value)} className="field-input" placeholder="e.g. 92"/>
            </div>
            <div>
              <label className="field-label text-slate-800">Method</label>
              <select value={inoculumViabilityMethod} onChange={e=>setInoculumViabilityMethod(e.target.value)} className="field-input bg-white text-xs">
                {['Not checked','Methylene Blue','Live/Dead stain','Plate count','OD reading'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {inoculumViabilityPct && parseFloat(inoculumViabilityPct) < 80 && (
            <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Low inoculum viability — extended lag phase expected</p>
          )}
        </div>

        {/* A-49: Back-slop prep log */}
        {sourceType === 'back_slop' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <p className="text-xs font-black text-amber-900">Back-Slop Preparation Record <span className="text-amber-500 font-semibold text-xs">(A-49)</span></p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="field-label">Source Batch ID</label><input value={backSlopSourceBatch} onChange={e=>setBackSlopSourceBatch(e.target.value)} className="field-input text-xs" placeholder="e.g. OXY-2026-001"/></div>
              <div><label className="field-label">Source Final pH</label><input type="number" step="0.01" value={backSlopFinalPh} onChange={e=>setBackSlopFinalPh(e.target.value)} className="field-input text-xs" placeholder="4.2"/></div>
              <div><label className="field-label">Source Final TA%</label><input type="number" step="0.01" value={backSlopFinalTa} onChange={e=>setBackSlopFinalTa(e.target.value)} className="field-input text-xs" placeholder="0.85"/></div>
            </div>
          </div>
        )}

        {/* A-27: Post-inoculation pH at 15 min */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <label className="block text-xs font-black text-emerald-900 mb-1">Post-Inoculation pH at 15 min <span className="text-emerald-500 font-semibold text-xs">(A-27)</span></label>
          <input type="number" step="0.01" value={postInocuPh15min} onChange={e=>setPostInocuPh15min(e.target.value)} className="field-input" placeholder="Measure pH 15 min after adding starter to confirm activity"/>
          {postInocuPh15min && preInocuPh && (
            <p className="text-xs text-emerald-700 font-semibold mt-1">
              ΔpH = {(parseFloat(postInocuPh15min) - parseFloat(preInocuPh)).toFixed(2)} {parseFloat(postInocuPh15min) < parseFloat(preInocuPh) ? '✓ Starter is active' : '⚠ No acidification — check starter viability'}
            </p>
          )}
        </div>

        {/* T=0 */}
        <div className="p-4 border-2 border-navy/30 rounded-2xl bg-navy/5">
          <label className="block text-xs font-black uppercase tracking-wider text-navy mb-2">
            ⏱ T=0 — Inoculation Time for {activeFlask.flask_label}
          </label>
          <input type="datetime-local" value={tZero} onChange={e=>setTZero(e.target.value)}
            className="w-full px-4 py-3 border-2 border-navy/30 rounded-xl text-sm font-black font-mono text-navy bg-white outline-none focus:border-navy"/>
          {tZero && new Date(tZero) < new Date(batch.created_at || batch.start_time) ? (
            <p className="text-xs text-amber-600 font-bold mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3"/>Retrospective entry — T=0 is before this batch was created in OxyOS. This is valid for historical data.
            </p>
          ) : (
            <p className="text-xs text-navy/60 font-semibold mt-1.5">This sets the clock specifically for this trial.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="field-label">Transfer Method</label>
            <select value={transfer} onChange={e=>setTransfer(e.target.value)} className="field-input bg-white">
              {TRANSFER_METHODS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col justify-end pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={lafUsed} onChange={e=>setLafUsed(e.target.checked)} className="w-4 h-4 rounded border-slate-300"/>
              <span className="text-xs font-bold text-slate-700">LAF Cabinet Used</span>
            </label>
          </div>
        </div>

        {/* Contamination Check */}
        <div>
          <label className="field-label">Contamination Check</label>
          <div className="flex gap-2 mb-2">
            {['Clear','Suspected'].map(o=>(
              <button key={o} type="button" onClick={()=>setContCheck(o)}
                className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${contCheck===o?(o==='Clear'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                {o}
              </button>
            ))}
          </div>
          {contCheck === 'Suspected' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <textarea value={contNotes} onChange={e=>setContNotes(e.target.value)} rows={2} placeholder="Describe suspected contamination (visual signs, odour, timing)..." className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs font-semibold outline-none resize-none bg-white"/>
              {capaDevId
                ? <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>CAPA raised. <a href="/compliance" className="underline">Review in Compliance →</a></p>
                : <p className="text-xs text-red-600 font-bold">Saving will auto-raise a CAPA deviation for this contamination event.</p>
              }
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving?'Saving...':'Save Draft'}
          </button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading||!tZero} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Set T=0 → Fermentation
          </button>
        </div>
      </div>
    </div>
  );
}
