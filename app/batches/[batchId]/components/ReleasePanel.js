'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { CheckCircle, Lock } from 'lucide-react';

export default function ReleasePanel({ batch, activeFlask, employeeProfile, role, supabase, onDataSaved }) {
  const toast    = useToast();
  const [record, setRecord]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [pendingRelease, setPendingRelease] = useState(false);
  const isCeo    = ['ceo','admin'].includes(role);

  const [yieldVol, setYieldVol] = useState('');
  const [bottles,  setBottles]  = useState('');
  const [botVol,   setBotVol]   = useState('');
  const [notes,    setNotes]    = useState('');

  const fetch = useCallback(async () => {
    if (!activeFlask) return;
    const { data } = await supabase.from('batch_flask_release_record').select('*').eq('flask_id', activeFlask.id).single();
    if (data) { 
      setRecord(data); 
      setYieldVol(data.yield_volume_ml||''); 
      setBottles(data.bottles_produced||''); 
      setBotVol(data.bottle_volume_ml||''); 
      setNotes(data.release_notes||''); 
    } else {
      setRecord(null);
      setYieldVol(''); setBottles(''); setBotVol(''); setNotes('');
    }
  }, [activeFlask, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    if (!isCeo) return;
    setPendingRelease(true);
  };

  const confirmRelease = async () => {
    if (!activeFlask) return;
    setPendingRelease(false);
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_flask_release_record').upsert({
        flask_id: activeFlask.id, batch_id: batch.id,
        released_by: employeeProfile?.id,
        yield_volume_ml: yieldVol ? parseFloat(yieldVol) : null,
        bottles_produced: bottles ? parseInt(bottles) : null,
        bottle_volume_ml: botVol ? parseFloat(botVol) : null,
        release_notes: notes || null,
      }, { onConflict: 'flask_id' });
      if (error) throw error;
      
      // Auto-create shelf-life record per flask
      await supabase.from('shelf_life_records').insert({
        batch_id: batch.id, batch_code: `${batch.batch_id}-${activeFlask.flask_label}`,
        product_name: batch.sku_target || 'Fermented Beverage',
        manufacture_date: new Date().toISOString().slice(0,10),
        storage_condition: '2-8°C', status: 'Active',
        notes: `Auto-created for trial ${activeFlask.flask_label} upon release.`,
      }).then(()=>{}).catch(e=>console.warn('Shelf-life create warning:', e.message));
      
      toast.success(`Trial ${activeFlask.flask_label} released.`);
      onDataSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Release decision.</div>;

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3 border-l-4 border-l-emerald-500">
        <CheckCircle className="w-5 h-5 text-emerald-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Trial Released: <span className="text-emerald-600">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-gray-500">Final disposition — trial cleared all QC gates and approved for use/distribution.</p></div>
      </div>

      {record && (
        <div className="surface p-5 space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2"/>
            <p className="text-sm font-black text-emerald-800">Released by {record.released_by ? 'CEO' : '—'}</p>
            <p className="text-xs text-emerald-600">{record.release_date ? new Date(record.release_date).toLocaleString('en-IN') : ''}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Yield Vol</p><p className="font-black text-gray-800">{record.yield_volume_ml || '—'} ml</p></div>
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Bottles</p><p className="font-black text-gray-800">{record.bottles_produced || '—'}</p></div>
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Bottle Vol</p><p className="font-black text-gray-800">{record.bottle_volume_ml || '—'} ml</p></div>
          </div>
        </div>
      )}

      {!record && (
        <div className="surface p-5 space-y-4">
          {!isCeo ? (
            <div className="p-6 bg-gray-50 rounded-2xl text-center">
              <Lock className="w-8 h-8 text-gray-300 mx-auto mb-3"/>
              <p className="text-sm font-bold text-gray-600">Release authority restricted to CEO</p>
              <p className="text-xs text-gray-400 mt-1">This trial passed QC and is awaiting CEO release decision.</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-gray-900">Complete release record for {activeFlask.flask_label}:</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">Yield Vol (ml)</label><input type="number" step="1" value={yieldVol} onChange={e=>setYieldVol(e.target.value)} className="field-input" placeholder="e.g. 850"/></div>
                <div><label className="field-label">Bottles Made</label><input type="number" step="1" value={bottles} onChange={e=>setBottles(e.target.value)} className="field-input" placeholder="e.g. 8"/></div>
                <div><label className="field-label">Bottle Vol (ml)</label><input type="number" step="1" value={botVol} onChange={e=>setBotVol(e.target.value)} className="field-input" placeholder="e.g. 100"/></div>
              </div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Release notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 font-semibold">
                ℹ On save: A specific shelf-life record for this trial will be generated.
              </div>
              <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-50">
                {saving ? 'Releasing...' : `✓ Confirm Release of ${activeFlask.flask_label}`}
              </button>
            </>
          )}
        </div>
      )}

      {pendingRelease && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Trial Release</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Confirm release for {activeFlask.flask_label}? This will lock the record and CANNOT be undone.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingRelease(false)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmRelease}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition w-full"
              >
                ✓ Confirm Release
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
