'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Filter, CheckCircle2 } from 'lucide-react';

const METHODS = ['Double-layered muslin cloth', 'Nylon mesh 100μm', 'Stainless steel sieve (fine)', 'Centrifugation'];
const CLARITY_OPTS = ['Very clear, transparent', 'Slightly cloudy', 'Moderately turbid', 'Highly turbid / opaque'];
const TEMP_OPTS = ['Room Temperature (22-26°C)', 'Cold Room (≤8°C)'];

export default function StrainingPanel({ batch, activeFlask, employees, employeeProfile, role, canDo, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [record,  setRecord]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const isIntern = ['intern','research_intern'].includes(role);

  // Form State
  const [method,        setMethod]       = useState(METHODS[0]);
  const [preVol,        setPreVol]       = useState('');
  const [postVol,       setPostVol]      = useState('');
  const [temp,          setTemp]         = useState(TEMP_OPTS[0]);
  const [colour,        setColour]       = useState('Reddish-purple');
  const [clarity,       setClarity]      = useState(CLARITY_OPTS[0]);
  const [ph,            setPh]           = useState('');
  const [notes,         setNotes]        = useState('');
  const [supervisedBy,  setSupervisedBy] = useState('');

  const fetchRecord = useCallback(async () => {
    if (!activeFlask) return;
    const { data } = await supabase.from('batch_flask_straining').select('*').eq('flask_id', activeFlask.id).single();
    if (data) setRecord(data);
  }, [activeFlask, supabase]);

  useEffect(() => { fetchRecord(); }, [fetchRecord]);

  const handleSave = async (advance = false) => {
    if (!activeFlask) return;
    if (advance && (!preVol || !postVol || !ph)) {
      toast.warn('Please fill all required numeric fields (Pre/Post vol, pH) to advance.'); return;
    }
    if (isIntern && advance && !supervisedBy) { toast.warn('Select a supervisor before advancing.'); return; }
    
    setSaving(true);
    try {
      const preV = preVol ? parseFloat(preVol) : null;
      const postV = postVol ? parseFloat(postVol) : null;
      const recovery = preV && postV ? (postV / preV) * 100 : null;

      const payload = {
        flask_id: activeFlask.id, batch_id: batch.id,
        method, straining_temp: temp, filtrate_colour: colour, filtrate_clarity: clarity,
        pre_straining_vol_ml: preV,
        post_straining_vol_ml: postV,
        recovery_pct: recovery ? parseFloat(recovery.toFixed(2)) : null,
        filtrate_ph: ph ? parseFloat(ph) : null,
        notes, operator_id: employeeProfile?.id,
        supervised_by: supervisedBy || null,
      };

      const { error } = await supabase.from('batch_flask_straining').upsert(payload, { onConflict: 'flask_id' });
      if (error) throw error;
      
      toast.success(advance ? `Trial ${activeFlask.flask_label} Straining Complete.` : 'Draft saved.');
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

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Straining.</div>;

  return (
    <div className="space-y-5">
      <div className="surface p-5 border-l-4 border-l-amber-500">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-5 h-5 text-amber-600"/>
          <h2 className="text-base font-bold text-gray-900">Straining: <span className="text-amber-600">{activeFlask.flask_label}</span></h2>
        </div>
        <p className="text-xs text-gray-500">Log straining records and filtrate recovery for this specific trial.</p>
        
        {record && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600"/><span className="text-xs font-bold text-emerald-800">Record saved. Recovery: {record.recovery_pct}%</span>
          </div>
        )}
      </div>

      <div className="surface p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="field-label">Pre-Straining Volume (ml)</label>
            <input type="number" value={preVol} onChange={e=>setPreVol(e.target.value)} className="field-input" placeholder="e.g. 500"/>
          </div>
          <div><label className="field-label">Post-Straining Volume (ml)</label>
            <input type="number" value={postVol} onChange={e=>setPostVol(e.target.value)} className="field-input" placeholder="e.g. 450"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="field-label">Straining Method</label>
            <select value={method} onChange={e=>setMethod(e.target.value)} className="field-input bg-white">
              {METHODS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div><label className="field-label">Temperature Condition</label>
            <select value={temp} onChange={e=>setTemp(e.target.value)} className="field-input bg-white">
              {TEMP_OPTS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="field-label">Filtrate Colour</label>
            <input value={colour} onChange={e=>setColour(e.target.value)} className="field-input" placeholder="Reddish-purple"/>
          </div>
          <div><label className="field-label">Filtrate Clarity</label>
            <select value={clarity} onChange={e=>setClarity(e.target.value)} className="field-input bg-white text-xs">
              {CLARITY_OPTS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div><label className="field-label">Filtrate pH</label>
            <input type="number" step="0.01" value={ph} onChange={e=>setPh(e.target.value)} className="field-input" placeholder="4.35"/>
          </div>
        </div>
        
        {isIntern && !record && (
          <div><label className="field-label text-red-500">Supervised By (Required for Juniors)</label>
            <select value={supervisedBy} onChange={e=>setSupervisedBy(e.target.value)} required className="field-input bg-white border-red-200">
              <option value="">Select supervisor...</option>
              {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}
        
        <div><label className="field-label">Notes</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} className="field-input" placeholder="Any observed losses or spillage..."/>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving?'Saving...': record ? 'Update Draft' : 'Save Draft'}
          </button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Advance Trial → Extract Addition
          </button>
        </div>
      </div>
    </div>
  );
}
