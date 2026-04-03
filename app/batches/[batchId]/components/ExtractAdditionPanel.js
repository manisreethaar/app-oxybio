'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Leaf, AlertTriangle } from 'lucide-react';

const SPECIES  = ["Lion's Mane", 'Cordyceps militaris', 'Reishi'];
const ADD_TEMP = ['Cold base (<10°C)', 'Room temp'];
const ADD_METH = ['Dropwise', 'Slow pour'];

export default function ExtractAdditionPanel({ batch, availableStock, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast    = useToast();
  const [saving, setSaving] = useState(false);
  const [strainingVol, setStrainingVol] = useState(null);
  const [pendingPhOverride, setPendingPhOverride] = useState(false);

  const [species,    setSpecies]    = useState("Lion's Mane");
  const [lotId,      setLotId]      = useState('');
  const [mushWt,     setMushWt]     = useState('');
  const [extractWater, setExtractWater] = useState('');
  const [extractTemp,  setExtractTemp]  = useState('');
  const [extractMin,   setExtractMin]   = useState('');
  const [extractRecov, setExtractRecov] = useState('');
  const [extractPh,    setExtractPh]    = useState('');
  const [phAdjDone,    setPhAdjDone]    = useState(false);
  const [phAdjNotes,   setPhAdjNotes]   = useState('');
  const [extractAdded, setExtractAdded] = useState('');
  const [finalPh,    setFinalPh]    = useState('');
  const [colourBefore, setColourBefore] = useState('');
  const [colourAfter,  setColourAfter]  = useState('');
  const [addTemp,    setAddTemp]    = useState('Cold base (<10°C)');
  const [addMethod,  setAddMethod]  = useState('Dropwise');
  const [lafUsed,    setLafUsed]    = useState(false);
  const [notes,      setNotes]      = useState('');

  const fetch = useCallback(async () => {
    const [dRes, stRes] = await Promise.all([
      supabase.from('batch_stage_extract_addition').select('*').eq('batch_id', batch.id).single(),
      supabase.from('batch_stage_straining').select('post_straining_vol_ml').eq('batch_id', batch.id).single(),
    ]);
    if (stRes.data?.post_straining_vol_ml) setStrainingVol(stRes.data.post_straining_vol_ml);
    if (dRes.data) {
      const d = dRes.data;
      setSpecies(d.mushroom_species||"Lion's Mane"); setLotId(d.mushroom_lot_id||'');
      setMushWt(d.mushroom_weight_g||''); setExtractWater(d.extraction_water_ml||'');
      setExtractTemp(d.extraction_temp_c||''); setExtractMin(d.extraction_duration_min||'');
      setExtractRecov(d.extract_recovered_ml||''); setExtractPh(d.extract_ph||'');
      setPhAdjDone(d.ph_adjustment_done||false); setPhAdjNotes(d.ph_adjustment_notes||'');
      setExtractAdded(d.extract_vol_added_ml||''); setFinalPh(d.final_product_ph||'');
      setColourBefore(d.colour_before||''); setColourAfter(d.colour_after||'');
      setAddTemp(d.addition_temp||'Cold base (<10°C)'); setAddMethod(d.addition_method||'Dropwise');
      setLafUsed(d.laf_used||false); setNotes(d.notes||'');
    }
  }, [batch.id, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const additionPct = extractAdded && strainingVol ? ((parseFloat(extractAdded)/parseFloat(strainingVol))*100).toFixed(1) : null;
  const finalPhNum  = finalPh ? parseFloat(finalPh) : null;
  const phTooHigh   = finalPhNum != null && finalPhNum > 5.0;
  const mushroomLots = availableStock.filter(s => SPECIES.some(sp => s.inventory_items?.name?.toLowerCase().includes(sp.split("'")[0].toLowerCase())));

  const handleSave = async (advance = false) => {
    if (advance && !finalPh) { toast.warn('Final product pH is required before advancing to QC Hold.'); return; }
    if (phTooHigh && advance) {
      setPendingPhOverride(true);
      return;
    }
    await executeSave(advance);
  };

  const confirmPhOverride = async () => {
    setPendingPhOverride(false);
    await executeSave(true);
  };

  const executeSave = async (advance = false) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_stage_extract_addition').upsert({
        batch_id: batch.id, mushroom_species: species, mushroom_lot_id: lotId || null,
        mushroom_weight_g: mushWt ? parseFloat(mushWt) : null,
        extraction_water_ml: extractWater ? parseFloat(extractWater) : null,
        extraction_temp_c: extractTemp ? parseFloat(extractTemp) : null,
        extraction_duration_min: extractMin ? parseFloat(extractMin) : null,
        extract_recovered_ml: extractRecov ? parseFloat(extractRecov) : null,
        extract_ph: extractPh ? parseFloat(extractPh) : null,
        ph_adjustment_done: phAdjDone, ph_adjustment_notes: phAdjNotes || null,
        extract_vol_added_ml: extractAdded ? parseFloat(extractAdded) : null,
        addition_pct: additionPct ? parseFloat(additionPct) : null,
        final_product_ph: finalPh ? parseFloat(finalPh) : null,
        ph_above_5_override_by: phTooHigh && advance ? employeeProfile?.id : null,
        colour_before: colourBefore || null, colour_after: colourAfter || null,
        addition_temp: addTemp, addition_method: addMethod,
        laf_used: lafUsed, operator_id: employeeProfile?.id, notes: notes || null,
      });
      if (error) throw error;

      // ── Deduct mushroom lot from inventory on advance ─────────────
      if (advance && lotId && mushWt) {
        const qty = parseFloat(mushWt);
        const { data: stock } = await supabase
          .from('inventory_stock').select('current_quantity').eq('id', lotId).single();
        if (stock) {
          const newQty = Math.max(0, parseFloat(stock.current_quantity) - qty);
          if (qty > parseFloat(stock.current_quantity))
            toast.warn(`Mushroom lot: used ${qty}g but only ${parseFloat(stock.current_quantity).toFixed(1)}g available — set to 0.`);
          await supabase.from('inventory_stock')
            .update({ current_quantity: newQty, status: newQty <= 0 ? 'Out of Stock' : undefined })
            .eq('id', lotId);
          await supabase.from('inventory_movements').insert({
            stock_id:        lotId,
            movement_type:   'Batch Deduction',
            quantity:        qty,
            batch_reference: batch.batch_id,
            issued_by:       employeeProfile?.id,
            notes:           `Extract Addition: ${batch.batch_id} — ${species}`,
          }).then(()=>{}).catch(()=>{});
        }
      }

      toast.success(advance ? 'Extract addition complete. Inventory updated.' : 'Draft saved.');
      if (advance) {
        await onAdvanceStage('qc_hold');
      } else {
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <Leaf className="w-5 h-5 text-fuchsia-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Mushroom Extract Addition</h2>
          <p className="text-xs text-gray-500">Document extraction + addition of functional mushroom to fermented base.</p></div>
      </div>

      <div className="surface p-5 space-y-4">
        {/* Species + Lot */}
        <div>
          <label className="field-label">Mushroom Species</label>
          <div className="flex flex-wrap gap-2">
            {SPECIES.map(s=>(
              <button key={s} type="button" onClick={()=>setSpecies(s)}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${species===s?'bg-fuchsia-600 text-white border-fuchsia-600':'bg-white text-gray-600 border-gray-200 hover:border-fuchsia-300'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Mushroom Lot</label>
            <select value={lotId} onChange={e=>setLotId(e.target.value)} className="field-input bg-white">
              <option value="">Select mushroom lot...</option>
              {availableStock.map(s=><option key={s.id} value={s.id}>{s.inventory_items?.name} | {s.supplier_batch_number||'UN-LOT'} | {s.current_quantity}{s.inventory_items?.unit}</option>)}
            </select>
          </div>
          <div><label className="field-label">Weight Used (g)</label><input type="number" step="0.1" value={mushWt} onChange={e=>setMushWt(e.target.value)} className="field-input" placeholder="0.0"/></div>
        </div>

        {/* Extraction section */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-fuchsia-600 mb-3">Extraction Process</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Extraction Water (ml)</label><input type="number" step="1" value={extractWater} onChange={e=>setExtractWater(e.target.value)} className="field-input" placeholder="100"/></div>
            <div><label className="field-label">Extraction Temp (°C)</label><input type="number" step="1" value={extractTemp} onChange={e=>setExtractTemp(e.target.value)} className="field-input" placeholder="80"/></div>
            <div><label className="field-label">Duration (min)</label><input type="number" value={extractMin} onChange={e=>setExtractMin(e.target.value)} className="field-input" placeholder="30"/></div>
            <div><label className="field-label">Extract Recovered (ml)</label><input type="number" step="0.1" value={extractRecov} onChange={e=>setExtractRecov(e.target.value)} className="field-input" placeholder="80"/></div>
          </div>
        </div>

        {/* Extract pH + adjustment */}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Extract pH</label><input type="number" step="0.01" value={extractPh} onChange={e=>setExtractPh(e.target.value)} className="field-input" placeholder="5.5"/></div>
          <div className="flex flex-col justify-end pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={phAdjDone} onChange={e=>setPhAdjDone(e.target.checked)} className="w-4 h-4 rounded border-gray-300"/>
              <span className="text-xs font-bold text-gray-700">pH Adjustment Done</span></label>
          </div>
        </div>
        {phAdjDone && <input value={phAdjNotes} onChange={e=>setPhAdjNotes(e.target.value)} className="field-input" placeholder="pH adjustment method / reagent used..."/>}

        {/* Addition */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-fuchsia-600 mb-3">Addition to Fermented Base</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Volume Added (ml)</label>
              <input type="number" step="0.1" value={extractAdded} onChange={e=>setExtractAdded(e.target.value)} className="field-input" placeholder="25"/>
              {additionPct && <p className="text-[10px] text-navy font-bold mt-1">{additionPct}% v/v of fermented base</p>}
            </div>
            <div><label className="field-label">Addition Method</label>
              <select value={addMethod} onChange={e=>setAddMethod(e.target.value)} className="field-input bg-white">
                {ADD_METH.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div><label className="field-label">Base Temp at Addition</label>
              <select value={addTemp} onChange={e=>setAddTemp(e.target.value)} className="field-input bg-white">
                {ADD_TEMP.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={lafUsed} onChange={e=>setLafUsed(e.target.checked)} className="w-4 h-4 rounded border-gray-300"/>
                <span className="text-xs font-bold text-gray-700">LAF Cabinet Used</span></label>
            </div>
          </div>
        </div>

        {/* Colour change */}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Colour Before Addition</label><input value={colourBefore} onChange={e=>setColourBefore(e.target.value)} className="field-input" placeholder="e.g. Reddish-pink"/></div>
          <div><label className="field-label">Colour After Addition</label><input value={colourAfter} onChange={e=>setColourAfter(e.target.value)} className="field-input" placeholder="e.g. Deep brownish-red"/></div>
        </div>

        {/* Final pH — gate */}
        <div className={`p-4 rounded-2xl border-2 ${phTooHigh?'border-red-300 bg-red-50':'border-gray-200 bg-gray-50'}`}>
          <label className="block text-[11px] font-black uppercase tracking-wider mb-2 ${phTooHigh?'text-red-600':'text-gray-600'}">
            Final Product pH <span className="text-red-500">★ Gate — required before QC</span>
            <span className="text-gray-400 font-normal ml-1">(target &lt; 5.0)</span>
          </label>
          <input type="number" step="0.01" value={finalPh} onChange={e=>setFinalPh(e.target.value)}
            className={`w-full px-4 py-3 border-2 rounded-xl text-3xl font-black font-mono text-center outline-none ${phTooHigh?'border-red-400 text-red-600 bg-white':'border-gray-200 text-gray-800 bg-white focus:border-navy'}`} placeholder="4.50"/>
          {phTooHigh && <p className="text-xs text-red-600 font-bold mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Final pH &gt; 5.0 — microbial safety concern. CEO must confirm to advance.</p>}
        </div>

        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Extraction / addition notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">Save Draft</button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading||!finalPh} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Complete → QC Hold
          </button>
        </div>
      </div>

      {/* pH Override Modal */}
      {pendingPhOverride && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-amber-600 mb-2 text-center flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5"/> pH Override
            </h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Final pH <strong className="text-amber-600">{finalPh}</strong> is &gt; 5.0 (microbial safety concern). CEO confirmation is officially required. Proceed and advance to QC Hold?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingPhOverride(false)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmPhOverride}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition w-full"
              >
                ⚠ Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
