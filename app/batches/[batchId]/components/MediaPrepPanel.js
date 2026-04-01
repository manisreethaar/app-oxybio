'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Beaker, AlertTriangle } from 'lucide-react';

export default function MediaPrepPanel({ batch, employees, availableStock, employeeProfile, role, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast = useToast();
  const [data,   setData]   = useState(null);
  const [saving, setSaving] = useState(false);
  const isIntern = ['intern','research_intern'].includes(role);
  const isF2 = batch.experiment_type === 'F2';

  const [ragiLot,    setRagiLot]    = useState('');
  const [ragiWt,     setRagiWt]     = useState('');
  const [ragiMoist,  setRagiMoist]  = useState('');
  const [kavuniLot,  setKavuniLot]  = useState('');
  const [kavuniWt,   setKavuniWt]   = useState('');
  const [kavuniTemp, setKavuniTemp] = useState('');
  const [kavuniMin,  setKavuniMin]  = useState('');
  const [waterVol,   setWaterVol]   = useState('');
  const [totalVol,   setTotalVol]   = useState('');
  const [initPH,     setInitPH]     = useState('');
  const [notes,      setNotes]      = useState('');
  const [supervisedBy, setSupervisedBy] = useState('');

  const fetch = useCallback(async () => {
    const { data: d } = await supabase.from('batch_stage_media_prep').select('*').eq('batch_id', batch.id).single();
    if (d) {
      setData(d);
      setRagiLot(d.ragi_lot_id||''); setRagiWt(d.ragi_weight_g||'');
      setRagiMoist(d.ragi_moisture_pass===true?'Pass':d.ragi_moisture_pass===false?'Fail':'');
      setKavuniLot(d.kavuni_lot_id||''); setKavuniWt(d.kavuni_weight_g||'');
      setKavuniTemp(d.kavuni_precook_temp_c||''); setKavuniMin(d.kavuni_precook_min||'');
      setWaterVol(d.water_volume_ml||''); setTotalVol(d.total_volume_ml||'');
      setInitPH(d.initial_ph||''); setNotes(d.notes||'');
      setSupervisedBy(d.supervised_by||'');
    }
  }, [batch.id, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const grainToWater = ragiWt && waterVol ? (parseFloat(waterVol)/parseFloat(ragiWt)).toFixed(2) : null;
  const stock = availableStock.filter(s => s.inventory_items?.category?.toLowerCase().includes('grain') || s.inventory_items?.name?.toLowerCase().includes('ragi') || s.inventory_items?.name?.toLowerCase().includes('kavuni'));
  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  // ── Deduct a lot's quantity from inventory_stock ────────────
  const deductLot = async (lotId, weightG, label) => {
    if (!lotId || !weightG) return;
    const qty = parseFloat(weightG);
    const { data: stock } = await supabase
      .from('inventory_stock').select('current_quantity').eq('id', lotId).single();
    if (!stock) { toast.warn(`${label}: lot not found in inventory.`); return; }
    const shortfall = qty - parseFloat(stock.current_quantity);
    const newQty = Math.max(0, parseFloat(stock.current_quantity) - qty);
    if (shortfall > 0) toast.warn(`${label}: used ${qty}g but only ${parseFloat(stock.current_quantity).toFixed(1)}g available — inventory set to 0.`);
    await supabase.from('inventory_stock')
      .update({ current_quantity: newQty, status: newQty <= 0 ? 'Out of Stock' : undefined })
      .eq('id', lotId);
    await supabase.from('inventory_movements').insert({
      stock_id:       lotId,
      movement_type:  'Batch Deduction',
      quantity:       qty,
      batch_reference: batch.batch_id,
      issued_by:      employeeProfile?.id,
      notes:          `Media Prep: ${batch.batch_id} — ${label}`,
    }).then(()=>{}).catch(()=>{});
  };

  const handleSave = async (advance = false) => {
    if (isIntern && !supervisedBy) { toast.warn('Select a supervisor.'); return; }
    if (ragiMoist === 'Fail' && !confirm('Ragi moisture check failed — log deviation before continuing?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_stage_media_prep').upsert({
        batch_id: batch.id,
        ragi_lot_id: ragiLot || null, ragi_weight_g: ragiWt ? parseFloat(ragiWt) : null,
        ragi_moisture_pass: ragiMoist === 'Pass' ? true : ragiMoist === 'Fail' ? false : null,
        kavuni_lot_id: kavuniLot || null, kavuni_weight_g: kavuniWt ? parseFloat(kavuniWt) : null,
        kavuni_precook_temp_c: kavuniTemp ? parseFloat(kavuniTemp) : null,
        kavuni_precook_min: kavuniMin ? parseFloat(kavuniMin) : null,
        water_volume_ml: waterVol ? parseFloat(waterVol) : null,
        total_volume_ml: totalVol ? parseFloat(totalVol) : null,
        initial_ph: initPH ? parseFloat(initPH) : null,
        is_complete: advance, operator_id: employeeProfile?.id,
        supervised_by: supervisedBy || null, notes: notes || null,
      });
      if (error) throw error;

      // ── Inventory deduction on advance only (not draft saves) ──
      if (advance) {
        await Promise.all([
          deductLot(ragiLot,   ragiWt,   'Ragi'),
          deductLot(kavuniLot, kavuniWt, 'Karuppu Kavuni'),
        ]);
      }

      toast.success(advance ? 'Media Prep complete. Inventory updated.' : 'Draft saved.');
      onDataSaved();
      if (advance) onAdvanceStage('sterilisation');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <Beaker className="w-5 h-5 text-indigo-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Media Preparation</h2>
          <p className="text-xs text-gray-500">Record all raw material weighing and substrate setup.</p></div>
        {data?.is_complete && <span className="ml-auto px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black rounded-lg uppercase">Complete</span>}
      </div>

      <div className="surface p-5 space-y-5">
        {/* Ragi Section */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 mb-3">Ragi (Finger Millet)</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="field-label">Lot Number</label>
              <select value={ragiLot} onChange={e=>setRagiLot(e.target.value)} className="field-input">
                <option value="">Select lot...</option>
                {availableStock.filter(s=>s.inventory_items?.name?.toLowerCase().includes('ragi')).map(s=>(
                  <option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'} | {s.current_quantity}{s.inventory_items?.unit}</option>
                ))}
                {availableStock.filter(s=>!s.inventory_items?.name?.toLowerCase().includes('ragi')).map(s=>(
                  <option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Weight Used (g)</label>
              <input type="number" step="0.1" value={ragiWt} onChange={e=>setRagiWt(e.target.value)} className="field-input" placeholder="0.0"/>
            </div>
          </div>
          <div>
            <label className="field-label">Moisture Check</label>
            <div className="flex gap-2">
              {['Pass','Fail'].map(o=>(
                <button key={o} type="button" onClick={()=>setRagiMoist(o)}
                  className={`flex-1 py-2 text-xs font-black rounded-lg border transition-all ${ragiMoist===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                  {o}
                </button>
              ))}
              <button type="button" onClick={()=>setRagiMoist('')} className={`px-3 text-xs font-bold rounded-lg border transition-all ${!ragiMoist?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-400 border-gray-200'}`}>N/A</button>
            </div>
            {ragiMoist==='Fail' && <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Moisture check failed — log deviation before advancing.</p>}
          </div>
        </div>

        {/* Kavuni Section (F2 only) */}
        {isF2 && (
          <div className="border-t border-gray-100 pt-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 mb-3">Karuppu Kavuni (F2)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Kavuni Lot</label>
                <select value={kavuniLot} onChange={e=>setKavuniLot(e.target.value)} className="field-input">
                  <option value="">Select lot...</option>
                  {availableStock.map(s=><option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'}</option>)}
                </select>
              </div>
              <div><label className="field-label">Weight Used (g)</label><input type="number" step="0.1" value={kavuniWt} onChange={e=>setKavuniWt(e.target.value)} className="field-input" placeholder="0.0"/></div>
              <div><label className="field-label">Pre-cook Temp (°C)</label><input type="number" step="0.1" value={kavuniTemp} onChange={e=>setKavuniTemp(e.target.value)} className="field-input" placeholder="90.0"/></div>
              <div><label className="field-label">Pre-cook Duration (min)</label><input type="number" value={kavuniMin} onChange={e=>setKavuniMin(e.target.value)} className="field-input" placeholder="30"/></div>
            </div>
          </div>
        )}

        {/* Common fields */}
        <div className="border-t border-gray-100 pt-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Water Volume (ml)</label>
              <input type="number" step="1" value={waterVol} onChange={e=>setWaterVol(e.target.value)} className="field-input" placeholder="0"/>
              {grainToWater && <p className="text-[10px] text-gray-400 mt-1">Grain:Water ratio → 1:{grainToWater}</p>}
            </div>
            <div><label className="field-label">Total Volume Prepared (ml)</label><input type="number" step="1" value={totalVol} onChange={e=>setTotalVol(e.target.value)} className="field-input" placeholder="250"/></div>
          </div>
          <div className="mt-3">
            <label className="field-label">Initial pH of Slurry <span className="text-gray-400">(pre-fermentation)</span></label>
            <input type="number" step="0.01" value={initPH} onChange={e=>setInitPH(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-2xl font-black font-mono text-center focus:border-navy outline-none" placeholder="6.00"/>
          </div>
        </div>

        {isIntern && (
          <div><label className="field-label text-red-500">Supervised By *</label>
            <select value={supervisedBy} onChange={e=>setSupervisedBy(e.target.value)} className="field-input border-red-200">
              <option value="">Select supervisor...</option>
              {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Notes / observations..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading||ragiMoist==='Fail'} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Complete → Sterilisation
          </button>
        </div>
      </div>
    </div>
  );
}
