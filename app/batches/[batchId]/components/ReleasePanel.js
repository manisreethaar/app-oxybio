'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { CheckCircle, Lock, AlertTriangle, Loader, FileText, Package } from 'lucide-react';

export default function ReleasePanel({ batch, activeFlask, employeeProfile, role, supabase, onDataSaved, batchId }) {
  const toast = useToast();
  const [record,      setRecord]      = useState(null);
  const [sensoryData, setSensoryData] = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [releaseError, setReleaseError] = useState(null);
  // A-39: QA Head / admin / ceo can release
  const isCeo = ['ceo','admin','cto','research_fellow'].includes(role);
  const isQaAuthorised = ['ceo','admin','cto'].includes(role); // labelling sign-off requires higher authority

  const [yieldVol, setYieldVol] = useState('');
  const [bottles,  setBottles]  = useState('');
  const [botVol,   setBotVol]   = useState('');
  const [notes,    setNotes]    = useState('');

  // G-16: SKU / formulation linkage
  const [formulationId, setFormulationId] = useState('');
  const [skuName,       setSkuName]       = useState('');
  const [formulations,  setFormulations]  = useState([]);

  // G-14: E-signature confirmation
  const [esigInput, setEsigInput] = useState('');
  const esigValid = esigInput.trim().toUpperCase() === 'RELEASE';

  // A-17: Labelling verification
  const [labelBatchNo,    setLabelBatchNo]    = useState('');
  const [labelMfd,        setLabelMfd]        = useState('');
  const [labelBbd,        setLabelBbd]        = useState('');
  const [labelVerified,   setLabelVerified]   = useState(false);
  const [packIntegrity,   setPackIntegrity]   = useState('Not Checked');
  const [fillWeightG,     setFillWeightG]     = useState('');

  // A-15: Batch cost inputs
  const [matCost,  setMatCost]  = useState('');
  const [labCost,  setLabCost]  = useState('');
  const [ovhCost,  setOvhCost]  = useState('');
  const [costSaved, setCostSaved] = useState(false);

  // G-09/G-13: Release certificate modal
  const [showCert, setShowCert] = useState(false);

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
      setFormulationId(relRes.data.formulation_id || '');
      setSkuName(relRes.data.sku_name || '');
    } else {
      setRecord(null);
      setYieldVol(''); setBottles(''); setBotVol(''); setNotes('');
      setFormulationId(''); setSkuName('');
    }
  }, [activeFlask?.id, activeFlask?.current_stage, supabase]);

  useEffect(() => { setRecord(null); loadRecord(); }, [loadRecord]);

  useEffect(() => {
    supabase.from('formulations')
      .select('id, name, code')
      .eq('status', 'Approved')
      .order('name')
      .then(({ data }) => setFormulations(data || []));
  }, [supabase]);

  const handleRelease = async () => {
    setReleaseError(null);
    if (!esigValid) { toast.warn('Type RELEASE in the confirmation field to proceed.'); return; }
    setSaving(true);
    try {
      const targetBatchId = batchId || batch?.id;
      if (!targetBatchId || !activeFlask?.id) throw new Error('Missing batch or flask ID');

      const res = await fetch(`/api/batches/${targetBatchId}/release`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flask_id:           activeFlask.id,
          yield_volume_ml:    yieldVol ? parseFloat(yieldVol) : null,
          bottles_produced:   bottles  ? parseInt(bottles)    : null,
          bottle_volume_ml:   botVol   ? parseFloat(botVol)   : null,
          release_notes:      notes || null,
          // G-16
          formulation_id:     formulationId || null,
          sku_name:           skuName || null,
          // G-14: e-sig timestamp
          esig_confirmed_at:  new Date().toISOString(),
          // A-17: labelling
          label_verified:      labelVerified,
          label_batch_number:  labelBatchNo || null,
          label_mfd:           labelMfd || null,
          label_bbd:           labelBbd || null,
          pack_integrity_check: packIntegrity,
          fill_weight_g:       fillWeightG ? parseFloat(fillWeightG) : null,
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
    <div className="p-4 text-center text-slate-400">Select a Trial to view Release decision.</div>
  );

  return (
    <div className="space-y-5">

      {/* G-13: Release Certificate Print Modal */}
      {showCert && record && (
        <div className="fixed inset-0 z-50 bg-slate-50/10 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 print:hidden">
              <h3 className="text-base font-black text-slate-900">Batch Release Certificate — Preview</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider">Print / Save PDF</button>
                <button onClick={() => setShowCert(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider">Close</button>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="text-center border-b-2 border-slate-900 pb-4">
                <p className="text-2xl font-black text-slate-900 uppercase tracking-widest">OXYGEN BIOINNOVATIONS</p>
                <p className="text-sm font-bold text-slate-500 mt-0.5">Probiotic Fermentation Products · Chennai, India</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black uppercase tracking-widest text-slate-900 border-2 border-slate-900 inline-block px-6 py-2">BATCH RELEASE CERTIFICATE</p>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border border-slate-200 rounded-xl p-4">
                {[
                  ['Batch ID', batch.batch_id || batch.id],
                  ['Trial / Flask', activeFlask.flask_label],
                  ['SKU / Product', record.sku_name || '—'],
                  ['Formulation', formulations.find(f=>f.id===record.formulation_id)?.name || '—'],
                  ['Yield Volume', record.yield_volume_ml ? `${record.yield_volume_ml} ml` : '—'],
                  ['Bottles Produced', record.bottles_produced || '—'],
                  ['Release Date', record.release_date ? new Date(record.release_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
                  ['Released By', employeeProfile?.full_name || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-2">
                    <span className="font-black text-slate-500 w-36 shrink-0 text-xs uppercase">{label}:</span>
                    <span className="font-bold text-slate-900 text-xs">{val}</span>
                  </div>
                ))}
              </div>
              {record.release_notes && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black text-slate-500 uppercase mb-1">Release Notes</p>
                  <p className="text-sm text-slate-700">{record.release_notes}</p>
                </div>
              )}
              <div className="p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-center">
                <p className="text-lg font-black uppercase tracking-widest text-emerald-800">RELEASED FOR USE / DISTRIBUTION</p>
                <p className="text-xs text-emerald-600 mt-1">E-signature confirmed at {record.esig_confirmed_at ? new Date(record.esig_confirmed_at).toLocaleString('en-IN') : '—'}</p>
              </div>
              {/* G-15: Inventory status note */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 shrink-0"/>
                Inventory Status Transition: <span className="font-black">Quarantine → Released</span> · Flask status updated in OxyOS.
              </div>
              <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-200 text-xs">
                <div className="space-y-6">
                  <div className="border-b border-slate-400 pb-1"><p className="text-slate-400">Released By</p></div>
                  <div className="border-b border-slate-400 pb-1"><p className="text-slate-400">Date</p></div>
                </div>
                <div className="space-y-6">
                  <div className="border-b border-slate-400 pb-1"><p className="text-slate-400">QA Head Approval</p></div>
                  <div className="border-b border-slate-400 pb-1"><p className="text-slate-400">Date</p></div>
                </div>
              </div>
              <p className="text-[9px] text-slate-300 text-center">Generated by OxyOS — Oxygen Bioinnovations Internal Lab Management System.</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card p-5 flex items-center gap-3 border-l-4 border-l-emerald-500">
        <CheckCircle className="w-5 h-5 text-emerald-600"/>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Trial Released: <span className="text-emerald-600">{activeFlask.flask_label}</span>
          </h2>
          <p className="text-xs text-slate-500">Final disposition — trial cleared all QC gates and approved for use/distribution.</p>
        </div>
      </div>

      {/* Already released — show record */}
      {record && (
        <div className="card p-5 space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2"/>
            <p className="text-sm font-black text-emerald-800">Released</p>
            <p className="text-xs text-emerald-600">
              {record.release_date ? new Date(record.release_date).toLocaleString('en-IN') : ''}
            </p>
            {record.sku_name && <p className="text-xs text-emerald-700 font-bold mt-1">SKU: {record.sku_name}</p>}
          </div>

          {/* G-15: Inventory transition indicator */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
            <Package className="w-4 h-4 shrink-0"/>
            Inventory Status: <span className="ml-1 px-2 py-0.5 bg-slate-600 text-white rounded-full text-[10px] font-black">RELEASED</span>
            <span className="text-slate-600 font-semibold ml-1">(transitioned from Quarantine on release)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-slate-400 font-bold uppercase text-[9px] mb-1">Yield Vol</p>
              <p className="font-black text-slate-800">{record.yield_volume_ml || '—'} ml</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-slate-400 font-bold uppercase text-[9px] mb-1">Bottles</p>
              <p className="font-black text-slate-800">{record.bottles_produced || '—'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-slate-400 font-bold uppercase text-[9px] mb-1">Bottle Vol</p>
              <p className="font-black text-slate-800">{record.bottle_volume_ml || '—'} ml</p>
            </div>
          </div>

          {/* G-13: Print Release Certificate */}
          <button onClick={() => setShowCert(true)}
            className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2">
            <FileText className="w-3.5 h-3.5"/>Print Release Certificate
          </button>
        </div>
      )}

      {/* Release form */}
      {!record && (
        <div className="card p-5 space-y-4">
          {!isCeo ? (
            <div className="p-6 bg-slate-50 rounded-2xl text-center">
              <Lock className="w-8 h-8 text-slate-300 mx-auto mb-3"/>
              <p className="text-sm font-bold text-slate-600">Release authority restricted to CEO / Admin</p>
              <p className="text-xs text-slate-400 mt-1">This trial passed QC and is awaiting CEO release decision.</p>
            </div>
          ) : (
            <>
              {sensoryData?.overall === 'PASS' && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <p className="text-xs font-bold text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4"/> Sensory Evaluation Passed
                  </p>
                  <p className="text-[10px] text-emerald-600 mt-1">
                    Aroma: {sensoryData.aroma || 'N/A'} · Texture: {sensoryData.texture || 'N/A'} · Colour: {sensoryData.colour || 'N/A'}
                  </p>
                </div>
              )}

              <p className="text-sm font-bold text-slate-900">Complete release record for {activeFlask.flask_label}:</p>

              {/* G-16: SKU / Formulation linkage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Product Formulation (SKU)</label>
                  <select value={formulationId} onChange={e => {
                    setFormulationId(e.target.value);
                    const f = formulations.find(f => f.id === e.target.value);
                    if (f) setSkuName(f.code ? `${f.code} — ${f.name}` : f.name);
                  }} className="field-input bg-white">
                    <option value="">Select formulation...</option>
                    {formulations.map(f => (
                      <option key={f.id} value={f.id}>{f.code ? `[${f.code}] ` : ''}{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">SKU / Product Name</label>
                  <input value={skuName} onChange={e => setSkuName(e.target.value)} className="field-input" placeholder="e.g. OXY-PROB-001 Ragi Probiotic"/>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"
              />

              {/* G-64: Yield calculation vs planned */}
              {yieldVol && batch.planned_volume_ml && (
                <div className={`p-3 rounded-xl border text-xs font-semibold ${
                  (parseFloat(yieldVol) / (batch.planned_volume_ml * (batch.num_flasks||1)) * 100) >= 85
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <p className="font-black mb-0.5">Yield Analysis</p>
                  <p>Planned: <strong>{batch.planned_volume_ml * (batch.num_flasks||1)} ml</strong> · Actual: <strong>{yieldVol} ml</strong></p>
                  <p>Yield efficiency: <strong>{((parseFloat(yieldVol) / (batch.planned_volume_ml * (batch.num_flasks||1))) * 100).toFixed(1)}%</strong>
                    {((parseFloat(yieldVol) / (batch.planned_volume_ml * (batch.num_flasks||1))) * 100) < 85 && ' ⚠ Below 85% target'}
                  </p>
                </div>
              )}
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

              {/* G-15: Inventory transition notice */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 shrink-0"/>
                On release: flask status transitions <span className="font-black mx-1">Quarantine → Released</span> in inventory.
              </div>

              {/* A-17: Labelling Verification */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <p className="text-xs font-black text-slate-900 uppercase tracking-wider">Labelling Verification</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="field-label">Label Batch Number</label>
                    <input value={labelBatchNo} onChange={e => setLabelBatchNo(e.target.value)} className="field-input" placeholder="As printed on label"/>
                  </div>
                  <div>
                    <label className="field-label">MFD on Label</label>
                    <input type="date" value={labelMfd} onChange={e => setLabelMfd(e.target.value)} className="field-input"/>
                  </div>
                  <div>
                    <label className="field-label">BBD on Label</label>
                    <input type="date" value={labelBbd} onChange={e => setLabelBbd(e.target.value)} className="field-input"/>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Pack Integrity</label>
                    <div className="flex gap-2">
                      {['Pass','Fail','Not Checked'].map(o => (
                        <button key={o} type="button" onClick={() => setPackIntegrity(o)}
                          className={`flex-1 py-1.5 text-xs font-black rounded-lg border transition-all ${packIntegrity===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':o==='Fail'?'bg-red-600 text-white border-red-600':'bg-slate-500 text-white border-slate-500'):'bg-white text-slate-500 border-slate-200'}`}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Fill Weight (g)</label>
                    <input type="number" step="0.1" value={fillWeightG} onChange={e => setFillWeightG(e.target.value)} className="field-input" placeholder="Target vs actual"/>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={labelVerified} onChange={e => setLabelVerified(e.target.checked)} className="w-4 h-4 rounded border-slate-300"/>
                  <span className="text-xs font-bold text-slate-800">Labelling verified — batch number, MFD, BBD, net weight, and declarations are correct</span>
                </label>
                {packIntegrity === 'Fail' && <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Pack integrity failure — do not release until seal/closure issue is resolved.</p>}
              </div>

              {/* A-15: Batch Cost */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
                <p className="text-xs font-black text-emerald-900 uppercase tracking-wider">Batch Cost (COGS)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="field-label">Material Costs (₹)</label><input type="number" step="0.01" value={matCost} onChange={e=>setMatCost(e.target.value)} className="field-input" placeholder="0.00"/></div>
                  <div><label className="field-label">Labor Costs (₹)</label><input type="number" step="0.01" value={labCost} onChange={e=>setLabCost(e.target.value)} className="field-input" placeholder="0.00"/></div>
                  <div><label className="field-label">Overhead Costs (₹)</label><input type="number" step="0.01" value={ovhCost} onChange={e=>setOvhCost(e.target.value)} className="field-input" placeholder="0.00"/></div>
                </div>
                {(matCost || labCost || ovhCost) && (
                  <p className="text-xs font-black text-emerald-800">Total COGS: ₹{((parseFloat(matCost)||0)+(parseFloat(labCost)||0)+(parseFloat(ovhCost)||0)).toFixed(2)}</p>
                )}
                <button type="button" onClick={async () => {
                  const targetId = batchId || batch?.id;
                  if (!targetId) return;
                  const res = await fetch('/api/batch-costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: targetId, material_costs: matCost, labor_costs: labCost, overhead_costs: ovhCost }) });
                  if ((await res.json()).success) { setCostSaved(true); }
                }} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider">
                  {costSaved ? '✓ Cost Saved' : 'Save COGS'}
                </button>
              </div>

              {/* G-14: E-signature confirmation */}
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2">
                <p className="text-xs font-black text-amber-900 uppercase tracking-wider">Electronic Signature Required</p>
                <p className="text-xs text-amber-700">Type <span className="font-black font-mono bg-amber-100 px-1.5 py-0.5 rounded">RELEASE</span> to confirm your authorised release decision for {activeFlask.flask_label}.</p>
                <input
                  value={esigInput} onChange={e => setEsigInput(e.target.value)}
                  placeholder="Type RELEASE to confirm"
                  className={`w-full px-4 py-3 border-2 rounded-xl font-black font-mono text-sm outline-none transition-all ${esigValid ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-white text-slate-800'}`}
                />
                {esigValid && <p className="text-xs text-emerald-700 font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5"/>E-signature confirmed — release authorised</p>}
              </div>

              {/* Error display */}
              {releaseError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/>
                  <p className="text-xs font-bold text-red-800">{releaseError}</p>
                </div>
              )}

              <button
                onClick={handleRelease}
                disabled={saving || !esigValid}
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
