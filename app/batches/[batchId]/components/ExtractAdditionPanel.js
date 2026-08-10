'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Leaf, CheckCircle2, RotateCcw } from 'lucide-react';

const SPECIES = ['Cordyceps militaris', 'Hericium erinaceus', 'Ganoderma lucidum', 'Inonotus obliquus', 'Tremella fuciformis'];
const ADD_TEMP = ['Ambient (22-26°C)', 'Chilled (≤8°C)'];
const ADD_METHOD = ['Aseptic pouring', 'Sterile pipette', 'Peristaltic pump'];
// G-06: allergen options per FSSAI major allergen list
const ALLERGEN_OPTIONS = ['Milk / Dairy','Gluten / Wheat','Soy','Tree Nuts','Peanuts','Sesame','Eggs','Fish / Shellfish'];

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
  const [lafUsed,        setLafUsed]        = useState(true);
  const [notes,          setNotes]          = useState('');
  // A-36, A-54: Bioactive marker content
  const [polyphenolMgG,  setPolyphenolMgG]  = useState('');
  const [betaGlucanPct,  setBetaGlucanPct]  = useState('');
  const [extractBioSpec, setExtractBioSpec] = useState('');
  // G-36: mixing parameters
  const [mixingTimeMin,   setMixingTimeMin]   = useState('');
  const [mixingSpeedRpm,  setMixingSpeedRpm]  = useState('');
  // G-35: post-mixing checks
  const [postMixingPh,    setPostMixingPh]    = useState('');
  const [postMixingBrix,  setPostMixingBrix]  = useState('');
  // G-37: blend homogeneity
  const [blendHomogeneity, setBlendHomogeneity] = useState('');
  // G-38: actual addition temp
  const [addTempActual,   setAddTempActual]   = useState('');
  // G-06: allergen declaration
  const [allergens,   setAllergens]   = useState([]);
  const [noneAllergens, setNoneAllergens] = useState(false);

  const mshStock = availableStock.filter(s => s.inventory_items?.category === 'mushroom_extract' || s.inventory_items?.category === 'raw_material');

  const fetchRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let isCurrent = true;
    let data;
    try {
      ({ data } = await withTimeout(supabase.from('batch_flask_extract_addition').select('*').eq('flask_id', activeFlask.id).maybeSingle(), 20000, 'Extract addition load timed out'));
    } catch (err) {
      console.error('ExtractAdditionPanel fetch error:', err);
      return;
    }
    if (!isCurrent) return;
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
      setPolyphenolMgG(data.polyphenol_mg_g||'');
      setBetaGlucanPct(data.beta_glucan_pct||'');
      setExtractBioSpec(data.extract_biospec||'');
      setMixingTimeMin(data.mixing_time_min||''); setMixingSpeedRpm(data.mixing_speed_rpm||'');
      setPostMixingPh(data.post_mixing_ph_check||''); setPostMixingBrix(data.post_mixing_brix||'');
      setBlendHomogeneity(data.blend_homogeneity_check||''); setAddTempActual(data.addition_temp_actual_c||'');
      const savedAllergens = data.allergen_declaration || [];
      if (savedAllergens.includes('None')) { setNoneAllergens(true); setAllergens([]); }
      else { setAllergens(savedAllergens); setNoneAllergens(false); }
    } else { setRecord(null); }
    return () => { isCurrent = false; };
  }, [activeFlask?.id, supabase]);

  useEffect(() => { setRecord(null); fetchRecord(); }, [fetchRecord]);

  const handleSave = async (advanceTarget = null) => {
    if (!activeFlask) return;
    if (advanceTarget) {
      const missing = [];
      if (!volAdded) missing.push('Volume Added (ml)');
      if (!finalPh) missing.push('Final pH');
      if (!noneAllergens && allergens.length === 0) missing.push('Allergen Declaration');
      
      if (missing.length > 0) {
        toast.warn(`Cannot advance to ${advanceTarget === 'downstream' ? 'Downstream' : 'QC'}. Missing mandatory details: ${missing.join(', ')}.`);
        return;
      }
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
        polyphenol_mg_g: polyphenolMgG ? parseFloat(polyphenolMgG) : null,
        beta_glucan_pct: betaGlucanPct ? parseFloat(betaGlucanPct) : null,
        extract_biospec: extractBioSpec || null,
        allergen_declaration: noneAllergens ? ['None'] : allergens,
        mixing_time_min:         mixingTimeMin   ? parseFloat(mixingTimeMin)   : null,
        mixing_speed_rpm:        mixingSpeedRpm  ? parseFloat(mixingSpeedRpm)  : null,
        post_mixing_ph_check:    postMixingPh    ? parseFloat(postMixingPh)    : null,
        post_mixing_brix:        postMixingBrix  ? parseFloat(postMixingBrix)  : null,
        blend_homogeneity_check: blendHomogeneity || null,
        addition_temp_actual_c:  addTempActual   ? parseFloat(addTempActual)   : null,
      };

      const { error } = await withTimeout(
        supabase.from('batch_flask_extract_addition').upsert(payload, { onConflict: 'flask_id' }),
        15000,
        'Save request timed out. Please check your internet connection.'
      );
      if (error) throw error;
      
      toast.success(advanceTarget ? `Trial ${activeFlask.flask_label} advanced to ${advanceTarget === 'downstream' ? 'Downstream' : 'QC Hold'}.` : 'Draft saved.');
      if (advanceTarget && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage(advanceTarget);
      } else {
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleReturnToHarvest = async () => {
    if (!activeFlask || saving || actionLoading || !onAdvanceFlaskStage) return;
    setSaving(true);
    try {
      await onAdvanceFlaskStage('harvest');
    } finally {
      setSaving(false);
    }
  };

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Extract Addition.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 border-l-4 border-l-fuchsia-500">
        <div className="flex items-center gap-2 mb-1">
          <Leaf className="w-5 h-5 text-slate-600"/>
          <h2 className="text-base font-bold text-slate-900">Extract Addition: <span className="text-slate-600">{activeFlask.flask_label}</span></h2>
        </div>
        <p className="text-xs text-slate-500">Log mushroom decoction/extract integration for this specific trial.</p>
        
        {record && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600"/><span className="text-xs font-bold text-emerald-800">Record saved automatically.</span>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900">Decoction / Extract Prep</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="field-label">Species</label>
              <select value={species} onChange={e=>setSpecies(e.target.value)} className="field-input bg-white text-xs">
                {SPECIES.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="field-label">Extract Lot</label>
              <select value={lotId} onChange={e=>setLotId(e.target.value)} className="field-input bg-white text-xs">
                <option value="">N/A (Fresh Prep)</option>
                {mshStock.map(s => {
                  const isExpired = s.expiry_date && new Date(s.expiry_date) < new Date();
                  return (
                    <option key={s.id} value={s.id} disabled={isExpired}>
                      {s.inventory_items?.name} (Lot: {s.lot_number || s.supplier_batch_number || 'UN-LOT'}) {isExpired ? '(EXPIRED)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="field-label">Weight (g)</label><input type="number" value={weight} onChange={e=>setWeight(e.target.value)} className="field-input p-2" placeholder="e.g. 50"/></div>
            <div><label className="field-label">Water used (ml)</label><input type="number" value={water} onChange={e=>setWater(e.target.value)} className="field-input p-2" placeholder="e.g. 500"/></div>
            <div><label className="field-label">Recovered (ml)</label><input type="number" value={exRecovered} onChange={e=>setExRecovered(e.target.value)} className="field-input p-2" placeholder="e.g. 400"/></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Extraction Temp (°C)</label><input type="number" value={exTemp} onChange={e=>setExTemp(e.target.value)} className="field-input p-2" placeholder="e.g. 95"/></div>
            <div><label className="field-label">Duration (min)</label><input type="number" value={exTime} onChange={e=>setExTime(e.target.value)} className="field-input p-2" placeholder="e.g. 120"/></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="field-label">Extract initial pH</label><input type="number" step="0.01" value={exPh} onChange={e=>setExPh(e.target.value)} className="field-input p-2" placeholder="e.g. 6.5"/></div>
          {/* A-36, A-54: Bioactive markers */}
          <div><label className="field-label">Polyphenol Content (mg/g) <span className="text-slate-400 text-xs">A-36</span></label><input type="number" step="0.1" value={polyphenolMgG} onChange={e=>setPolyphenolMgG(e.target.value)} className="field-input p-2" placeholder="e.g. 12.5"/></div>
          <div><label className="field-label">β-Glucan Content (%) <span className="text-slate-400 text-xs">A-54</span></label><input type="number" step="0.01" value={betaGlucanPct} onChange={e=>setBetaGlucanPct(e.target.value)} className="field-input p-2" placeholder="e.g. 0.35"/></div>
          <div><label className="field-label">Bioactive Specification</label><input value={extractBioSpec} onChange={e=>setExtractBioSpec(e.target.value)} className="field-input p-2" placeholder="e.g. ≥10mg/g polyphenols"/></div>
            <div className="flex flex-col justify-center">
              <label className="flex items-center gap-2 cursor-pointer mt-4">
                <input type="checkbox" checked={phAdjDone} onChange={e=>setPhAdjDone(e.target.checked)} className="w-4 h-4 rounded border-slate-300"/>
                <span className="text-xs font-bold text-slate-700">pH Adjusted before addition?</span>
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

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900">Integration into Fermentate</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="field-label">Integration Vol (ml)<span className="text-red-500">*</span></label><input type="number" value={volAdded} onChange={e=>setVolAdded(e.target.value)} className="field-input p-2" placeholder="e.g. 150"/></div>
            <div><label className="field-label">Addition %</label><input type="number" value={addPct} onChange={e=>setAddPct(e.target.value)} className="field-input p-2" placeholder="e.g. 10"/></div>
            <div><label className="field-label">FINAL PRODUCT pH<span className="text-red-500">*</span></label><input type="number" step="0.01" value={finalPh} onChange={e=>setFinalPh(e.target.value)} className="field-input p-2" placeholder="4.35"/></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Colour Before</label><input value={colBefore} onChange={e=>setColBefore(e.target.value)} className="field-input p-2" placeholder="Yellowish"/></div>
            <div><label className="field-label">Colour After</label><input value={colAfter} onChange={e=>setColAfter(e.target.value)} className="field-input p-2" placeholder="Amber brown"/></div>
          </div>
          <div className="flex border-t border-slate-100 pt-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={lafUsed} onChange={e=>setLafUsed(e.target.checked)} className="w-5 h-5 rounded border-slate-300"/>
              <span className="text-sm font-bold text-slate-700">LAF Cabinet / Clean Room used</span>
            </label>
          </div>
          <div><label className="field-label">Notes</label>
            <input value={notes} onChange={e=>setNotes(e.target.value)} className="field-input p-2" placeholder="Any observed precipitation..."/>
          </div>

          {/* G-36: Mixing parameters */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <p className="text-xs font-black uppercase text-slate-500 tracking-wider">Mixing & Integration Parameters</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Mixing Time (min)</label>
                <input type="number" step="0.5" value={mixingTimeMin} onChange={e=>setMixingTimeMin(e.target.value)} className="field-input p-2" placeholder="e.g. 10"/>
              </div>
              <div><label className="field-label">Mixing Speed (rpm)</label>
                <input type="number" step="10" value={mixingSpeedRpm} onChange={e=>setMixingSpeedRpm(e.target.value)} className="field-input p-2" placeholder="e.g. 150"/>
              </div>
            </div>
            {/* G-38: Actual addition temperature */}
            <div><label className="field-label">Actual Addition Temp (°C) <span className="text-slate-400 font-normal text-xs">(measured)</span></label>
              <input type="number" step="0.1" value={addTempActual} onChange={e=>setAddTempActual(e.target.value)} className="field-input p-2" placeholder="e.g. 24.5"/>
            </div>
            {/* G-37: Blend homogeneity */}
            <div><label className="field-label">Blend Homogeneity Check</label>
              <div className="flex gap-2">
                {['Homogeneous','Slight separation','Phase separation observed'].map(o=>(
                  <button key={o} type="button" onClick={()=>setBlendHomogeneity(o)}
                    className={`flex-1 py-1.5 text-xs font-black rounded-lg border transition-all ${blendHomogeneity===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
            {/* G-35: Post-mixing QC checks */}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Post-mixing pH</label>
                <input type="number" step="0.01" value={postMixingPh} onChange={e=>setPostMixingPh(e.target.value)} className="field-input p-2" placeholder="e.g. 4.30"/>
              </div>
              <div><label className="field-label">Post-mixing Brix (°Bx)</label>
                <input type="number" step="0.1" value={postMixingBrix} onChange={e=>setPostMixingBrix(e.target.value)} className="field-input p-2" placeholder="e.g. 8.5"/>
              </div>
            </div>
          </div>

          {/* G-06: Allergen Declaration */}
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-amber-900">⚠ Allergen Declaration</span>
              <span className="text-xs text-amber-600 font-semibold">Mandatory before advance — FSSAI requirement</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALLERGEN_OPTIONS.map(al => (
                <button key={al} type="button"
                  disabled={noneAllergens}
                  onClick={() => setAllergens(prev => prev.includes(al) ? prev.filter(a=>a!==al) : [...prev,al])}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all disabled:opacity-40 ${allergens.includes(al) ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-400'}`}>
                  {al}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer border-t border-amber-200 pt-2">
              <input type="checkbox" checked={noneAllergens}
                onChange={e => { setNoneAllergens(e.target.checked); if (e.target.checked) setAllergens([]); }}
                className="w-4 h-4 rounded border-amber-300"/>
              <span className="text-xs font-bold text-amber-900">None of the above allergens present in this batch</span>
            </label>
            {(noneAllergens || allergens.length > 0) && (
              <p className="text-xs text-amber-700 font-semibold">
                Declared: <strong>{noneAllergens ? 'None' : allergens.join(', ')}</strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
            <button onClick={()=>handleSave(null)} disabled={saving} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
              {saving?'Saving...':'Save Draft'}
            </button>
            <button onClick={handleReturnToHarvest} disabled={saving||actionLoading||activeFlask.current_stage === 'harvest'} className="py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40 flex items-center justify-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5"/> Return to Harvest
            </button>
            <button onClick={()=>handleSave('downstream')} disabled={saving||actionLoading} className="py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
              Advance to Downstream
            </button>
            <button onClick={()=>handleSave('qc_hold')} disabled={saving||actionLoading} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
              Direct to QC Hold
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
