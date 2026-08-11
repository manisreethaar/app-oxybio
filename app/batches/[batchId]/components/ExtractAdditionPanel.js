'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Leaf, CheckCircle2, AlertTriangle } from 'lucide-react';

const SPECIES = ['Cordyceps militaris', 'Hericium erinaceus', 'Ganoderma lucidum', 'Inonotus obliquus', 'Tremella fuciformis'];
const ADD_TEMP = ['Ambient (22-26°C)', 'Chilled (≤8°C)'];
const ADD_METHOD = ['Aseptic pouring', 'Sterile pipette', 'Peristaltic pump'];
// G-06: allergen options per FSSAI major allergen list
const ALLERGEN_OPTIONS = ['Milk / Dairy','Gluten / Wheat','Soy','Tree Nuts','Peanuts','Sesame','Eggs','Fish / Shellfish'];

export default function ExtractAdditionPanel({ batch, activeFlask, employees, availableStock, employeeProfile, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const { register, handleSubmit, setValue, getValues, watch, reset } = useForm({
    defaultValues: {
      species: SPECIES[0], lotId: '', weight: '', water: '', exTemp: '', exTime: '',
      exRecovered: '', exPh: '', phAdjDone: false, phAdjNotes: '', volAdded: '',
      addPct: '', finalPh: '', addTemp: ADD_TEMP[0], addMethod: ADD_METHOD[0],
      colBefore: '', colAfter: '', lafUsed: true, notes: '', polyphenolMgG: '',
      betaGlucanPct: '', extractBioSpec: '', mixingTimeMin: '', mixingSpeedRpm: '',
      postMixingPh: '', postMixingBrix: '', blendHomogeneity: '', addTempActual: ''
    }
  });

  const watchSpecies = watch('species');
  const watchPhAdjDone = watch('phAdjDone');
  const watchBlendHomogeneity = watch('blendHomogeneity');
  const watchAddMethod = watch('addMethod');
  const watchAddTemp = watch('addTemp');

  // G-06: allergen declaration
  const [allergens,   setAllergens]   = useState([]);
  const [noneAllergens, setNoneAllergens] = useState(false);

  const mshStock = availableStock.filter(s => s.inventory_items?.category === 'mushroom_extract' || s.inventory_items?.category === 'raw_material');

  const fetchRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let isCurrent = true;
    let data;
    try {
      ({ data } = await withTimeout(supabase.from('batch_flask_extract_addition').select('*').eq('flask_id', activeFlask.id).maybeSingle(), 45000, 'Extract addition load timed out'));
    } catch (err) {
      console.error('ExtractAdditionPanel fetch error:', err);
      return;
    }
    if (!isCurrent) return;
    if (data) {
      setRecord(data);
      reset({
        species: data.mushroom_species||SPECIES[0],
        lotId: data.mushroom_lot_id||'',
        weight: data.mushroom_weight_g||'',
        water: data.extraction_water_ml||'',
        exTemp: data.extraction_temp_c||'',
        exTime: data.extraction_duration_min||'',
        exRecovered: data.extract_recovered_ml||'',
        exPh: data.extract_ph||'',
        phAdjDone: data.ph_adjustment_done||false,
        phAdjNotes: data.ph_adjustment_notes||'',
        volAdded: data.extract_vol_added_ml||'',
        addPct: data.addition_pct||'',
        finalPh: data.final_product_ph||'',
        addTemp: data.addition_temp||ADD_TEMP[0],
        addMethod: data.addition_method||ADD_METHOD[0],
        colBefore: data.colour_before||'',
        colAfter: data.colour_after||'',
        lafUsed: data.laf_used??true,
        notes: data.notes||'',
        polyphenolMgG: data.polyphenol_mg_g||'',
        betaGlucanPct: data.beta_glucan_pct||'',
        extractBioSpec: data.extract_biospec||'',
        mixingTimeMin: data.mixing_time_min||'',
        mixingSpeedRpm: data.mixing_speed_rpm||'',
        postMixingPh: data.post_mixing_ph_check||'',
        postMixingBrix: data.post_mixing_brix||'',
        blendHomogeneity: data.blend_homogeneity_check||'',
        addTempActual: data.addition_temp_actual_c||''
      });
      const savedAllergens = data.allergen_declaration || [];
      if (savedAllergens.includes('None')) { setNoneAllergens(true); setAllergens([]); }
      else { setAllergens(savedAllergens); setNoneAllergens(false); }
    } else { setRecord(null); }
    return () => { isCurrent = false; };
  }, [activeFlask?.id, supabase]);

  useEffect(() => { setRecord(null); fetchRecord(); }, [fetchRecord]);

  const onSubmit = async (formData, advanceTarget = null) => {
    if (!activeFlask) return;
    if (setGlobalError) setGlobalError(null);
    if (advanceTarget) {
      const missing = [];
      if (!formData.volAdded) missing.push('Volume Added (ml)');
      if (!formData.finalPh) missing.push('Final pH');
      if (!noneAllergens && allergens.length === 0) missing.push('Allergen Declaration');
      
      if (missing.length > 0) {
        if (setGlobalError) setGlobalError(`Cannot advance to QC Hold. Missing mandatory details: ${missing.join(', ')}.`);
        toast.warn(`Cannot advance to QC Hold. Missing mandatory details: ${missing.join(', ')}.`);
        return;
      }
    }
    
    setSaving(true);
    try {
      const payload = {
        flask_id: activeFlask.id, batch_id: batch.id,
        mushroom_species: formData.species, mushroom_lot_id: formData.lotId || null,
        mushroom_weight_g: formData.weight ? parseFloat(formData.weight) : null,
        extraction_water_ml: formData.water ? parseFloat(formData.water) : null,
        extraction_temp_c: formData.exTemp ? parseFloat(formData.exTemp) : null,
        extraction_duration_min: formData.exTime ? parseFloat(formData.exTime) : null,
        extract_recovered_ml: formData.exRecovered ? parseFloat(formData.exRecovered) : null,
        extract_ph: formData.exPh ? parseFloat(formData.exPh) : null,
        ph_adjustment_done: formData.phAdjDone, ph_adjustment_notes: formData.phAdjDone ? formData.phAdjNotes : null,
        extract_vol_added_ml: formData.volAdded ? parseFloat(formData.volAdded) : null,
        addition_pct: formData.addPct ? parseFloat(formData.addPct) : null,
        final_product_ph: formData.finalPh ? parseFloat(formData.finalPh) : null,
        addition_temp: formData.addTemp, addition_method: formData.addMethod,
        colour_before: formData.colBefore, colour_after: formData.colAfter,
        laf_used: formData.lafUsed, notes: formData.notes, operator_id: employeeProfile?.id,
        polyphenol_mg_g: formData.polyphenolMgG ? parseFloat(formData.polyphenolMgG) : null,
        beta_glucan_pct: formData.betaGlucanPct ? parseFloat(formData.betaGlucanPct) : null,
        extract_biospec: formData.extractBioSpec || null,
        allergen_declaration: noneAllergens ? ['None'] : allergens,
        mixing_time_min:         formData.mixingTimeMin   ? parseFloat(formData.mixingTimeMin)   : null,
        mixing_speed_rpm:        formData.mixingSpeedRpm  ? parseFloat(formData.mixingSpeedRpm)  : null,
        post_mixing_ph_check:    formData.postMixingPh    ? parseFloat(formData.postMixingPh)    : null,
        post_mixing_brix:        formData.postMixingBrix  ? parseFloat(formData.postMixingBrix)  : null,
        blend_homogeneity_check: formData.blendHomogeneity || null,
        addition_temp_actual_c:  formData.addTempActual   ? parseFloat(formData.addTempActual)   : null,
      };

      const { error } = await withTimeout(
        supabase.from('batch_flask_extract_addition').upsert(payload, { onConflict: 'flask_id' }),
        15000,
        'Save request timed out. Please check your internet connection.'
      );
      if (error) throw error;
      
      if (advanceTarget && onAdvanceFlaskStage) {
        toast.success('Extract addition saved. Confirm advance to QC Hold to continue.');
        await onAdvanceFlaskStage(advanceTarget);
      } else {
        toast.success('Draft saved.');
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { 
      if (setGlobalError) setGlobalError(err.message);
      toast.error(err.message); 
    }
    finally { setSaving(false); }
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
              <select {...register('species')} className="field-input bg-white text-xs">
                {SPECIES.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="field-label">Extract Lot</label>
              <select {...register('lotId')} className="field-input bg-white text-xs">
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
            <div><label className="field-label">Weight (g)</label><input type="number" {...register('weight')} className="field-input p-2" placeholder="e.g. 50"/></div>
            <div><label className="field-label">Water used (ml)</label><input type="number" {...register('water')} className="field-input p-2" placeholder="e.g. 500"/></div>
            <div><label className="field-label">Recovered (ml)</label><input type="number" {...register('exRecovered')} className="field-input p-2" placeholder="e.g. 400"/></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Extraction Temp (°C)</label><input type="number" {...register('exTemp')} className="field-input p-2" placeholder="e.g. 95"/></div>
            <div><label className="field-label">Duration (min)</label><input type="number" {...register('exTime')} className="field-input p-2" placeholder="e.g. 120"/></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="field-label">Extract initial pH</label><input type="number" step="0.01" {...register('exPh')} className="field-input p-2" placeholder="e.g. 6.5"/></div>
          {/* A-36, A-54: Bioactive markers */}
          <div><label className="field-label">Polyphenol Content (mg/g) <span className="text-slate-400 text-xs">A-36</span></label><input type="number" step="0.1" {...register('polyphenolMgG')} className="field-input p-2" placeholder="e.g. 12.5"/></div>
          <div><label className="field-label">β-Glucan Content (%) <span className="text-slate-400 text-xs">A-54</span></label><input type="number" step="0.01" {...register('betaGlucanPct')} className="field-input p-2" placeholder="e.g. 0.35"/></div>
          <div><label className="field-label">Bioactive Specification</label><input {...register('extractBioSpec')} className="field-input p-2" placeholder="e.g. ≥10mg/g polyphenols"/></div>
            <div className="flex flex-col justify-center">
              <label className="flex items-center gap-2 cursor-pointer mt-4">
                <input type="checkbox" {...register('phAdjDone')} className="w-4 h-4 rounded border-slate-300"/>
                <span className="text-xs font-bold text-slate-700">pH Adjusted before addition?</span>
              </label>
            </div>
          </div>
          {watchPhAdjDone && (
            <div><label className="field-label">pH Adjustment Notes</label>
              <input {...register('phAdjNotes')} className="field-input p-2" placeholder="e.g. Added 2 drops 1M Lactic acid to reach 4.5"/>
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
            <div><label className="field-label">Integration Vol (ml)<span className="text-red-500">*</span></label><input type="number" {...register('volAdded')} className="field-input p-2" placeholder="e.g. 150"/></div>
            <div><label className="field-label">Addition %</label><input type="number" {...register('addPct')} className="field-input p-2" placeholder="e.g. 10"/></div>
            <div><label className="field-label">FINAL PRODUCT pH<span className="text-red-500">*</span></label><input type="number" step="0.01" {...register('finalPh')} className="field-input p-2" placeholder="4.35"/></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="field-label">Addition Method</label>
              <select {...register('addMethod')} className="field-input bg-white text-xs">
                {ADD_METHOD.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="field-label">Blended Temp Condition</label>
              <select {...register('addTemp')} className="field-input bg-white text-xs">
                {ADD_TEMP.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Colour Before</label><input {...register('colBefore')} className="field-input p-2" placeholder="Yellowish"/></div>
            <div><label className="field-label">Colour After</label><input {...register('colAfter')} className="field-input p-2" placeholder="Amber brown"/></div>
          </div>
          <div className="flex border-t border-slate-100 pt-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('lafUsed')} className="w-5 h-5 rounded border-slate-300"/>
              <span className="text-sm font-bold text-slate-700">LAF Cabinet / Clean Room used</span>
            </label>
          </div>
          <div><label className="field-label">Notes</label>
            <input {...register('notes')} className="field-input p-2" placeholder="Any observed precipitation..."/>
          </div>

          {/* G-36: Mixing parameters */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <p className="text-xs font-black uppercase text-slate-500 tracking-wider">Mixing & Integration Parameters</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Mixing Time (min)</label>
                <input type="number" step="0.5" {...register('mixingTimeMin')} className="field-input p-2" placeholder="e.g. 10"/>
              </div>
              <div><label className="field-label">Mixing Speed (rpm)</label>
                <input type="number" step="10" {...register('mixingSpeedRpm')} className="field-input p-2" placeholder="e.g. 150"/>
              </div>
            </div>
            {/* G-38: Actual addition temperature */}
            <div><label className="field-label">Actual Addition Temp (°C) <span className="text-slate-400 font-normal text-xs">(measured)</span></label>
              <input type="number" step="0.1" {...register('addTempActual')} className="field-input p-2" placeholder="e.g. 24.5"/>
            </div>
            {/* G-37: Blend homogeneity */}
            <div><label className="field-label">Blend Homogeneity Check</label>
              <div className="flex gap-2">
                {['Homogeneous','Slight separation','Phase separation observed'].map(o=>(
                  <button key={o} type="button" onClick={()=>setValue('blendHomogeneity', o)}
                    className={`flex-1 py-1.5 text-xs font-black rounded-lg border transition-all ${watchBlendHomogeneity===o?'bg-navy text-white border-navy':'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
            {/* G-35: Post-mixing QC checks */}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Post-mixing pH</label>
                <input type="number" step="0.01" {...register('postMixingPh')} className="field-input p-2" placeholder="e.g. 4.30"/>
              </div>
              <div><label className="field-label">Post-mixing Brix (°Bx)</label>
                <input type="number" step="0.1" {...register('postMixingBrix')} className="field-input p-2" placeholder="e.g. 8.5"/>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
            <button onClick={handleSubmit((data) => onSubmit(data, null))} disabled={saving} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
              {saving?'Saving...':'Save Draft'}
            </button>
            <button onClick={handleSubmit((data) => onSubmit(data, 'qc_hold'))} disabled={saving||actionLoading} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
              Complete Extract Addition → QC Hold
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
