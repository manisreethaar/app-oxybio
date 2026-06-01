'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
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
  // G-04: CAPA linkage for contamination
  const [capaDevId, setCapaDevId] = useState(null);
  const [raisingCapa, setRaisingCapa] = useState(false);

  // Load available cell bank vials when source type switches to cell_bank
  useEffect(() => {
    if (sourceType !== 'cell_bank') return;
    setVialsLoading(true);
    fetch('/api/research/cell-bank/vials?status=Available')
      .then(r => r.json())
      .then(j => { if (j.success) setAvailVials(j.data || []); })
      .catch(() => {})
      .finally(() => setVialsLoading(false));
  }, [sourceType]);

  const fetchRecord = useCallback(() => {
    if (!activeFlask?.id) return;
    supabase.from('batch_flask_inoculations').select('*').eq('flask_id', activeFlask.id).single()
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
        } else {
          setSourceType('other'); setSource(''); setVialId(''); setInVol(''); setPlannedHr('');
          setTransfer('Pipette'); setLafUsed(false); setContCheck('Clear'); setContNotes('');
          setTZero('');
        }
      });
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

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Inoculation details.</div>;

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3 border-l-4 border-l-blue-500">
        <Droplets className="w-5 h-5 text-blue-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Inoculation: <span className="text-blue-600">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-gray-500">Define the independent starter source and timeline for this specific trial.</p></div>
      </div>

      <div className="surface p-5 space-y-4">
        {/* Source Type */}
        <div>
          <label className="field-label">Inoculum Source Type</label>
          <div className="flex gap-2">
            {SOURCE_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setSourceType(t.value)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${sourceType === t.value ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cell Bank Vial picker */}
        {sourceType === 'cell_bank' && (
          <div className="space-y-2">
            <label className="field-label flex items-center gap-1"><Dna className="w-3.5 h-3.5 text-indigo-600"/> Cell Bank Vial</label>
            {vialsLoading ? (
              <div className="field-input text-gray-400 text-xs">Loading available vials...</div>
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
                      {v.vial_code} — {strain?.name || 'Unknown strain'} ({prep?.type} {prep?.prep_code}) · {v.storage_temp}
                    </option>
                  );
                })}
              </select>
            )}
            {selectedVial && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs space-y-1">
                <p className="font-black text-indigo-800">{selectedVial.vial_code}</p>
                <p className="text-indigo-700 font-semibold">{selectedVial.cell_bank_preparations?.cell_bank_strains?.name}</p>
                <p className="text-indigo-600">{selectedVial.cell_bank_preparations?.type} · {selectedVial.cell_bank_preparations?.prep_code} · Stored at {selectedVial.storage_temp}</p>
                {selectedVial.freezer_id && <p className="text-indigo-500">Freezer: {selectedVial.freezer_id} / Rack {selectedVial.rack} / Box {selectedVial.box}</p>}
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
            <input type="number" step="0.1" value={plannedHr} onChange={e=>setPlannedHr(e.target.value)} className="field-input" placeholder="e.g. 12"/>
            <p className="text-[9px] text-gray-400 mt-1">User-defined threshold for alerting</p>
          </div>
        </div>

        {/* T=0 */}
        <div className="p-4 border-2 border-navy/30 rounded-2xl bg-navy/5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-navy mb-2">
            ⏱ T=0 — Inoculation Time for {activeFlask.flask_label}
          </label>
          <input type="datetime-local" value={tZero} onChange={e=>setTZero(e.target.value)}
            className="w-full px-4 py-3 border-2 border-navy/30 rounded-xl text-sm font-black font-mono text-navy bg-white outline-none focus:border-navy"/>
          {tZero && new Date(tZero) < new Date(batch.created_at || batch.start_time) ? (
            <p className="text-[10px] text-amber-600 font-bold mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3"/>Retrospective entry — T=0 is before this batch was created in OxyOS. This is valid for historical data.
            </p>
          ) : (
            <p className="text-[10px] text-navy/60 font-semibold mt-1.5">This sets the clock specifically for this trial.</p>
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
              <input type="checkbox" checked={lafUsed} onChange={e=>setLafUsed(e.target.checked)} className="w-4 h-4 rounded border-gray-300"/>
              <span className="text-xs font-bold text-gray-700">LAF Cabinet Used</span>
            </label>
          </div>
        </div>

        {/* Contamination Check */}
        <div>
          <label className="field-label">Contamination Check</label>
          <div className="flex gap-2 mb-2">
            {['Clear','Suspected'].map(o=>(
              <button key={o} type="button" onClick={()=>setContCheck(o)}
                className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${contCheck===o?(o==='Clear'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                {o}
              </button>
            ))}
          </div>
          {contCheck === 'Suspected' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <textarea value={contNotes} onChange={e=>setContNotes(e.target.value)} rows={2} placeholder="Describe suspected contamination (visual signs, odour, timing)..." className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs font-semibold outline-none resize-none bg-white"/>
              {capaDevId
                ? <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>CAPA raised. <a href="/compliance" className="underline">Review in Compliance →</a></p>
                : <p className="text-[10px] text-red-600 font-bold">Saving will auto-raise a CAPA deviation for this contamination event.</p>
              }
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
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
