'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Leaf, CheckCircle2 } from 'lucide-react';

const SPECIES = ['Cordyceps militaris', 'Hericium erinaceus', 'Ganoderma lucidum', 'Inonotus obliquus', 'Tremella fuciformis'];
const ADD_TEMP = ['Ambient (22-26°C)', 'Chilled (≤8°C)'];
const ADD_METHOD = ['Aseptic pouring', 'Sterile pipette', 'Peristaltic pump'];

export default function ExtractAdditionPanel({ batch, activeFlask, employees, availableStock, employeeProfile, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [species,     setSpecies]     = useState(SPECIES[0]);
  const [lotId,       setLotId]       = useState('');
  const [weight,      setWeight]      = useState('');
  const [water,       setWater]       = useState('');
  const [exTemp,      setExTemp]      = useState('');
  const [exTime,      setExTime]      = useState('');
  const [exRecovered, setExRecovered] = useState('');
  const [exPh,        setExPh]        = useState('');
  const [phAdjDone,   setPhAdjDone]   = useState(false);
  const [phAdjNotes,  setPhAdjNotes]  = useState('');
  
  const [volAdded,    setVolAdded]    = useState('');
  const [addPct,      setAddPct]      = useState('');
  const [finalPh,     setFinalPh]     = useState('');
  const [addTemp,     setAddTemp]     = useState(ADD_TEMP[0]);
  const [addMethod,   setAddMethod]   = useState(ADD_METHOD[0]);
  const [colBefore,   setColBefore]   = useState('');
  const [colAfter,    setColAfter]    = useState('');
  const [lafUsed,     setLafUsed]     = useState(true);
  const [notes,       setNotes]       = useState('');

  const mshStock = availableStock.filter(s => s.inventory_items?.category === 'mushroom_extract' || s.inventory_items?.category === 'raw_material');

  const fetchRecord = useCallback(async () => {
    if (!activeFlask) return;
    const { data } = await supabase.from('batch_flask_extract_addition').select('*').eq('flask_id', activeFlask.id).single();
    if (data) {
      setRecord(data);
      setSpecies(data.mushroom_species||SPECIES[0]); setLotId(data.mushroom_lot_id||'');
      setWeight(data.mushroom_weight_g||''); setWater(data.extraction_water_ml||'');
      setExTemp(data.extraction_temp_c||''); setExTime(data.extraction_duration_min||'');
      setExRecovered(data.extract_recovered_ml||''); setExPh(data.extract_ph||'');
      setPhAdjDone(data.ph_adjustment_done||false); setPhAdjNotes(data.ph_adjustment_notes||'');
      setVolAdded(data.extract_vol_added_ml||''); setAddPct(data.addition_pct||'');
      setFinalPh(data.final_product_ph||''); setAddTemp(data.addition_temp||ADD_TEMP[0]);
      setAddMethod(data.addition_method||ADD_METHOD[0]); setColBefore(data.colour_before||'');
      setColAfter(data.colour_after||''); setLafUsed(data.laf_used??true); setNotes(data.notes||'');
    }
  }, [activeFlask, supabase]);

  useEffect(() => { fetchRecord(); }, [fetchRecord]);

  const handleSave = async (advance = false) => {
    if (!activeFlask) return;
    if (advance && (!volAdded || !finalPh)) {
      toast.warn('Volume added and Final pH are required to advance.'); return;
    }
    
    setSaving(true);
    try {
      const payload = {
        flask_id: activeFlask.id, batch_id: batch.id,
        mushroom_species: species, mushroom_lot_id: lotId || null,
        mushroom_weight_g: weight ? parseFloat(weight) : null,
        extraction_water_ml: water ? parseFloat(water) : null,
        extraction_temp_c: exTemp ? parseFloat(exTemp) : null,
        extraction_duration_min: exTime ? parseFloat(exTime) : null,
        extract_recovered_ml: exRecovered ? parseFloat(exRecovered) : null,
        extract_ph: exPh ? parseFloat(exPh) : null,
        ph_adjustment_done: phAdjDone, ph_adjustment_notes: phAdjDone ? phAdjNotes : null,
        extract_vol_added_ml: volAdded ? parseFloat(volAdded) : null,
        addition_pct: addPct ? parseFloat(addPct) : null,
        final_product_ph: finalPh ? parseFloat(finalPh) : null,
        addition_temp: addTemp, addition_method: addMethod,
        colour_before: colBefore, colour_after: colAfter,
        laf_used: lafUsed, notes, operator_id: employeeProfile?.id,
      };

      const { error } = await supabase.from('batch_flask_extract_addition').upsert(payload, { onConflict: 'flask_id' });
      if (error) throw error;
      
      toast.success(advance ? `Trial ${activeFlask.flask_label} advanced to QC Hold.` : 'Draft saved.');
      if (advance && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage('qc_hold');
      } else {
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Extract Addition.</div>;

  return (
    <div className="space-y-5">
      <div className="surface p-5 border-l-4 border-l-fuchsia-500">
        <div className="flex items-center gap-2 mb-1">
          <Leaf className="w-5 h-5 text-fuchsia-600"/>
          <h2 className="text-base font-bold text-gray-900">Extract Addition: <span className="text-fuchsia-600">{activeFlask.flask_label}</span></h2>
        </div>
        <p className="text-xs text-gray-500">Log mushroom decoction/extract integration for this specific trial.</p>
        
        {record && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600"/><span className="text-xs font-bold text-emerald-800">Record saved automatically.</span>
          </div>
        )}
      </div>

      <div className="surface overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-bold text-gray-900">Decoction / Extract Prep</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="field-label">Species</label>
              <select value={species} onChange={e=>setSpecies(e.target.value)} className="field-input bg-white text-xs">
                {SPECIES.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="field-label">Extract Lot</label>
              <select value={lotId} onChange={e=>setLotId(e.target.value)} className="field-input bg-white text-xs">
                <option value="">N/A (Fresh Prep)</option>
                {mshStock.map(s=><option key={s.id} value={s.id}>{s.inventory_items?.name} (Lot: {s.lot_number})</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="field-label">Weight (g)</label><input type="number" value={weight} onChange={e=>setWeight(e.target.value)} className="field-input p-2" placeholder="e.g. 50"/></div>
            <div><label className="field-label">Water used (ml)</label><input type="number" value={water} onChange={e=>setWater(e.target.value)} className="field-input p-2" placeholder="e.g. 500"/></div>
            <div><label className="field-label">Recovered (ml)</label><input type="number" value={exRecovered} onChange={e=>setExRecovered(e.target.value)} className="field-input p-2" placeholder="e.g. 400"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Extraction Temp (°C)</label><input type="number" value={exTemp} onChange={e=>setExTemp(e.target.value)} className="field-input p-2" placeholder="e.g. 95"/></div>
            <div><label className="field-label">Duration (min)</label><input type="number" value={exTime} onChange={e=>setExTime(e.target.value)} className="field-input p-2" placeholder="e.g. 120"/></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="field-label">Extract initial pH</label><input type="number" step="0.01" value={exPh} onChange={e=>setExPh(e.target.value)} className="field-input p-2" placeholder="e.g. 6.5"/></div>
            <div className="flex flex-col justify-center">
              <label className="flex items-center gap-2 cursor-pointer mt-4">
                <input type="checkbox" checked={phAdjDone} onChange={e=>setPhAdjDone(e.target.checked)} className="w-4 h-4 rounded border-gray-300"/>
                <span className="text-xs font-bold text-gray-700">pH Adjusted before addition?</span>
              </label>
            </div>
          </div>
          {phAdjDone && (
            <div><label className="field-label">pH Adjustment Notes</label>
              <input value={phAdjNotes} onChange={e=>setPhAdjNotes(e.target.value)} className="field-input p-2" placeholder="e.g. Added 2 drops 1M Lactic acid to reach 4.5"/>
            </div>
          )}
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-bold text-gray-900">Integration into Fermentate</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="field-label">Integration Vol (ml)<span className="text-red-500">*</span></label><input type="number" value={volAdded} onChange={e=>setVolAdded(e.target.value)} className="field-input p-2" placeholder="e.g. 150"/></div>
            <div><label className="field-label">Addition %</label><input type="number" value={addPct} onChange={e=>setAddPct(e.target.value)} className="field-input p-2" placeholder="e.g. 10"/></div>
            <div><label className="field-label">FINAL PRODUCT pH<span className="text-red-500">*</span></label><input type="number" step="0.01" value={finalPh} onChange={e=>setFinalPh(e.target.value)} className="field-input p-2" placeholder="4.35"/></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="field-label">Addition Method</label>
              <select value={addMethod} onChange={e=>setAddMethod(e.target.value)} className="field-input bg-white text-xs">
                {ADD_METHOD.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="field-label">Blended Temp Condition</label>
              <select value={addTemp} onChange={e=>setAddTemp(e.target.value)} className="field-input bg-white text-xs">
                {ADD_TEMP.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Colour Before</label><input value={colBefore} onChange={e=>setColBefore(e.target.value)} className="field-input p-2" placeholder="Yellowish"/></div>
            <div><label className="field-label">Colour After</label><input value={colAfter} onChange={e=>setColAfter(e.target.value)} className="field-input p-2" placeholder="Amber brown"/></div>
          </div>
          <div className="flex border-t border-gray-100 pt-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={lafUsed} onChange={e=>setLafUsed(e.target.checked)} className="w-5 h-5 rounded border-gray-300"/>
              <span className="text-sm font-bold text-gray-700">LAF Cabinet / Clean Room used</span>
            </label>
          </div>
          <div><label className="field-label">Notes</label>
            <input value={notes} onChange={e=>setNotes(e.target.value)} className="field-input p-2" placeholder="Any observed precipitation..."/>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
            <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
              {saving?'Saving...':'Save Draft'}
            </button>
            <button onClick={()=>handleSave(true)} disabled={saving||actionLoading} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
              Trial Integration Complete → QC
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
