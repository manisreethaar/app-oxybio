'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Beaker, AlertTriangle } from 'lucide-react';
import { syncStageToLNB } from '@/lib/lnbSync';

export default function MediaPrepPanel({ batch, employees, availableStock, employeeProfile, role, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast = useToast();
  const [data,   setData]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingOverride, setPendingOverride] = useState(null);
  const isIntern = ['intern','research_intern'].includes(role);
  const isF2 = batch.experiment_type === 'F2';

  // Parse formulation ingredient guide
  const formulationIngredients = (() => {
    try {
      const raw = batch.formulations?.ingredients;
      return Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    } catch { return []; }
  })();
  const ingByItemId = Object.fromEntries(formulationIngredients.map(i => [i.item_id, i]));

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
    let isCurrent = true;
    const { data: d } = await supabase.from('batch_stage_media_prep').select('*').eq('batch_id', batch.id).single();
    if (!isCurrent) return;
    if (d) {
      setData(d);
      setRagiLot(d.ragi_lot_id||''); setRagiWt(d.ragi_weight_g||'');
      setRagiMoist(d.ragi_moisture_pass===true?'Pass':d.ragi_moisture_pass===false?'Fail':'');
      setKavuniLot(d.kavuni_lot_id||''); setKavuniWt(d.kavuni_weight_g||'');
      setKavuniTemp(d.kavuni_precook_temp_c||''); setKavuniMin(d.kavuni_precook_min||'');
      setWaterVol(d.water_volume_ml||''); setTotalVol(d.total_volume_ml||'');
      setInitPH(d.initial_ph||''); setNotes(d.notes||'');
      setSupervisedBy(d.supervised_by||'');
    } else {
      // Pre-populate weights from formulation if no saved data
      for (const ing of formulationIngredients) {
        const nameLower = ing.name?.toLowerCase() || '';
        if (nameLower.includes('ragi'))   setRagiWt(String(ing.quantity || ''));
        if (nameLower.includes('kavuni')) setKavuniWt(String(ing.quantity || ''));
        if (nameLower.includes('water'))  setWaterVol(String(ing.quantity || ''));
      }
      if (batch.planned_volume_ml && batch.num_flasks) {
        setTotalVol(String(batch.planned_volume_ml * batch.num_flasks));
      }
    }
    return () => { isCurrent = false; };
  }, [batch.id, supabase]); // eslint-disable-line

  useEffect(() => { fetch(); }, [fetch]);

  const grainToWater = ragiWt && waterVol ? (parseFloat(waterVol)/parseFloat(ragiWt)).toFixed(2) : null;
  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  // Sort lots: recipe-matched items first, rest after a divider
  const sortedStock = (filterFn) => {
    const matched = availableStock.filter(filterFn);
    const others  = availableStock.filter(s => !filterFn(s));
    return { matched, others };
  };
  const ragiMatch   = s => formulationIngredients.some(i => i.item_id === s.item_id || i.item_id === s.inventory_items?.id) && s.inventory_items?.name?.toLowerCase().includes('ragi');
  const kavuniMatch = s => formulationIngredients.some(i => i.item_id === s.item_id || i.item_id === s.inventory_items?.id) && s.inventory_items?.name?.toLowerCase().includes('kavuni');
  const ragiStock   = sortedStock(ragiMatch);
  const kavuniStock = sortedStock(kavuniMatch);

  const deductLot = async (lotId, weightG, label) => {
    if (!lotId || !weightG) return;
    const qty = parseFloat(weightG);
    const { data: stockRow } = await supabase
      .from('inventory_stock')
      .select('current_quantity, inventory_items(name, unit, min_stock_level)')
      .eq('id', lotId).single();
    if (!stockRow) { toast.warn(`${label}: lot not found in inventory.`); return; }
    const shortfall = qty - parseFloat(stockRow.current_quantity);
    const newQty = Math.max(0, parseFloat(stockRow.current_quantity) - qty);
    if (shortfall > 0) toast.warn(`${label}: used ${qty}g but only ${parseFloat(stockRow.current_quantity).toFixed(1)}g available — inventory set to 0.`);
    await supabase.from('inventory_stock')
      .update({ current_quantity: newQty, status: newQty <= 0 ? 'Out of Stock' : undefined })
      .eq('id', lotId);

    // Auto-create procurement task if stock drops below minimum
    const minLevel = parseFloat(stockRow.inventory_items?.min_stock_level || 0);
    if (minLevel > 0 && newQty < minLevel) {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      supabase.from('tasks').insert({
        title: `Restock: ${stockRow.inventory_items?.name || label} — below minimum`,
        description: `Batch ${batch.batch_id} media prep used ${qty}${stockRow.inventory_items?.unit || 'g'}. Remaining: ${newQty.toFixed(1)} (min: ${minLevel}). Please reorder.`,
        priority: 'high', status: 'todo',
        batch_id: batch.id,
        assigned_by: employeeProfile?.id,
        due_date: tomorrow.toISOString().slice(0, 10),
      }).then(() => {}).catch(() => {});
      toast.warn(`${label} below minimum stock — procurement task created.`);
    }
    await supabase.from('inventory_movements').insert({
      stock_id:        lotId,
      movement_type:   'Batch Deduction',
      quantity:        qty,
      batch_reference: batch.batch_id,
      issued_by:       employeeProfile?.id,
      notes:           `Media Prep: ${batch.batch_id} — ${label}`,
    }).then(()=>{}).catch(()=>{});
    // Record usage in inventory_usage for cross-module traceability
    await supabase.from('inventory_usage').insert({
      stock_id:      lotId,
      batch_id:      batch.id,
      quantity_used: qty,
      logged_by:     employeeProfile?.id,
    }).then(()=>{}).catch(()=>{});
  };

  const handleSave = async (advance = false) => {
    if (isIntern && !supervisedBy) { toast.warn('Select a supervisor.'); return; }
    if (ragiMoist === 'Fail') {
      setPendingOverride(advance);
      return;
    }
    await executeSave(advance);
  };

  const confirmOverride = async () => {
    const advance = pendingOverride;
    setPendingOverride(null);
    await executeSave(advance);
  };

  const executeSave = async (advance = false) => {
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
      }, { onConflict: 'batch_id' });
      if (error) throw error;

      if (advance) {
        await Promise.all([
          deductLot(ragiLot,   ragiWt,   'Ragi'),
          deductLot(kavuniLot, kavuniWt, 'Karuppu Kavuni'),
        ]);
      }

      toast.success(advance ? 'Media Prep complete. Inventory updated.' : 'Draft saved.');
      syncStageToLNB(supabase, batch.id, 'media_prep', {
        ragi_lot_id: ragiLot || null,
        ragi_weight_g: ragiWt ? parseFloat(ragiWt) : null,
        ragi_moisture: ragiMoist || null,
        kavuni_lot_id: kavuniLot || null,
        kavuni_weight_g: kavuniWt ? parseFloat(kavuniWt) : null,
        kavuni_precook_temp_c: kavuniTemp ? parseFloat(kavuniTemp) : null,
        kavuni_precook_min: kavuniMin ? parseFloat(kavuniMin) : null,
        water_volume_ml: waterVol ? parseFloat(waterVol) : null,
        total_volume_ml: totalVol ? parseFloat(totalVol) : null,
        initial_ph: initPH ? parseFloat(initPH) : null,
      });
      if (advance) {
        await onAdvanceStage('sterilisation');
      } else {
        onDataSaved();
      }
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

      {formulationIngredients.length > 0 && (
        <div className="surface p-4 border border-indigo-100 bg-indigo-50/30">
          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700 mb-2">
            Recipe: {batch.formulations?.name} ({batch.formulations?.code})
          </p>
          <div className="flex flex-wrap gap-3">
            {formulationIngredients.map(ing => (
              <div key={ing.item_id} className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-indigo-100">
                <span className="text-xs font-bold text-indigo-800">{ing.name}</span>
                <span className="text-xs font-black text-indigo-600">{ing.quantity}{ing.unit}</span>
                <span className="text-[9px] text-indigo-400 uppercase font-bold">target</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="surface p-5 space-y-5">
        {/* Ragi Section */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 mb-3">Ragi (Finger Millet)</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="field-label">Lot Number</label>
              <select value={ragiLot} onChange={e=>setRagiLot(e.target.value)} className="field-input">
                <option value="">Select lot...</option>
                {ragiStock.matched.length > 0 && <option disabled>── Recipe match ──</option>}
                {ragiStock.matched.map(s=>(
                  <option key={s.id} value={s.id}>★ {s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'} | {s.current_quantity}{s.inventory_items?.unit}</option>
                ))}
                {ragiStock.others.length > 0 && <option disabled>── Other lots ──</option>}
                {ragiStock.others.map(s=>(
                  <option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'} | {s.current_quantity}{s.inventory_items?.unit}</option>
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
                  {kavuniStock.matched.length > 0 && <option disabled>── Recipe match ──</option>}
                  {kavuniStock.matched.map(s=>(
                    <option key={s.id} value={s.id}>★ {s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'} | {s.current_quantity}{s.inventory_items?.unit}</option>
                  ))}
                  {kavuniStock.others.length > 0 && <option disabled>── Other lots ──</option>}
                  {kavuniStock.others.map(s=>(
                    <option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'} | {s.current_quantity}{s.inventory_items?.unit}</option>
                  ))}
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

      {/* Override Modal */}
      {pendingOverride !== null && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Safety Override</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Ragi moisture check failed. Please ensure you log a Process Deviation before continuing. Proceed anyway?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingOverride(null)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmOverride}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition w-full"
              >
                ⚠ Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
