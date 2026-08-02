'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useToast } from '@/context/ToastContext';
import { FlaskConical, Plus, Loader2, Play, CheckCircle, Clock } from 'lucide-react';
import { toLocalDatetime, nowDatetimeLocal } from '@/lib/dates';

export default function SeedTrainManager({ targetType, targetId, onSuccess }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  
  const [passages, setPassages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vials, setVials] = useState([]);
  
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  
  const [form, setForm] = useState({
    passage_number: 1,
    vial_id: '',
    source_passage_id: '',
    media_name: '',
    media_volume_ml: '',
    inoculum_volume_ml: '',
    incubation_temperature_c: '37',
    incubation_agitation_rpm: '150',
    target_od: '',
    target_ph: '',
    notes: '',
  });

  const fetchPassages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('seed_passages')
        .select(`
          *,
          cell_bank_vials:vial_id (id, vial_code)
        `)
        .eq(targetType === 'batch' ? 'target_batch_id' : 'target_growth_study_id', targetId)
        .order('passage_number', { ascending: true });
        
      if (error) throw error;
      setPassages(data || []);
      
      // Fetch available vials directly via supabase client (avoids cookie-auth issues on Vercel)
      try {
        const { data: vialData, error: vialErr } = await supabase
          .from('cell_bank_vials')
          .select('id, vial_code, status, cell_bank_preparations!preparation_id(id, prep_code, cell_bank_strains(name))')
          .eq('status', 'Available')
          .order('vial_code', { ascending: true });
        if (!vialErr && vialData) {
          setVials(vialData.map(v => ({ id: v.id, label: v.vial_code })));
        } else {
          console.error('Vials fetch error:', vialErr?.message);
          setVials([]);
        }
      } catch (e) {
        console.error('Failed to load vials:', e);
        setVials([]);
      }
    } catch (err) {
      toast.error('Failed to load seed train: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, targetType, targetId, toast]);

  useEffect(() => {
    fetchPassages();
  }, [fetchPassages]);

  const handleStartPassage = (passageNum, sourcePassageId = null) => {
    setForm({
      passage_number: passageNum,
      vial_id: '',
      source_passage_id: sourcePassageId || '',
      media_name: '',
      media_volume_ml: '',
      inoculum_volume_ml: '',
      incubation_temperature_c: '37',
      incubation_agitation_rpm: '150',
      target_od: '',
      target_ph: '',
      notes: '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.media_name || !form.media_volume_ml) {
      toast.error('Media name and volume are required.');
      return;
    }
    if (form.passage_number === 1 && !form.vial_id) {
      toast.error('Please select a starting vial for Seed 1.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/seed-passages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_batch_id: targetType === 'batch' ? targetId : null,
          target_growth_study_id: targetType === 'growth_study' ? targetId : null,
          ...form,
          vial_label: form.vial_id ? vials.find(v => v.id === form.vial_id)?.label : null
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast.success(`Seed Passage ${form.passage_number} started!`);
      setShowModal(false);
      fetchPassages();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const completePassage = async (id) => {
    try {
      const res = await fetch(`/api/seed-passages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Seed passage marked as completed.');
      fetchPassages();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-slate-400">Loading Seed Train...</div>;
  }

  const InputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent';
  const LabelCls = 'block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-slate-600"/> Seed Train
          </h3>
          <p className="text-xs text-slate-500">Manage inoculum scale-up passages prior to final inoculation.</p>
        </div>
        {!passages.length && (
          <button onClick={() => handleStartPassage(1)} className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 flex items-center gap-1">
            <Plus className="w-4 h-4"/> Start Seed 1
          </button>
        )}
      </div>

      {passages.length > 0 ? (
        <div className="space-y-3">
          {passages.map((p, idx) => (
            <div key={p.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                  <h4 className="font-bold text-slate-800">Seed Passage {p.passage_number}</h4>
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <p>Started: {toLocalDatetime(p.start_time)}</p>
                  <p>Media: <span className="font-medium text-slate-700">{p.media_name} ({p.media_volume_ml} ml)</span></p>
                  {p.vial_id && <p>Source Vial: {p.cell_bank_vials?.vial_code || 'Unknown'}</p>}
                  {p.target_od && <p>Target OD: {p.target_od} | Target pH: {p.target_ph}</p>}
                </div>
                {p.status === 'in_progress' && (
                  <p className="text-xs font-bold text-navy mt-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5"/> In incubation ({p.incubation_temperature_c}°C / {p.incubation_agitation_rpm} rpm)
                  </p>
                )}
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                {p.status === 'in_progress' && (
                  <button onClick={() => completePassage(p.id)} className="flex-1 md:flex-none px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 flex items-center justify-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5"/> Complete
                  </button>
                )}
                {p.status === 'completed' && idx === passages.length - 1 && (
                  <button onClick={() => handleStartPassage(p.passage_number + 1, p.id)} className="flex-1 md:flex-none px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 flex items-center justify-center gap-1">
                    <Plus className="w-3.5 h-3.5"/> Passage to Seed {p.passage_number + 1}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center">
          <p className="text-sm font-bold text-slate-600">No seed train active.</p>
          <p className="text-xs text-slate-400 mt-1">Start Seed 1 to begin passaging your isolate before inoculation.</p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-lg">Start Seed {form.passage_number}</h3>
              <p className="text-xs text-slate-500">Configure incubation parameters.</p>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {form.passage_number === 1 && (
                <div>
                  <label className={LabelCls}>Source Vial *</label>
                  <select className={InputCls} value={form.vial_id} onChange={e => setForm({...form, vial_id: e.target.value})}>
                    <option value="">Select vial...</option>
                    {vials.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={LabelCls}>Media Name *</label>
                  <input className={InputCls} value={form.media_name} onChange={e => setForm({...form, media_name: e.target.value})} placeholder="e.g. LB Broth" />
                </div>
                <div>
                  <label className={LabelCls}>Media Vol (ml) *</label>
                  <input type="number" className={InputCls} value={form.media_volume_ml} onChange={e => setForm({...form, media_volume_ml: e.target.value})} placeholder="100" />
                </div>
                <div>
                  <label className={LabelCls}>Inoculum Vol (ml)</label>
                  <input type="number" className={InputCls} value={form.inoculum_volume_ml} onChange={e => setForm({...form, inoculum_volume_ml: e.target.value})} placeholder="2" />
                </div>
                <div>
                  <label className={LabelCls}>Temp (°C)</label>
                  <input type="number" className={InputCls} value={form.incubation_temperature_c} onChange={e => setForm({...form, incubation_temperature_c: e.target.value})} />
                </div>
                <div>
                  <label className={LabelCls}>Agitation (rpm)</label>
                  <input type="number" className={InputCls} value={form.incubation_agitation_rpm} onChange={e => setForm({...form, incubation_agitation_rpm: e.target.value})} />
                </div>
                <div>
                  <label className={LabelCls}>Target OD</label>
                  <input type="number" step="0.1" className={InputCls} value={form.target_od} onChange={e => setForm({...form, target_od: e.target.value})} placeholder="0.8" />
                </div>
                <div>
                  <label className={LabelCls}>Target pH</label>
                  <input type="number" step="0.1" className={InputCls} value={form.target_ph} onChange={e => setForm({...form, target_ph: e.target.value})} placeholder="6.5" />
                </div>
              </div>
              <div>
                <label className={LabelCls}>Notes</label>
                <textarea className={InputCls} rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 bg-slate-50">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-white">Cancel</button>
              <button onClick={handleSave} disabled={creating} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-700">
                {creating ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Play className="w-4 h-4"/> Start</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
