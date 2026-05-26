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

  const formulationIngredients = (() => {
    try {
      const raw = batch.formulations?.ingredients;
      return Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    } catch { return []; }
  })();

  const baseVol = batch.formulations?.base_volume_ml || 1000;
  const targetVol = (batch.planned_volume_ml || 0) * (batch.num_flasks || 1) || baseVol;
  const scaleFactor = targetVol / baseVol;

  const [bomUsage, setBomUsage] = useState({});

  const [ragiMoist,  setRagiMoist]  = useState('');
  const [kavuniTemp, setKavuniTemp] = useState('');
  const [kavuniMin,  setKavuniMin]  = useState('');
  const [waterVol,   setWaterVol]   = useState('');
  const [totalVol,   setTotalVol]   = useState('');
  const [initPH,     setInitPH]     = useState('');
  const [notes,      setNotes]      = useState('');
  const [supervisedBy, setSupervisedBy] = useState('');

  // Initialize BOM usage state from ingredients
  useEffect(() => {
    setBomUsage(prev => {
      const next = { ...prev };
      formulationIngredients.forEach(ing => {
        if (!next[ing.item_id]) next[ing.item_id] = { lotId: '', usedQty: '' };
      });
      return next;
    });
  }, [formulationIngredients]);

  const fetch = useCallback(async () => {
    let isCurrent = true;
    const { data: d } = await supabase.from('batch_stage_media_prep').select('*').eq('batch_id', batch.id).single();
    if (!isCurrent) return;
    if (d) {
      setData(d);
      setRagiMoist(d.ragi_moisture_pass===true?'Pass':d.ragi_moisture_pass===false?'Fail':'');
      setKavuniTemp(d.kavuni_precook_temp_c||''); setKavuniMin(d.kavuni_precook_min||'');
      setWaterVol(d.water_volume_ml||''); setTotalVol(d.total_volume_ml||'');
      setInitPH(d.initial_ph||''); setNotes(d.notes||'');
      setSupervisedBy(d.supervised_by||'');

      // Recover legacy usage state from db if available
      setBomUsage(prev => {
        const next = { ...prev };
        formulationIngredients.forEach(ing => {
          const nameLower = ing.name?.toLowerCase() || '';
          if (nameLower.includes('ragi') && d.ragi_lot_id) {
            next[ing.item_id] = { lotId: d.ragi_lot_id, usedQty: d.ragi_weight_g ? String(d.ragi_weight_g) : '' };
          }
          if (nameLower.includes('kavuni') && d.kavuni_lot_id) {
            next[ing.item_id] = { lotId: d.kavuni_lot_id, usedQty: d.kavuni_weight_g ? String(d.kavuni_weight_g) : '' };
          }
        });
        return next;
      });

    } else {
      if (batch.planned_volume_ml && batch.num_flasks) {
        setTotalVol(String(batch.planned_volume_ml * batch.num_flasks));
      }
      for (const ing of formulationIngredients) {
        const nameLower = ing.name?.toLowerCase() || '';
        const scaledQty = ((parseFloat(ing.quantity) || 0) * scaleFactor).toFixed(2);
        const displayQty = String(parseFloat(scaledQty));
        if (nameLower.includes('water')) setWaterVol(displayQty);
      }
    }
    return () => { isCurrent = false; };
  }, [batch.id, supabase]); // eslint-disable-line

  useEffect(() => { fetch(); }, [fetch]);

  const getUsageFor = (nameSubstring) => {
    const ing = formulationIngredients.find(i => i.name?.toLowerCase().includes(nameSubstring));
    if (!ing) return { lot: '', wt: null };
    const u = bomUsage[ing.item_id];
    return { lot: u?.lotId || null, wt: u?.usedQty ? parseFloat(u.usedQty) : null };
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

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
    if (shortfall > 0) toast.warn(`${label}: used ${qty} but only ${parseFloat(stockRow.current_quantity).toFixed(1)} available — inventory set to 0.`);
    await supabase.from('inventory_stock')
      .update({ current_quantity: newQty, status: newQty <= 0 ? 'Out of Stock' : undefined })
      .eq('id', lotId);

    // Auto-create procurement task if stock drops below minimum
    const minLevel = parseFloat(stockRow.inventory_items?.min_stock_level || 0);
    if (minLevel > 0 && newQty < minLevel) {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      supabase.from('tasks').insert({
        title: `Restock: ${stockRow.inventory_items?.name || label} — below minimum`,
        description: `Batch ${batch.batch_id} media prep used ${qty}${stockRow.inventory_items?.unit || ''}. Remaining: ${newQty.toFixed(1)} (min: ${minLevel}). Please reorder.`,
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
      notes:           `Media Prep BOM trace: ${batch.batch_id} — ${label}`,
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
      const ragiU = getUsageFor('ragi');
      const kavuniU = getUsageFor('kavuni');

      const { error } = await supabase.from('batch_stage_media_prep').upsert({
        batch_id: batch.id,
        ragi_lot_id: ragiU.lot, ragi_weight_g: ragiU.wt,
        ragi_moisture_pass: ragiMoist === 'Pass' ? true : ragiMoist === 'Fail' ? false : null,
        kavuni_lot_id: kavuniU.lot, kavuni_weight_g: kavuniU.wt,
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
        const deductions = formulationIngredients.map(ing => {
           const u = bomUsage[ing.item_id];
           if (u && u.lotId && u.usedQty) {
              return deductLot(u.lotId, u.usedQty, ing.name);
           }
           return Promise.resolve();
        });
        await Promise.all(deductions);
      }

      toast.success(advance ? 'Media Prep complete. BOM Inventory deducted.' : 'Draft saved.');
      syncStageToLNB(supabase, batch.id, 'media_prep', {
        ragi_lot_id: ragiU.lot,
        ragi_weight_g: ragiU.wt,
        ragi_moisture: ragiMoist || null,
        kavuni_lot_id: kavuniU.lot,
        kavuni_weight_g: kavuniU.wt,
        kavuni_precook_temp_c: kavuniTemp ? parseFloat(kavuniTemp) : null,
        kavuni_precook_min: kavuniMin ? parseFloat(kavuniMin) : null,
        water_volume_ml: waterVol ? parseFloat(waterVol) : null,
        total_volume_ml: totalVol ? parseFloat(totalVol) : null,
        initial_ph: initPH ? parseFloat(initPH) : null,
      });
      if (advance) {
        await onAdvanceStage('sterilisation');
      } else {
        fetch();
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <Beaker className="w-5 h-5 text-indigo-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Media Preparation & BOM</h2>
          <p className="text-xs text-gray-500">Record all raw material BOM fulfillment and substrate setup.</p></div>
        {data?.is_complete && <span className="ml-auto px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black rounded-lg uppercase">Complete</span>}
      </div>

      <div className="surface p-5 space-y-5">
        <div className="mb-4">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h3 className="text-xs font-black uppercase text-indigo-800 mb-1">BOM Traceability</h3>
              <p className="text-[11px] font-medium text-gray-500">Recipe: <span className="text-indigo-600 font-bold">{batch.formulations?.name}</span> | Base: {baseVol}ml | Target: {targetVol}ml</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black uppercase text-gray-400">Scale Factor</span>
              <p className="text-sm font-black text-indigo-600">{scaleFactor.toFixed(2)}x</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {formulationIngredients.length === 0 && <p className="text-xs text-gray-400 italic">No ingredients found in recipe.</p>}
            {formulationIngredients.map(ing => {
               const scaledQty = ((parseFloat(ing.quantity) || 0) * scaleFactor).toFixed(2);
               // Filter stock: match by exact item_id, OR match by name for legacy compat
               const matchStock = availableStock.filter(s => s.item_id === ing.item_id || s.inventory_items?.id === ing.item_id || (s.inventory_items?.name?.toLowerCase() === ing.name?.toLowerCase()));
               const usage = bomUsage[ing.item_id] || {lotId:'', usedQty:''};
               const isRagi = ing.name?.toLowerCase().includes('ragi');
               const isKavuni = ing.name?.toLowerCase().includes('kavuni');

               return (
                 <div key={ing.item_id} className="p-4 border border-indigo-100 bg-indigo-50/20 rounded-xl">
                   <div className="flex justify-between items-center mb-3">
                     <span className="font-bold text-sm text-indigo-900">{ing.name}</span>
                     <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-2 py-1 rounded">Target: {parseFloat(scaledQty)} {ing.unit}</span>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="field-label">Inventory Lot Selection</label>
                       <select value={usage.lotId} onChange={e => setBomUsage(p=>({...p, [ing.item_id]: {...p[ing.item_id], lotId: e.target.value}}))} className="field-input">
                         <option value="">Select lot...</option>
                         {matchStock.length > 0 && <option disabled>── Matching Lots ──</option>}
                         {matchStock.map(s => <option key={s.id} value={s.id}>{s.supplier_batch_number || 'UN-LOT'} | {parseFloat(s.current_quantity).toFixed(1)}{s.inventory_items?.unit}</option>)}
                         {matchStock.length === 0 && <option disabled>No matching lots available</option>}
                       </select>
                     </div>
                     <div>
                       <label className="field-label">Actual Used Qty ({ing.unit})</label>
                       <input type="number" step="0.01" value={usage.usedQty} onChange={e => setBomUsage(p=>({...p, [ing.item_id]: {...p[ing.item_id], usedQty: e.target.value}}))} className="field-input" placeholder={parseFloat(scaledQty)} />
                     </div>
                   </div>
                   
                   {/* Specific Process Parameters tied to Ingredients */}
                   {isRagi && (
                     <div className="mt-4 pt-3 border-t border-indigo-100/50">
                        <label className="field-label">Ragi Moisture Check</label>
                        <div className="flex gap-2">
                          {['Pass','Fail'].map(o=>(
                            <button key={o} type="button" onClick={()=>setRagiMoist(o)}
                              className={`flex-1 py-1 text-xs font-black rounded-lg border transition-all ${ragiMoist===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                              {o}
                            </button>
                          ))}
                          <button type="button" onClick={()=>setRagiMoist('')} className={`px-3 text-xs font-bold rounded-lg border transition-all ${!ragiMoist?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-400 border-gray-200'}`}>N/A</button>
                        </div>
                        {ragiMoist==='Fail' && <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Moisture check failed — log deviation before advancing.</p>}
                     </div>
                   )}
                   {isKavuni && isF2 && (
                     <div className="mt-4 pt-3 border-t border-indigo-100/50 grid grid-cols-2 gap-3">
                        <div><label className="field-label">Pre-cook Temp (°C)</label><input type="number" step="0.1" value={kavuniTemp} onChange={e=>setKavuniTemp(e.target.value)} className="field-input" placeholder="90.0"/></div>
                        <div><label className="field-label">Pre-cook Duration (min)</label><input type="number" value={kavuniMin} onChange={e=>setKavuniMin(e.target.value)} className="field-input" placeholder="30"/></div>
                     </div>
                   )}
                 </div>
               );
            })}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Added Water Volume (ml)</label>
              <input type="number" step="1" value={waterVol} onChange={e=>setWaterVol(e.target.value)} className="field-input" placeholder="0"/>
            </div>
            <div>
              <label className="field-label">Total Volume Prepared (ml)</label>
              <input type="number" step="1" value={totalVol} onChange={e=>setTotalVol(e.target.value)} className="field-input" placeholder="250"/>
            </div>
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
