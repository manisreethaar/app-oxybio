'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Filter } from 'lucide-react';

const METHODS  = ['Muslin cloth','Filter paper','Combined'];
const CLARITY  = ['Clear','Slightly turbid','Turbid'];
const TEMP_OPT = ['Room temp','Cold (refrigerated)'];

export default function StrainingPanel({ batch, flasks, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast    = useToast();
  const [saving, setSaving] = useState(false);
  const isIntern = ['intern','research_intern'].includes(role);

  const [method,    setMethod]    = useState('Muslin cloth');
  const [preVol,    setPreVol]    = useState('');
  const [postVol,   setPostVol]   = useState('');
  const [temp,      setTemp]      = useState('Room temp');
  const [colour,    setColour]    = useState('');
  const [clarity,   setClarity]   = useState('Clear');
  const [filtPh,    setFiltPh]    = useState('');
  const [flaskVols, setFlaskVols] = useState({});
  const [notes,     setNotes]     = useState('');
  const [supervisedBy, setSupervisedBy] = useState('');

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('batch_stage_straining').select('*').eq('batch_id', batch.id).single();
    if (data) {
      setMethod(data.method||'Muslin cloth'); setPreVol(data.pre_straining_vol_ml||'');
      setPostVol(data.post_straining_vol_ml||''); setTemp(data.straining_temp||'Room temp');
      setColour(data.filtrate_colour||''); setClarity(data.filtrate_clarity||'Clear');
      setFiltPh(data.filtrate_ph||''); setFlaskVols(data.flask_volumes||{});
      setNotes(data.notes||''); setSupervisedBy(data.supervised_by||'');
    }
  }, [batch.id, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const recovery = preVol && postVol ? ((parseFloat(postVol)/parseFloat(preVol))*100).toFixed(1) : null;
  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  const handleSave = async (advance = false) => {
    if (advance && !postVol) { toast.warn('Post-straining volume is required to advance.'); return; }
    if (isIntern && !supervisedBy) { toast.warn('Select a supervisor.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_stage_straining').upsert({
        batch_id: batch.id, method,
        pre_straining_vol_ml: preVol ? parseFloat(preVol) : null,
        post_straining_vol_ml: postVol ? parseFloat(postVol) : null,
        recovery_pct: recovery ? parseFloat(recovery) : null,
        straining_temp: temp, filtrate_colour: colour || null,
        filtrate_clarity: clarity, filtrate_ph: filtPh ? parseFloat(filtPh) : null,
        flask_volumes: flaskVols,
        operator_id: employeeProfile?.id, supervised_by: supervisedBy || null,
        notes: notes || null,
      });
      if (error) throw error;
      toast.success(advance ? 'Straining complete.' : 'Draft saved.');
      onDataSaved();
      if (advance) onAdvanceStage('extract_addition');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <Filter className="w-5 h-5 text-amber-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Straining / Separation</h2>
          <p className="text-xs text-gray-500">Separate fermented liquid from grain solids using muslin cloth.</p></div>
      </div>

      <div className="surface p-5 space-y-4">
        {/* Method */}
        <div>
          <label className="field-label">Straining Method</label>
          <div className="flex gap-2">
            {METHODS.map(m=>(
              <button key={m} type="button" onClick={()=>setMethod(m)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${method===m?'bg-amber-600 text-white border-amber-600':'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Volumes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Pre-Straining Volume (ml)</label>
            <input type="number" step="1" value={preVol} onChange={e=>setPreVol(e.target.value)} className="field-input" placeholder="250"/>
          </div>
          <div>
            <label className="field-label">Post-Straining Recovered (ml)</label>
            <input type="number" step="1" value={postVol} onChange={e=>setPostVol(e.target.value)} className="field-input" placeholder="0"/>
          </div>
        </div>
        {recovery && (
          <div className={`p-3 rounded-xl text-center border ${parseFloat(recovery)>60?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-200'}`}>
            <p className={`text-2xl font-black ${parseFloat(recovery)>60?'text-emerald-700':'text-amber-700'}`}>{recovery}%</p>
            <p className={`text-[10px] font-bold uppercase ${parseFloat(recovery)>60?'text-emerald-600':'text-amber-600'}`}>Recovery Rate</p>
          </div>
        )}

        {/* Per-flask volumes */}
        {flasks.length > 1 && (
          <div>
            <label className="field-label">Per-Flask Recovered Volume (ml)</label>
            <div className="space-y-2">
              {flasks.filter(f=>f.status!=='rejected').map(f=>(
                <div key={f.id} className="flex items-center gap-3">
                  <span className="text-sm font-black text-navy w-8">{f.flask_label}</span>
                  <input type="number" step="1"
                    value={flaskVols[f.id]||''} onChange={e=>setFlaskVols(p=>({...p,[f.id]:e.target.value}))}
                    placeholder="ml recovered" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none"/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtrate properties */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Straining Temperature</label>
            <select value={temp} onChange={e=>setTemp(e.target.value)} className="field-input bg-white">
              {TEMP_OPT.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Filtrate pH</label>
            <input type="number" step="0.01" value={filtPh} onChange={e=>setFiltPh(e.target.value)} className="field-input" placeholder="4.30"/>
          </div>
          <div>
            <label className="field-label">Filtrate Colour</label>
            <input value={colour} onChange={e=>setColour(e.target.value)} className="field-input" placeholder="e.g. Reddish-purple, translucent"/>
          </div>
          <div>
            <label className="field-label">Filtrate Clarity</label>
            <select value={clarity} onChange={e=>setClarity(e.target.value)} className="field-input bg-white">
              {CLARITY.map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {isIntern && (
          <div><label className="field-label text-red-500">Supervised By *</label>
            <select value={supervisedBy} onChange={e=>setSupervisedBy(e.target.value)} className="field-input border-red-200 bg-white">
              <option value="">Select supervisor...</option>
              {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}

        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Straining notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">Save Draft</button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading||!postVol} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Complete → Extract Addition
          </button>
        </div>
      </div>
    </div>
  );
}
