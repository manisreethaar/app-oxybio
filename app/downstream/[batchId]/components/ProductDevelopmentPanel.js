'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Leaf, CheckCircle2, Plus, Trash2, Droplets, FlaskConical, AlertTriangle } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const SPECIES = ['Cordyceps militaris', 'Hericium erinaceus', 'Ganoderma lucidum', 'Inonotus obliquus', 'Tremella fuciformis'];
const ADD_TEMP = ['Ambient (22-26°C)', 'Chilled (≤8°C)'];
const ADD_METHOD = ['Aseptic pouring', 'Sterile pipette', 'Peristaltic pump'];
const BLEND_OPTS = ['Homogeneous', 'Slight separation', 'Phase separation observed'];
// FSSAI major allergen list (G-06)
const ALLERGEN_OPTIONS = ['Milk / Dairy', 'Gluten / Wheat', 'Soy', 'Tree Nuts', 'Peanuts', 'Sesame', 'Eggs', 'Fish / Shellfish'];

// RTD ingredients with their typical unit of measure
const RTD_INGREDIENT_UNITS = {
  'Milk (Full Fat)': 'ml', 'Milk (Skim)': 'ml', 'Water': 'ml',
  'Sugar (Sucrose)': 'g', 'Honey': 'g', 'Jaggery': 'g',
  'Vanilla Extract': 'ml', 'Cocoa Powder': 'g', 'Cinnamon': 'g',
  'Cardamom': 'g', 'Ginger Extract': 'ml', 'Lemon Juice': 'ml',
  'Salt': 'g', 'Starch (Tapioca)': 'g', 'Locust Bean Gum': 'g',
  'Other (specify)': 'g',
};
const RTD_INGREDIENT_OPTIONS = Object.keys(RTD_INGREDIENT_UNITS);

