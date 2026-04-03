'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { CheckCircle, Lock, ExternalLink } from 'lucide-react';

const STORAGE = ['2-8°C', 'Below -18°C', 'Ambient (15-25°C)'];

export default function ReleasePanel({ batch, employeeProfile, role, supabase, onDataSaved }) {
  const toast    = useToast();
  const [record, setRecord]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [pendingRelease, setPendingRelease] = useState(false);
  const isCeo    = ['ceo','admin'].includes(role);

  const [finalVol,   setFinalVol]   = useState('');
  const [storage,    setStorage]    = useState('2-8°C');
  const [location,   setLocation]   = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('batch_release_record').select('*').eq('batch_id', batch.id).single();
    if (data) { setRecord(data); setFinalVol(data.final_volume_ml||''); setStorage(data.storage_condition||'2-8°C'); setLocation(data.storage_location||''); setReleaseNotes(data.release_notes||''); }
  }, [batch.id, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    if (!isCeo) return;
    setPendingRelease(true);
  };

  const confirmRelease = async () => {
    setPendingRelease(false);
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_release_record').upsert({
        batch_id: batch.id, released_by: employeeProfile?.id,
        final_volume_ml: finalVol ? parseFloat(finalVol) : null,
        storage_condition: storage, storage_location: location || null,
        release_notes: releaseNotes || null,
      }, { onConflict: 'batch_id' });
      if (error) throw error;
      // Auto-create shelf-life record
      await supabase.from('shelf_life_records').insert({
        batch_id: batch.id, batch_code: batch.batch_id,
        product_name: batch.sku_target || 'Fermented Beverage',
        manufacture_date: new Date().toISOString().slice(0,10),
        storage_condition: storage, status: 'Active',
        notes: `Auto-created on batch release from OxyOS Batch Monitor.`,
      }).then(()=>{}).catch(e=>console.warn('Shelf-life create warning:', e.message));
      toast.success('Batch released. Shelf-life record created.');
      onDataSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Batch Released</h2>
          <p className="text-xs text-gray-500">Final disposition — batch cleared all QC gates and approved for use.</p></div>
      </div>

      {record && (
        <div className="surface p-5 space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2"/>
            <p className="text-sm font-black text-emerald-800">Released by {record.released_by ? 'CEO' : '—'}</p>
            <p className="text-xs text-emerald-600">{record.released_at ? new Date(record.released_at).toLocaleString('en-IN') : ''}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Final Volume</p><p className="font-black text-gray-800">{record.final_volume_ml || '—'} ml</p></div>
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Storage</p><p className="font-black text-gray-800">{record.storage_condition}</p></div>
            <div className="p-3 bg-gray-50 rounded-xl col-span-2"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Location</p><p className="font-black text-gray-800">{record.storage_location || '—'}</p></div>
          </div>
          {record.bmr_url && <a href={record.bmr_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 bg-navy text-white font-bold rounded-xl text-xs uppercase tracking-wider"><ExternalLink className="w-3.5 h-3.5"/>View BMR PDF</a>}
        </div>
      )}

      {!record && (
        <div className="surface p-5 space-y-4">
          {!isCeo ? (
            <div className="p-6 bg-gray-50 rounded-2xl text-center">
              <Lock className="w-8 h-8 text-gray-300 mx-auto mb-3"/>
              <p className="text-sm font-bold text-gray-600">Release authority restricted to CEO</p>
              <p className="text-xs text-gray-400 mt-1">This batch passed QC and is awaiting CEO release decision.</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-gray-900">Complete release record:</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Final Volume (ml)</label><input type="number" step="1" value={finalVol} onChange={e=>setFinalVol(e.target.value)} className="field-input" placeholder="200"/></div>
                <div><label className="field-label">Storage Condition</label>
                  <select value={storage} onChange={e=>setStorage(e.target.value)} className="field-input bg-white">
                    {STORAGE.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="field-label">Storage Location</label><input value={location} onChange={e=>setLocation(e.target.value)} className="field-input" placeholder="e.g. Batch Fridge, Shelf B2"/></div>
              </div>
              <textarea value={releaseNotes} onChange={e=>setReleaseNotes(e.target.value)} rows={2} placeholder="Release notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 font-semibold">
                ℹ On save: Shelf-life record will be created automatically.
              </div>
              <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-50">
                {saving ? 'Releasing...' : '✓ Confirm Release'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Release Modal */}
      {pendingRelease && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Batch Release</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Confirm batch release? This will officially lock the record, create a shelf-life record, and CANNOT be undone.</p>
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
