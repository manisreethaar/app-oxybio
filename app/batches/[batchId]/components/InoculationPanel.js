'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Droplets, AlertTriangle } from 'lucide-react';

const INOCU_TYPES = ['Fresh Curd', 'Back-slop', 'Pure Lactobacillus Isolate'];
const TRANSFER_METHODS = ['Pipette', 'Syringe', 'Sterile spoon'];

export default function InoculationPanel({ batch, flasks, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [pastBatches, setPastBatches] = useState([]);
  const [mediaPrepData, setMediaPrepData] = useState(null);
  const isInternOrRI = ['intern','research_intern'].includes(role);

  const [inType,    setInType]    = useState('Fresh Curd');
  const [sourceNotes, setSourceNotes] = useState('');
  const [sourceBatch, setSourceBatch] = useState('');
  const [inVol,     setInVol]     = useState('');
  const [inTemp,    setInTemp]    = useState('');
  const [tZero,     setTZero]     = useState('');
  const [transfer,  setTransfer]  = useState('Pipette');
  const [lafUsed,   setLafUsed]   = useState(false);
  const [contCheck, setContCheck] = useState('Clear');
  const [contNotes, setContNotes] = useState('');
  const [notes,     setNotes]     = useState('');
  const [supervisedBy, setSupervisedBy] = useState('');

  const fetch = useCallback(async () => {
    const [dRes, mpRes, pbRes] = await Promise.all([
      supabase.from('batch_stage_inoculation').select('*').eq('batch_id', batch.id).single(),
      supabase.from('batch_stage_media_prep').select('total_volume_ml').eq('batch_id', batch.id).single(),
      supabase.from('batches').select('id, batch_id').in('status', ['released']).order('created_at', { ascending: false }).limit(20),
    ]);
    if (dRes.data) {
      const d = dRes.data;
      setInType(d.inoculum_type||'Fresh Curd'); setSourceNotes(d.inoculum_source_notes||'');
      setSourceBatch(d.backslop_source_batch||''); setInVol(d.inoculum_vol_ml||'');
      setInTemp(d.inoculation_temp_c||''); setTZero(d.t_zero_time ? d.t_zero_time.slice(0,16) : '');
      setTransfer(d.transfer_method||'Pipette'); setLafUsed(d.laf_used||false);
      setContCheck(d.contamination_check||'Clear'); setContNotes(d.contamination_notes||'');
      setNotes(d.notes||''); setSupervisedBy(d.supervised_by||'');
    }
    if (!tZero) {
      const now = new Date();
      now.setSeconds(0,0);
      setTZero(now.toISOString().slice(0,16));
    }
    if (mpRes.data) setMediaPrepData(mpRes.data);
    if (pbRes.data) setPastBatches(pbRes.data);
  }, [batch.id, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const totalVol = mediaPrepData?.total_volume_ml || batch.planned_volume_ml;
  const inPct    = inVol && totalVol ? ((parseFloat(inVol) / parseFloat(totalVol)) * 100).toFixed(2) : null;
  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  const handleSave = async (advance = false) => {
    if (advance && !tZero) { toast.warn('T=0 inoculation time is required to advance.'); return; }
    if (isInternOrRI && !supervisedBy) { toast.warn('Select a supervisor before saving.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_stage_inoculation').upsert({
        batch_id: batch.id, inoculum_type: inType,
        backslop_source_batch: inType === 'Back-slop' ? sourceBatch || null : null,
        inoculum_source_notes: sourceNotes || null,
        inoculum_vol_ml: inVol ? parseFloat(inVol) : null,
        inoculation_pct: inPct ? parseFloat(inPct) : null,
        inoculation_temp_c: inTemp ? parseFloat(inTemp) : null,
        t_zero_time: tZero ? new Date(tZero).toISOString() : null,
        transfer_method: transfer, laf_used: lafUsed,
        contamination_check: contCheck,
        contamination_notes: contCheck === 'Suspected' ? contNotes : null,
        operator_id: employeeProfile?.id, supervised_by: supervisedBy || null, notes: notes || null,
      });
      if (error) throw error;
      toast.success(advance ? 'Inoculation complete. T=0 recorded.' : 'Draft saved.');
      onDataSaved();
      if (advance) onAdvanceStage('fermentation');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <Droplets className="w-5 h-5 text-blue-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Inoculation</h2>
          <p className="text-xs text-gray-500">Record starter culture addition. T=0 anchors all fermentation readings.</p></div>
      </div>

      <div className="surface p-5 space-y-4">
        {/* Inoculum Type */}
        <div>
          <label className="field-label">Inoculum Type</label>
          <div className="flex flex-wrap gap-2">
            {INOCU_TYPES.map(t => (
              <button key={t} type="button" onClick={()=>setInType(t)}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${inType===t?'bg-navy text-white border-navy':'bg-white text-gray-600 border-gray-200 hover:border-navy'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Conditional source fields */}
        {inType === 'Back-slop' && (
          <div><label className="field-label">Source Batch ID</label>
            <select value={sourceBatch} onChange={e=>setSourceBatch(e.target.value)} className="field-input">
              <option value="">Select source batch...</option>
              {pastBatches.map(b=><option key={b.id} value={b.id}>{b.batch_id}</option>)}
            </select>
          </div>
        )}
        {inType !== 'Back-slop' && (
          <div><label className="field-label">{inType === 'Fresh Curd' ? 'Curd Preparation Date / Notes' : 'Isolate ID'}</label>
            <input value={sourceNotes} onChange={e=>setSourceNotes(e.target.value)} className="field-input" placeholder={inType==='Fresh Curd'?'e.g. Prepared 31-Mar-2026':'e.g. ISOL-LB-001'}/>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Inoculum Volume (ml)</label>
            <input type="number" step="0.1" value={inVol} onChange={e=>setInVol(e.target.value)} className="field-input" placeholder="12.5"/>
            {inPct && <p className="text-[10px] text-navy font-bold mt-1">= {inPct}% v/v inoculation rate</p>}
          </div>
          <div>
            <label className="field-label">Substrate Temp at Inoculation (°C)</label>
            <input type="number" step="0.1" value={inTemp} onChange={e=>setInTemp(e.target.value)} className="field-input" placeholder="37.0"/>
          </div>
        </div>

        {/* T=0 — prominent */}
        <div className="p-4 bg-navy/5 border-2 border-navy/30 rounded-2xl">
          <label className="block text-[11px] font-black uppercase tracking-wider text-navy mb-2">
            ⏱ T=0 — Inoculation Time (Fermentation Anchor)
          </label>
          <input type="datetime-local" value={tZero} onChange={e=>setTZero(e.target.value)}
            className="w-full px-4 py-3 border-2 border-navy/30 rounded-xl text-sm font-black font-mono text-navy bg-white outline-none focus:border-navy"/>
          <p className="text-[10px] text-navy/60 font-semibold mt-1.5">All fermentation reading timestamps will be calculated from this moment.</p>
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
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-red-600"/><span className="text-xs font-bold text-red-800">Contamination suspected — describe observation:</span></div>
              <textarea value={contNotes} onChange={e=>setContNotes(e.target.value)} rows={2} placeholder="Describe suspected contamination..." className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs font-semibold outline-none resize-none bg-white"/>
            </div>
          )}
        </div>

        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Additional notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 font-semibold">
          📓 Tip: Add an LNB (Lab Notebook) entry for this inoculation to document observations.
        </div>

        {isInternOrRI && (
          <div><label className="field-label text-red-500">Supervised By * <span className="text-gray-400 normal-case font-normal">(required for interns — GMP)</span></label>
            <select value={supervisedBy} onChange={e=>setSupervisedBy(e.target.value)} className="field-input border-red-200 bg-white">
              <option value="">Select supervising scientist/fellow...</option>
              {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}

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