export default function ProductDevelopmentPanel({ batch, activeFlask, employees, availableStock, employeeProfile, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  // G-06: allergen declaration (multi-select toggle — not a form field)
  const [allergens, setAllergens] = useState([]);
  const [noneAllergens, setNoneAllergens] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, control } = useForm({
    defaultValues: {
      // Stream selection
      productStream: 'liquid',   // 'liquid' | 'pellet' | 'both'
      // Mushroom Extract
      species: SPECIES[0], lotId: '',
      weight: '', water: '', exTemp: '', exTime: '', exRecovered: '',
      exPh: '', phAdjDone: false, phAdjNotes: '',
      polyphenolMgG: '', betaGlucanPct: '', extractBioSpec: '',
      // Liquid stream
      volAdded: '', addPct: '', finalPh: '',
      addTemp: ADD_TEMP[0], addMethod: ADD_METHOD[0], addTempActual: '',
      colBefore: '', colAfter: '', lafUsed: true,
      mixingTimeMin: '', mixingSpeedRpm: '',
      postMixingPh: '', postMixingBrix: '', blendHomogeneity: '',
      // Pellet stream
      pelletWetWtG: '', pelletDryWtG: '', pelletMoistPct: '',
      pelletColour: '', pelletTexture: '',
      pelletResuspBuffer: '', pelletResuspVolMl: '',
      pelletPackagingForm: 'Capsule',
      // RTD
      rtdEnabled: false,
      rtdBatchVolMl: '', rtdTargetBrix: '', rtdTargetPh: '',
      rtdFinalPh: '', rtdFinalBrix: '',
      rtdIngredients: [],
      // Common
      notes: '',
    }
  });

  const { fields: rtdFields, append: appendRtd, remove: removeRtd } = useFieldArray({ control, name: 'rtdIngredients' });

  const watchStream     = watch('productStream');
  const watchRtdEnabled = watch('rtdEnabled');
  const watchPhAdjDone  = watch('phAdjDone');
  const watchBlendHom   = watch('blendHomogeneity');

  const mshStock = availableStock.filter(s =>
    s.inventory_items?.category === 'mushroom_extract' || s.inventory_items?.category === 'raw_material'
  );

  const fetchRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let data;
    try {
      ({ data } = await withTimeout(
        supabase.from('batch_flask_extract_addition').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
        45000, 'Product Development record load timed out'
      ));
    } catch (err) {
      console.error('ProductDevelopmentPanel fetch error:', err);
      return;
    }
    if (data) {
      setRecord(data);
      reset({
        productStream:       data.product_stream || 'liquid',
        species:             data.mushroom_species || SPECIES[0],
        lotId:               data.mushroom_lot_id || '',
        weight:              data.mushroom_weight_g || '',
        water:               data.extraction_water_ml || '',
        exTemp:              data.extraction_temp_c || '',
        exTime:              data.extraction_duration_min || '',
        exRecovered:         data.extract_recovered_ml || '',
        exPh:                data.extract_ph || '',
        phAdjDone:           data.ph_adjustment_done || false,
        phAdjNotes:          data.ph_adjustment_notes || '',
        polyphenolMgG:       data.polyphenol_mg_g || '',
        betaGlucanPct:       data.beta_glucan_pct || '',
        extractBioSpec:      data.extract_biospec || '',
        volAdded:            data.extract_vol_added_ml || '',
        addPct:              data.addition_pct || '',
        finalPh:             data.final_product_ph || '',
        addTemp:             data.addition_temp || ADD_TEMP[0],
        addMethod:           data.addition_method || ADD_METHOD[0],
        addTempActual:       data.addition_temp_actual_c || '',
        colBefore:           data.colour_before || '',
        colAfter:            data.colour_after || '',
        lafUsed:             data.laf_used ?? true,
        mixingTimeMin:       data.mixing_time_min || '',
        mixingSpeedRpm:      data.mixing_speed_rpm || '',
        postMixingPh:        data.post_mixing_ph_check || '',
        postMixingBrix:      data.post_mixing_brix || '',
        blendHomogeneity:    data.blend_homogeneity_check || '',
        pelletWetWtG:        data.pellet_wet_wt_g || '',
        pelletDryWtG:        data.pellet_dry_wt_g || '',
        pelletMoistPct:      data.pellet_moisture_pct || '',
        pelletColour:        data.pellet_colour || '',
        pelletTexture:       data.pellet_texture || '',
        pelletResuspBuffer:  data.pellet_resusp_buffer || '',
        pelletResuspVolMl:   data.pellet_resusp_vol_ml || '',
        pelletPackagingForm: data.pellet_packaging_form || 'Capsule',
        rtdEnabled:          data.rtd_enabled || false,
        rtdBatchVolMl:       data.rtd_batch_vol_ml || '',
        rtdTargetBrix:       data.rtd_target_brix || '',
        rtdTargetPh:         data.rtd_target_ph || '',
        rtdFinalPh:          data.rtd_final_ph || '',
        rtdFinalBrix:        data.rtd_final_brix || '',
        rtdIngredients:      data.rtd_ingredients || [],
        notes:               data.notes || '',
      });
      const saved = data.allergen_declaration || [];
      if (saved.includes('None')) { setNoneAllergens(true); setAllergens([]); }
      else { setAllergens(saved); setNoneAllergens(false); }
    } else {
      setRecord(null);
    }
  }, [activeFlask?.id, supabase, reset]);

  useEffect(() => { setRecord(null); fetchRecord(); }, [fetchRecord]);

  const onSubmit = async (formData, advanceTarget = null) => {
    if (!activeFlask) return;
    if (setGlobalError) setGlobalError(null);
    if (advanceTarget) {
      const missing = [];
      if (!formData.finalPh && formData.productStream !== 'pellet') missing.push('Final Product pH');
      if (!noneAllergens && allergens.length === 0) missing.push('Allergen Declaration');
      if (formData.productStream !== 'liquid' && !formData.pelletWetWtG) missing.push('Pellet Wet Weight');
      if (formData.rtdEnabled && formData.rtdIngredients.length === 0) missing.push('At least one RTD ingredient');
      if (missing.length > 0) {
        const msg = `Cannot advance to QC Hold. Missing: ${missing.join(', ')}.`;
        if (setGlobalError) setGlobalError(msg);
        toast.warn(msg);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        flask_id: activeFlask.id, batch_id: batch.id, operator_id: employeeProfile?.id,
        product_stream:          formData.productStream,
        mushroom_species:         formData.species,
        mushroom_lot_id:          formData.lotId || null,
        mushroom_weight_g:        formData.weight ? parseFloat(formData.weight) : null,
        extraction_water_ml:      formData.water ? parseFloat(formData.water) : null,
        extraction_temp_c:        formData.exTemp ? parseFloat(formData.exTemp) : null,
        extraction_duration_min:  formData.exTime ? parseFloat(formData.exTime) : null,
        extract_recovered_ml:     formData.exRecovered ? parseFloat(formData.exRecovered) : null,
        extract_ph:               formData.exPh ? parseFloat(formData.exPh) : null,
        ph_adjustment_done:       formData.phAdjDone,
        ph_adjustment_notes:      formData.phAdjDone ? formData.phAdjNotes : null,
        polyphenol_mg_g:          formData.polyphenolMgG ? parseFloat(formData.polyphenolMgG) : null,
        beta_glucan_pct:          formData.betaGlucanPct ? parseFloat(formData.betaGlucanPct) : null,
        extract_biospec:          formData.extractBioSpec || null,
        extract_vol_added_ml:     formData.volAdded ? parseFloat(formData.volAdded) : null,
        addition_pct:             formData.addPct ? parseFloat(formData.addPct) : null,
        final_product_ph:         formData.finalPh ? parseFloat(formData.finalPh) : null,
        addition_temp:            formData.addTemp,
        addition_method:          formData.addMethod,
        addition_temp_actual_c:   formData.addTempActual ? parseFloat(formData.addTempActual) : null,
        colour_before:            formData.colBefore || null,
        colour_after:             formData.colAfter || null,
        laf_used:                 formData.lafUsed,
        mixing_time_min:          formData.mixingTimeMin ? parseFloat(formData.mixingTimeMin) : null,
        mixing_speed_rpm:         formData.mixingSpeedRpm ? parseFloat(formData.mixingSpeedRpm) : null,
        post_mixing_ph_check:     formData.postMixingPh ? parseFloat(formData.postMixingPh) : null,
        post_mixing_brix:         formData.postMixingBrix ? parseFloat(formData.postMixingBrix) : null,
        blend_homogeneity_check:  formData.blendHomogeneity || null,
        pellet_wet_wt_g:          formData.pelletWetWtG ? parseFloat(formData.pelletWetWtG) : null,
        pellet_dry_wt_g:          formData.pelletDryWtG ? parseFloat(formData.pelletDryWtG) : null,
        pellet_moisture_pct:      formData.pelletMoistPct ? parseFloat(formData.pelletMoistPct) : null,
        pellet_colour:            formData.pelletColour || null,
        pellet_texture:           formData.pelletTexture || null,
        pellet_resusp_buffer:     formData.pelletResuspBuffer || null,
        pellet_resusp_vol_ml:     formData.pelletResuspVolMl ? parseFloat(formData.pelletResuspVolMl) : null,
        pellet_packaging_form:    formData.pelletPackagingForm || null,
        rtd_enabled:              formData.rtdEnabled,
        rtd_batch_vol_ml:         formData.rtdBatchVolMl ? parseFloat(formData.rtdBatchVolMl) : null,
        rtd_target_brix:          formData.rtdTargetBrix ? parseFloat(formData.rtdTargetBrix) : null,
        rtd_target_ph:            formData.rtdTargetPh ? parseFloat(formData.rtdTargetPh) : null,
        rtd_final_ph:             formData.rtdFinalPh ? parseFloat(formData.rtdFinalPh) : null,
        rtd_final_brix:           formData.rtdFinalBrix ? parseFloat(formData.rtdFinalBrix) : null,
        rtd_ingredients:          formData.rtdIngredients,
        allergen_declaration:     noneAllergens ? ['None'] : allergens,
        notes:                    formData.notes || null,
      };
      const { error } = await withTimeout(
        supabase.from('batch_flask_extract_addition').upsert(payload, { onConflict: 'flask_id' }),
        15000, 'Save timed out. Check connection.'
      );
      if (error) throw error;
      if (advanceTarget && onAdvanceFlaskStage) {
        toast.success('Product Development saved. Advancing to QC Hold.');
        await onAdvanceFlaskStage(advanceTarget);
      } else {
        toast.success('Draft saved.');
        fetchRecord();
        onDataSaved?.();
      }
    } catch (err) {
      if (setGlobalError) setGlobalError(err.message);
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Product Development.</div>;

  const L = ({ children, required }) => (
    <label className="field-label">{children}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="card p-5 border-l-4 border-l-navy">
        <div className="flex items-center gap-2 mb-1">
          <Leaf className="w-5 h-5 text-navy"/>
          <h2 className="text-base font-bold text-slate-900">Product Development — <span className="text-slate-600">{activeFlask.flask_label}</span></h2>
        </div>
        <p className="text-xs text-slate-500">Configure the downstream product stream and log mushroom extract integration.</p>
        {record && <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600"/><span className="text-xs font-bold text-emerald-800">Record saved.</span></div>}
      </div>

      {/* Step 1: Product Stream */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-navy/5">
          <h3 className="text-sm font-bold text-navy">Step 1 — Select Product Stream</h3>
          <p className="text-xs text-slate-600 mt-0.5">Which product form(s) will be produced from this trial&apos;s biomass?</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'liquid', Icon: Droplets,    label: 'Liquid (Broth)',  desc: 'Fermented broth with mushroom extract added' },
              { id: 'pellet', Icon: FlaskConical, label: 'Pellet (Biomass)', desc: 'Centrifuged pellet → powder/capsule/RTD' },
              { id: 'both',   Icon: Leaf,         label: 'Both Streams',    desc: 'Split: partial broth + partial pellet' },
            ].map(({ id, Icon, label, desc }) => (
              <button key={id} type="button" onClick={() => setValue('productStream', id)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${watchStream === id ? 'bg-navy border-navy text-white shadow-md' : 'bg-white border-slate-200 hover:border-navy/40'}`}>
                <Icon className={`w-5 h-5 mb-2 ${watchStream === id ? 'text-white' : 'text-slate-400'}`}/>
                <p className={`text-xs font-black ${watchStream === id ? 'text-white' : 'text-slate-900'}`}>{label}</p>
                <p className={`text-xs mt-0.5 ${watchStream === id ? 'text-white/70' : 'text-slate-500'}`}>{desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2: Extract Decoction */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900">Step 2 — Mushroom Decoction / Extract Prep</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><L>Species</L>
              <select {...register('species')} className="field-input bg-white text-xs">
                {SPECIES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div><L>Extract Lot from Inventory</L>
              <select {...register('lotId')} className="field-input bg-white text-xs">
                <option value="">N/A (Fresh Prep)</option>
                {mshStock.map(s => {
                  const isExpired = s.expiry_date && new Date(s.expiry_date) < new Date();
                  return <option key={s.id} value={s.id} disabled={isExpired}>{s.inventory_items?.name} (Lot: {s.lot_number || 'UN-LOT'}) {isExpired ? '(EXPIRED)' : ''}</option>;
                })}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><L>Weight (g)</L><input type="number" {...register('weight')} className="field-input" placeholder="50"/></div>
            <div><L>Water (ml)</L><input type="number" {...register('water')} className="field-input" placeholder="500"/></div>
            <div><L>Temp (°C)</L><input type="number" {...register('exTemp')} className="field-input" placeholder="95"/></div>
            <div><L>Duration (min)</L><input type="number" {...register('exTime')} className="field-input" placeholder="120"/></div>
            <div><L>Recovered (ml)</L><input type="number" {...register('exRecovered')} className="field-input" placeholder="400"/></div>
            <div><L>Extract pH</L><input type="number" step="0.01" {...register('exPh')} className="field-input" placeholder="6.5"/></div>
            <div><L>Polyphenol (mg/g)</L><input type="number" step="0.1" {...register('polyphenolMgG')} className="field-input" placeholder="12.5"/></div>
            <div><L>β-Glucan (%)</L><input type="number" step="0.01" {...register('betaGlucanPct')} className="field-input" placeholder="0.35"/></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register('phAdjDone')} className="w-4 h-4 rounded border-slate-300"/>
            <span className="text-xs font-bold text-slate-700">pH Adjusted before addition?</span>
          </label>
          {watchPhAdjDone && <div><L>pH Adjustment Notes</L><input {...register('phAdjNotes')} className="field-input" placeholder="e.g. Added 2 drops 1M Lactic acid to reach 4.5"/></div>}
        </div>
      </div>

      {/* Step 3: Liquid Stream */}
      {(watchStream === 'liquid' || watchStream === 'both') && (
        <div className="card overflow-hidden border-2 border-navy/20">
          <div className="px-5 py-4 border-b border-navy/10 bg-navy/5">
            <div className="flex items-center gap-2"><Droplets className="w-4 h-4 text-navy"/><h3 className="text-sm font-bold text-navy">Liquid Stream — Broth Integration</h3></div>
            <p className="text-xs text-slate-600 mt-0.5">Extract addition into the fermented broth.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><L required>Integration Vol (ml)</L><input type="number" {...register('volAdded')} className="field-input" placeholder="150"/></div>
              <div><L>Addition %</L><input type="number" {...register('addPct')} className="field-input" placeholder="10"/></div>
              <div><L required>Final Product pH</L><input type="number" step="0.01" {...register('finalPh')} className="field-input" placeholder="4.35"/></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><L>Addition Method</L><select {...register('addMethod')} className="field-input bg-white text-xs">{ADD_METHOD.map(m => <option key={m}>{m}</option>)}</select></div>
              <div><L>Target Temp</L><select {...register('addTemp')} className="field-input bg-white text-xs">{ADD_TEMP.map(m => <option key={m}>{m}</option>)}</select></div>
              <div><L>Actual Temp (°C)</L><input type="number" step="0.1" {...register('addTempActual')} className="field-input" placeholder="24.5"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><L>Colour Before</L><input {...register('colBefore')} className="field-input" placeholder="Yellowish"/></div>
              <div><L>Colour After</L><input {...register('colAfter')} className="field-input" placeholder="Amber brown"/></div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <p className="text-xs font-black uppercase text-slate-500 tracking-wider">Mixing Parameters</p>
              <div className="grid grid-cols-2 gap-3">
                <div><L>Mixing Time (min)</L><input type="number" step="0.5" {...register('mixingTimeMin')} className="field-input" placeholder="10"/></div>
                <div><L>Mixing Speed (rpm)</L><input type="number" step="10" {...register('mixingSpeedRpm')} className="field-input" placeholder="150"/></div>
                <div><L>Post-mix pH</L><input type="number" step="0.01" {...register('postMixingPh')} className="field-input" placeholder="4.30"/></div>
                <div><L>Post-mix Brix (°Bx)</L><input type="number" step="0.1" {...register('postMixingBrix')} className="field-input" placeholder="8.5"/></div>
              </div>
              <div><L>Blend Homogeneity</L>
                <div className="flex gap-2 mt-1">{BLEND_OPTS.map(o => (
                  <button key={o} type="button" onClick={() => setValue('blendHomogeneity', o)}
                    className={`flex-1 py-1.5 text-xs font-black rounded-lg border transition-all ${watchBlendHom === o ? 'bg-navy text-white border-navy' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{o}</button>
                ))}</div>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer border-t border-slate-100 pt-3">
              <input type="checkbox" {...register('lafUsed')} className="w-4 h-4 rounded border-slate-300"/>
              <span className="text-xs font-bold text-slate-700">LAF Cabinet / Clean Room used</span>
            </label>
          </div>
        </div>
      )}

      {/* Step 4: Pellet Stream */}
      {(watchStream === 'pellet' || watchStream === 'both') && (
        <div className="card overflow-hidden border-2 border-amber-200">
          <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
            <div className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-amber-600"/><h3 className="text-sm font-bold text-amber-900">Pellet Stream — Biomass Processing</h3></div>
            <p className="text-xs text-amber-700 mt-0.5">Centrifuged pellet characterisation and packaging intent.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><L required>Wet Weight (g)</L><input type="number" step="0.1" {...register('pelletWetWtG')} className="field-input" placeholder="42.5"/></div>
              <div><L>Dry Weight (g)</L><input type="number" step="0.1" {...register('pelletDryWtG')} className="field-input" placeholder="12.0"/></div>
              <div><L>Moisture (%)</L><input type="number" step="0.1" {...register('pelletMoistPct')} className="field-input" placeholder="72"/></div>
              <div><L>Colour</L><input {...register('pelletColour')} className="field-input" placeholder="Off-white, beige..."/></div>
              <div><L>Texture</L><input {...register('pelletTexture')} className="field-input" placeholder="Firm, pasty..."/></div>
              <div><L>Packaging Intent</L>
                <select {...register('pelletPackagingForm')} className="field-input bg-white text-xs">
                  {['Capsule','Powder (sachet)','Tablet','RTD blend','Bulk (frozen)'].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div><L>Resusp. Buffer</L><input {...register('pelletResuspBuffer')} className="field-input" placeholder="PBS, citrate..."/></div>
              <div><L>Resusp. Vol (ml)</L><input type="number" {...register('pelletResuspVolMl')} className="field-input" placeholder="50"/></div>
            </div>

            {/* RTD sub-section */}
            <div className="p-4 rounded-xl border-2 border-dashed border-amber-300 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('rtdEnabled')} className="w-4 h-4 rounded border-amber-400"/>
                <span className="text-xs font-black text-amber-900">Transform pellet into Ready-to-Drink (RTD) formulation</span>
              </label>
              {watchRtdEnabled && (
                <div className="space-y-4 pt-2 border-t border-amber-200">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div><L>Batch Volume (ml)</L><input type="number" {...register('rtdBatchVolMl')} className="field-input" placeholder="500"/></div>
                    <div><L>Target Brix (°Bx)</L><input type="number" step="0.1" {...register('rtdTargetBrix')} className="field-input" placeholder="12"/></div>
                    <div><L>Target pH</L><input type="number" step="0.01" {...register('rtdTargetPh')} className="field-input" placeholder="4.2"/></div>
                    <div><L>Final Brix achieved</L><input type="number" step="0.1" {...register('rtdFinalBrix')} className="field-input" placeholder="measured"/></div>
                    <div><L>Final pH achieved</L><input type="number" step="0.01" {...register('rtdFinalPh')} className="field-input" placeholder="measured"/></div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wider">RTD Ingredients</p>
                      <button type="button"
                        onClick={() => appendRtd({ name: RTD_INGREDIENT_OPTIONS[0], qty: '', unit: RTD_INGREDIENT_UNITS[RTD_INGREDIENT_OPTIONS[0]], notes: '' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg">
                        <Plus className="w-3.5 h-3.5"/> Add
                      </button>
                    </div>
                    {rtdFields.length === 0 && <p className="text-xs text-slate-400 text-center py-3">No ingredients yet. Click &quot;Add&quot; to start building the RTD recipe.</p>}
                    <div className="space-y-2">
                      {rtdFields.map((field, idx) => (
                        <div key={field.id} className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                          <select {...register(`rtdIngredients.${idx}.name`)}
                            onChange={e => { setValue(`rtdIngredients.${idx}.name`, e.target.value); setValue(`rtdIngredients.${idx}.unit`, RTD_INGREDIENT_UNITS[e.target.value] || 'g'); }}
                            className="flex-1 min-w-0 text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white font-semibold outline-none focus:border-amber-400">
                            {RTD_INGREDIENT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                          </select>
                          <input type="number" step="any" {...register(`rtdIngredients.${idx}.qty`)} placeholder="Qty"
                            className="w-20 shrink-0 text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white font-semibold outline-none focus:border-amber-400"/>
                          <input {...register(`rtdIngredients.${idx}.unit`)} placeholder="unit"
                            className="w-14 shrink-0 text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white font-semibold outline-none focus:border-amber-400"/>
                          <input {...register(`rtdIngredients.${idx}.notes`)} placeholder="Notes"
                            className="flex-1 min-w-0 text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-amber-400"/>
                          <button type="button" onClick={() => removeRtd(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Allergen + Notes + Submit */}
      <div className="card p-5 space-y-4">
        <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600"/>
            <span className="text-sm font-black text-amber-900">Allergen Declaration</span>
            <span className="text-xs text-amber-600 font-semibold">Mandatory — FSSAI</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALLERGEN_OPTIONS.map(al => (
              <button key={al} type="button" disabled={noneAllergens}
                onClick={() => setAllergens(prev => prev.includes(al) ? prev.filter(a => a !== al) : [...prev, al])}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all disabled:opacity-40 ${allergens.includes(al) ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-400'}`}>
                {al}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer border-t border-amber-200 pt-2">
            <input type="checkbox" checked={noneAllergens} onChange={e => { setNoneAllergens(e.target.checked); if (e.target.checked) setAllergens([]); }} className="w-4 h-4 rounded border-amber-300"/>
            <span className="text-xs font-bold text-amber-900">None of the above allergens present</span>
          </label>
          {(noneAllergens || allergens.length > 0) && <p className="text-xs text-amber-700 font-semibold">Declared: <strong>{noneAllergens ? 'None' : allergens.join(', ')}</strong></p>}
        </div>

        <div>
          <label className="field-label">General Notes</label>
          <textarea {...register('notes')} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none" placeholder="Observations, deviations, anomalies..."/>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
          <button onClick={handleSubmit(data => onSubmit(data, null))} disabled={saving}
            className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={handleSubmit(data => onSubmit(data, 'qc_hold'))} disabled={saving || actionLoading}
            className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Complete Product Dev → QC Hold
          </button>
        </div>
      </div>
    </div>
  );
}
