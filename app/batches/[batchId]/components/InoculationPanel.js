'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Droplets, AlertTriangle } from 'lucide-react';

const TRANSFER_METHODS = ['Pipette', 'Syringe', 'Sterile spoon'];

export default function InoculationPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const isInternOrRI = ['intern','research_intern'].includes(role);

  const [source,    setSource]    = useState('');
  const [inVol,     setInVol]     = useState('');
  const [plannedHr, setPlannedHr] = useState('');
  const [tZero,     setTZero]     = useState('');
  const [transfer,  setTransfer]  = useState('Pipette');
  const [lafUsed,   setLafUsed]   = useState(false);
  const [contCheck, setContCheck] = useState('Clear');
  const [contNotes, setContNotes] = useState('');

  const fetch = useCallback(async () => {
    if (!activeFlask) return;
    const { data: d } = await supabase.from('batch_flask_inoculations').select('*').eq('flask_id', activeFlask.id).single();
    if (d) {
      setSource(d.inoculum_source||''); 
      setInVol(d.inoculum_vol_ml||'');
      setPlannedHr(d.planned_fermentation_hrs||'');
      setTZero(d.t_zero_time ? d.t_zero_time.slice(0,16) : '');
      setTransfer(d.transfer_method||'Pipette'); 
      setLafUsed(d.laf_used||false);
      setContCheck(d.contamination_check||'Clear'); 
      setContNotes(d.contamination_notes||'');
    } else {
      setSource(''); setInVol(''); setPlannedHr(''); setTransfer('Pipette'); setLafUsed(false); setContCheck('Clear'); setContNotes('');
      // Default T=0 to current time for convenience
      const now = new Date();
      now.setSeconds(0,0);
      setTZero(now.toISOString().slice(0,16));
    }
  }, [activeFlask, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async (advance = false) => {
    if (!activeFlask) return;
    if (advance && !tZero) { toast.warn('T=0 inoculation time is required to advance.'); return; }
    if (advance && !plannedHr) { toast.warn('Please define a planned fermentation time.'); return; }
    
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_flask_inoculations').upsert({
        flask_id: activeFlask.id, batch_id: batch.id,
        inoculum_source: source || null,
        inoculum_vol_ml: inVol ? parseFloat(inVol) : null,
        planned_fermentation_hrs: plannedHr ? parseFloat(plannedHr) : null,
        t_zero_time: tZero ? new Date(tZero).toISOString() : null,
        transfer_method: transfer, laf_used: lafUsed,
        contamination_check: contCheck,
        contamination_notes: contCheck === 'Suspected' ? contNotes : null,
        operator_id: employeeProfile?.id,
      }, { onConflict: 'flask_id' });
      if (error) throw error;
      
      toast.success(advance ? `Trial ${activeFlask.flask_label} Inoculated. T=0 anchored.` : 'Draft saved.');
      if (advance && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage('fermentation');
      } else {
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
        {/* Source */}
        <div>
          <label className="field-label">Inoculum Source</label>
          <input value={source} onChange={e=>setSource(e.target.value)} className="field-input" placeholder="e.g. Back-slop from Batch 1002, or Isolate ISOL-001"/>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
        <div className="p-4 bg-navy/5 border-2 border-navy/30 rounded-2xl">
          <label className="block text-[11px] font-black uppercase tracking-wider text-navy mb-2">
            ⏱ T=0 — Inoculation Time for {activeFlask.flask_label}
          </label>
          <input type="datetime-local" value={tZero} onChange={e=>setTZero(e.target.value)}
            className="w-full px-4 py-3 border-2 border-navy/30 rounded-xl text-sm font-black font-mono text-navy bg-white outline-none focus:border-navy"/>
          <p className="text-[10px] text-navy/60 font-semibold mt-1.5">This sets the clock specifically for this trial.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <textarea value={contNotes} onChange={e=>setContNotes(e.target.value)} rows={2} placeholder="Describe suspected contamination..." className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs font-semibold outline-none resize-none bg-white"/>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
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
