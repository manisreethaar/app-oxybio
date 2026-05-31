'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { CheckCircle, Lock, AlertTriangle, Loader } from 'lucide-react';

export default function ReleasePanel({ batch, activeFlask, employeeProfile, role, supabase, onDataSaved, batchId }) {
  const toast = useToast();
  const [record,      setRecord]      = useState(null);
  const [sensoryData, setSensoryData] = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [releaseError, setReleaseError] = useState(null);
  const isCeo = ['ceo','admin'].includes(role);

  const [yieldVol, setYieldVol] = useState('');
  const [bottles,  setBottles]  = useState('');
  const [botVol,   setBotVol]   = useState('');
  const [notes,    setNotes]    = useState('');

  const loadRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    const [relRes, epRes] = await Promise.all([
      supabase.from('batch_flask_release_record').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
      supabase.from('batch_flask_endpoints').select('*').eq('flask_id', activeFlask.id).maybeSingle()
    ]);
    if (epRes.data) {
      setSensoryData({
        overall: epRes.data.sensory_overall,
        aroma:   epRes.data.aroma,
        texture: epRes.data.texture,
        colour:  epRes.data.colour_description,
      });
    } else { setSensoryData(null); }

    if (relRes.data) {
      setRecord(relRes.data);
      setYieldVol(relRes.data.yield_volume_ml || '');
      setBottles(relRes.data.bottles_produced  || '');
      setBotVol(relRes.data.bottle_volume_ml   || '');
      setNotes(relRes.data.release_notes       || '');
    } else {
      setRecord(null);
      setYieldVol(''); setBottles(''); setBotVol(''); setNotes('');
    }
  }, [activeFlask?.id, activeFlask?.current_stage, supabase]);

  useEffect(() => { setRecord(null); loadRecord(); }, [loadRecord]);

  const handleRelease = async () => {
    setReleaseError(null);
    setSaving(true);
    try {
      const targetBatchId = batchId || batch?.id;
      if (!targetBatchId || !activeFlask?.id) throw new Error('Missing batch or flask ID');

      const res = await fetch(`/api/batches/${targetBatchId}/release`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flask_id:        activeFlask.id,
          yield_volume_ml: yieldVol ? parseFloat(yieldVol) : null,
          bottles_produced: bottles ? parseInt(bottles)    : null,
          bottle_volume_ml: botVol  ? parseFloat(botVol)   : null,
          release_notes:   notes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      toast.success(`Trial ${activeFlask.flask_label} released successfully.`);
      onDataSaved();

      // Auto-generate BMR in background
      fetch(`/api/batches/${targetBatchId}/bmr`)
        .then(r => r.json())
        .then(d => { if (d.success) toast.success('BMR saved to Document Vault.'); })
        .catch(() => {});

    } catch (err) {
      console.error('Release error:', err);
      setReleaseError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!activeFlask) return (
    <div className="p-4 text-center text-gray-400">Select a Trial to view Release decision.</div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="surface p-5 flex items-center gap-3 border-l-4 border-l-emerald-500">
        <CheckCircle className="w-5 h-5 text-emerald-600"/>
        <div>
          <h2 className="text-base font-bold text-gray-900">
            Trial Released: <span className="text-emerald-600">{activeFlask.flask_label}</span>
          </h2>
          <p className="text-xs text-gray-500">Final disposition — trial cleared all QC gates and approved for use/distribution.</p>
        </div>
      </div>

      {/* Already released — show record */}
      {record && (
        <div className="surface p-5 space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2"/>
            <p className="text-sm font-black text-emerald-800">Released</p>
            <p className="text-xs text-emerald-600">
              {record.release_date ? new Date(record.release_date).toLocaleString('en-IN') : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Yield Vol</p>
              <p className="font-black text-gray-800">{record.yield_volume_ml || '—'} ml</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Bottles</p>
              <p className="font-black text-gray-800">{record.bottles_produced || '—'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Bottle Vol</p>
              <p className="font-black text-gray-800">{record.bottle_volume_ml || '—'} ml</p>
            </div>
          </div>
        </div>
      )}

      {/* Release form */}
      {!record && (
        <div className="surface p-5 space-y-4">
          {!isCeo ? (
            <div className="p-6 bg-gray-50 rounded-2xl text-center">
              <Lock className="w-8 h-8 text-gray-300 mx-auto mb-3"/>
              <p className="text-sm font-bold text-gray-600">Release authority restricted to CEO / Admin</p>
              <p className="text-xs text-gray-400 mt-1">This trial passed QC and is awaiting CEO release decision.</p>
            </div>
          ) : (
            <>
              {sensoryData?.overall === 'PASS' && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <p className="text-xs font-bold text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4"/> Sensory Evaluation Passed
                  </p>
                  <p className="text-[10px] text-emerald-600 mt-1">
                    Aroma: {sensoryData.aroma || 'N/A'} • Texture: {sensoryData.texture || 'N/A'} • Colour: {sensoryData.colour || 'N/A'}
                  </p>
                </div>
              )}

              <p className="text-sm font-bold text-gray-900">Complete release record for {activeFlask.flask_label}:</p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Yield Vol (ml)</label>
                  <input type="number" step="1" value={yieldVol} onChange={e => setYieldVol(e.target.value)} className="field-input" placeholder="e.g. 850"/>
                </div>
                <div>
                  <label className="field-label">Bottles Made</label>
                  <input type="number" step="1" value={bottles} onChange={e => setBottles(e.target.value)} className="field-input" placeholder="e.g. 8"/>
                </div>
                <div>
                  <label className="field-label">Bottle Vol (ml)</label>
                  <input type="number" step="1" value={botVol} onChange={e => setBotVol(e.target.value)} className="field-input" placeholder="e.g. 100"/>
                </div>
              </div>

              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Release notes (optional)..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"
              />

              {(() => {
                const exp = new Date();
                exp.setDate(exp.getDate() + 90);
                return (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 font-semibold space-y-1">
                    <p>📅 Best Before: <span className="font-black">{exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span> (90 days)</p>
                    <p className="text-emerald-600">Shelf-life study (D7/D14/D30/D60/D90) will be auto-created on release.</p>
                  </div>
                );
              })()}

              {/* Error display */}
              {releaseError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/>
                  <p className="text-xs font-bold text-red-800">{releaseError}</p>
                </div>
              )}

              {/* Release button — direct submit, no modal */}
              <button
                onClick={handleRelease}
                disabled={saving}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving
                  ? <><Loader className="w-4 h-4 animate-spin"/> Releasing...</>
                  : `✓ Confirm Release of ${activeFlask.flask_label}`
                }
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
