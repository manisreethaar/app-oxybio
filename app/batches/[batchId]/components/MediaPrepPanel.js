'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Beaker, AlertTriangle, ClipboardList, X } from 'lucide-react';
import { syncStageToLNB } from '@/lib/lnbSync';

export default function MediaPrepPanel({ batch, employees, availableStock, employeeProfile, role, supabase, onDataSaved, onAdvanceStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [data,   setData]   = useState(null);
  const [saving, setSaving] = useState(false);
  const isIntern = ['intern','research_intern'].includes(role);
  const isF2 = batch.experiment_type === 'F2';

  const formulationIngredients = useMemo(() => {
    try {
      const raw = batch.formulations?.ingredients;
      return Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    } catch { return []; }
  }, [batch.formulations]);

  const baseVol = batch.formulations?.base_volume_ml || 1000;
  const targetVol = (batch.planned_volume_ml || 0) * (batch.num_flasks || 1) || baseVol;
  const scaleFactor = targetVol / baseVol;

  const { register, handleSubmit, setValue, getValues, watch, reset, control } = useForm({
    defaultValues: {
      bomUsage: {},
      kavuniTemp: '',
      kavuniMin: '',
      waterVol: '',
      totalVol: '',
      initPH: '',
      notes: '',
      supervisedBy: '',
      particleSize: '',
      starchGelTemp: '',
      starchGelConfirm: false,
      bufferCapacity: '',
      viscosityCp: '',
      substratePhotoUrl: '',
      awValue: '',
      pretreatSteps: []
    }
  });

  const watchBomUsage = watch('bomUsage');
  const watchAwValue = watch('awValue');
  const watchStarchGelConfirm = watch('starchGelConfirm');
  const watchPretreatSteps = watch('pretreatSteps');
  
  const { fields: pretreatFields, append: appendPretreat, remove: removePretreat } = useFieldArray({
    control,
    name: 'pretreatSteps'
  });

  // G-17: BOM report modal
  const [showBomReport, setShowBomReport] = useState(false);

  // Initialize BOM usage state from ingredients
  useEffect(() => {
    const nextBomUsage = { ...getValues('bomUsage') };
    formulationIngredients.forEach(ing => {
      if (!nextBomUsage[ing.item_id]) nextBomUsage[ing.item_id] = { lotId: '', usedQty: '' };
    });
    setValue('bomUsage', nextBomUsage);
  }, [formulationIngredients, setValue, getValues]);

  const loadData = useCallback(async () => {
    let isCurrent = true;
    let d;
    try {
      ({ data: d } = await withTimeout(supabase.from('batch_stage_media_prep').select('*').eq('batch_id', batch.id).maybeSingle(), 45000, 'Media prep data load timed out'));
    } catch (err) {
      console.error('MediaPrepPanel fetch error:', err);
      return;
    }
    if (!isCurrent) return;
    if (d) {
      setData(d);
      
      const nextBomUsage = { ...getValues('bomUsage') };
      formulationIngredients.forEach(ing => {
        const nameLower = ing.name?.toLowerCase() || '';
        if (nameLower.includes('ragi') && d.ragi_lot_id) {
          nextBomUsage[ing.item_id] = { lotId: d.ragi_lot_id, usedQty: d.ragi_weight_g ? String(d.ragi_weight_g) : '' };
        }
        if (nameLower.includes('kavuni') && d.kavuni_lot_id) {
          nextBomUsage[ing.item_id] = { lotId: d.kavuni_lot_id, usedQty: d.kavuni_weight_g ? String(d.kavuni_weight_g) : '' };
        }
      });
      
      reset({
        kavuniTemp: d.kavuni_precook_temp_c||'',
        kavuniMin: d.kavuni_precook_min||'',
        waterVol: d.water_volume_ml||'',
        totalVol: d.total_volume_ml||'',
        initPH: d.initial_ph||'',
        notes: d.notes||'',
        supervisedBy: d.supervised_by||'',
        particleSize: d.particle_size_mesh||'',
        starchGelTemp: d.starch_gelat_temp_c||'',
        starchGelConfirm: d.starch_gelat_confirmed||false,
        bufferCapacity: d.buffer_capacity_mmol_l||'',
        viscosityCp: d.viscosity_cp||'',
        substratePhotoUrl: d.substrate_photo_url||'',
        awValue: d.aw_value||'',
        pretreatSteps: d.pre_treatment_steps||[],
        bomUsage: nextBomUsage
      });

    } else {
      let initTotalVol = '';
      let initWaterVol = '';
      if (batch.planned_volume_ml && batch.num_flasks) {
        initTotalVol = String(batch.planned_volume_ml * batch.num_flasks);
      }
      for (const ing of formulationIngredients) {
        const nameLower = ing.name?.toLowerCase() || '';
        const scaledQty = ((parseFloat(ing.quantity) || 0) * scaleFactor).toFixed(2);
        const displayQty = String(parseFloat(scaledQty));
        if (nameLower.includes('water')) initWaterVol = displayQty;
      }
      setValue('totalVol', initTotalVol);
      setValue('waterVol', initWaterVol);
    }
    return () => { isCurrent = false; };
  }, [batch.id, supabase]); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  const getUsageFor = (nameSubstring, formData) => {
    const ing = formulationIngredients.find(i => i.name?.toLowerCase().includes(nameSubstring));
    if (!ing) return { lot: '', wt: null };
    const u = formData.bomUsage[ing.item_id];
    return { lot: u?.lotId || null, wt: u?.usedQty ? parseFloat(u.usedQty) : null };
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  // Server-side deduction — called once when Media Prep is marked complete.
  // Replaces the old client-side deductLot() which used wrong column names
  // (movement_type / batch_reference don't exist in inventory_movements).
  const deductAllLots = async (formData) => {
    const entries = formulationIngredients
      .map(ing => {
        const u = formData.bomUsage[ing.item_id];
        if (u?.lotId && u?.usedQty && parseFloat(u.usedQty) > 0) {
          return { stock_id: u.lotId, quantity_used: parseFloat(u.usedQty), item_name: ing.name };
        }
        return null;
      })
      .filter(Boolean);

    if (!entries.length) return;

    // withTimeout() is a pass-through (see lib/withTimeout.js) — it does not
    // actually enforce a limit. Every other write in this file goes through
    // the Supabase browser client, which has its own 15s AbortController
    // wrapper (utils/supabase/client.ts), so it can't hang forever. This is
    // a plain fetch() to a Next.js API route with no such wrapper, so a slow
    // or stuck server response left the Save button showing "Saving..."
    // indefinitely with no error. Guard it with a real timeout instead.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await window.fetch(`/api/batches/${batch.id}/media-deduct`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entries, employee_id: employeeProfile?.id }),
        signal:  controller.signal,
      });
      const json = await res.json();
      (json.warnings || []).forEach(w => toast.warn(w));
    } catch (err) {
      console.error('Media deduction error:', err);
      const message = err.name === 'AbortError' ? 'Inventory deduction timed out after 30 seconds.' : err.message;
      toast.error('Failed to deduct inventory: ' + message);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const onSubmit = async (formData, advance = false) => {
    if (isIntern && !formData.supervisedBy) { toast.warn('Select a supervisor.'); return; }
    await executeSave(formData, advance);
  };

  const executeSave = async (formData, advance = false) => {
    setSaving(true);
    try {
      const ragiU = getUsageFor('ragi', formData);
      const kavuniU = getUsageFor('kavuni', formData);

      const { error } = await withTimeout(supabase.from('batch_stage_media_prep').upsert({
        batch_id: batch.id,
        ragi_lot_id: ragiU.lot, ragi_weight_g: ragiU.wt,
        kavuni_lot_id: kavuniU.lot, kavuni_weight_g: kavuniU.wt,
        kavuni_precook_temp_c: formData.kavuniTemp ? parseFloat(formData.kavuniTemp) : null,
        kavuni_precook_min: formData.kavuniMin ? parseFloat(formData.kavuniMin) : null,
        water_volume_ml: formData.waterVol ? parseFloat(formData.waterVol) : null,
        total_volume_ml: formData.totalVol ? parseFloat(formData.totalVol) : null,
        initial_ph: formData.initPH ? parseFloat(formData.initPH) : null,
        is_complete: advance, operator_id: employeeProfile?.id,
        supervised_by: formData.supervisedBy || null, notes: formData.notes || null,
        particle_size_mesh:  formData.particleSize || null,
        starch_gelat_temp_c: formData.starchGelTemp ? parseFloat(formData.starchGelTemp) : null,
        starch_gelat_confirmed: formData.starchGelConfirm,
        buffer_capacity_mmol_l: formData.bufferCapacity ? parseFloat(formData.bufferCapacity) : null,
        viscosity_cp: formData.viscosityCp ? parseFloat(formData.viscosityCp) : null,
        aw_value:            formData.awValue ? parseFloat(formData.awValue) : null,
        pre_treatment_steps: formData.pretreatSteps,
        substrate_photo_url: formData.substratePhotoUrl || null,
      }, { onConflict: 'batch_id' }), 30000, 'Save timed out');
      if (error) throw error;

      // Full BOM lot traceability (every ingredient, not just ragi/kavuni) —
      // re-synced on every save so this always reflects the latest bomUsage.
      const ingredientRows = formulationIngredients
        .map(ing => {
          const u = formData.bomUsage[ing.item_id];
          if (!u?.lotId) return null;
          return {
            batch_id: batch.id,
            stock_id: u.lotId,
            item_id: ing.item_id,
            item_name: ing.name,
            used_qty: u.usedQty ? parseFloat(u.usedQty) : null,
            unit: ing.unit || null,
          };
        })
        .filter(Boolean);
      await supabase.from('batch_media_prep_ingredients').delete().eq('batch_id', batch.id);
      if (ingredientRows.length > 0) {
        await supabase.from('batch_media_prep_ingredients').insert(ingredientRows);
      }

      if (advance) {
        await deductAllLots(formData);
      }

      toast.success(advance ? 'Media Prep complete. BOM Inventory deducted.' : 'Draft saved.');
      // G-50: Notify supervisors if any ingredient >10% deviation
      const deviations = formulationIngredients.filter(ing => {
        const target = ((parseFloat(ing.quantity)||0) * scaleFactor);
        const actual = parseFloat((formData.bomUsage[ing.item_id]||{}).usedQty);
        return !isNaN(actual) && target > 0 && Math.abs((actual-target)/target*100) > 10;
      });
      if (deviations.length > 0 && supervisors.length > 0) {
        supervisors.forEach(sup => {
          fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assigned_to: sup.id,
              title: `Media Prep Deviation — Batch ${batch.batch_id}`,
              body: `${deviations.length} ingredient(s) deviate >10% from BOM target: ${deviations.map(i=>i.name).join(', ')}. Review and log deviation if required.`,
              url: `/batches/${batch.id}`,
            }),
          }).catch(() => {});
        });
      }
      syncStageToLNB(supabase, batch.id, 'media_prep', {
        ragi_lot_id: ragiU.lot,
        ragi_weight_g: ragiU.wt,
        kavuni_lot_id: kavuniU.lot,
        kavuni_weight_g: kavuniU.wt,
        kavuni_precook_temp_c: formData.kavuniTemp ? parseFloat(formData.kavuniTemp) : null,
        kavuni_precook_min: formData.kavuniMin ? parseFloat(formData.kavuniMin) : null,
        water_volume_ml: formData.waterVol ? parseFloat(formData.waterVol) : null,
        total_volume_ml: formData.totalVol ? parseFloat(formData.totalVol) : null,
        initial_ph: formData.initPH ? parseFloat(formData.initPH) : null,
      });
      if (advance) {
        await onAdvanceStage('sterilisation');
      } else {
        loadData();
        onDataSaved();
      }
    } catch (err) { 
      if (setGlobalError) setGlobalError(err.message);
      toast.error(err.message); 
    }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-3">
        <Beaker className="w-5 h-5 text-slate-600"/>
        <div><h2 className="text-base font-bold text-slate-900">Media Preparation & BOM</h2>
          <p className="text-xs text-slate-500">Record all raw material BOM fulfillment and substrate setup.</p></div>
        <div className="ml-auto flex items-center gap-2">
          {/* G-17: BOM Report */}
          <button onClick={()=>setShowBomReport(true)} className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-black rounded-lg uppercase flex items-center gap-1">
            <ClipboardList className="w-3 h-3"/>BOM Report
          </button>
          {data?.is_complete && <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black rounded-lg uppercase">Complete</span>}
        </div>
      </div>

      <div className="card p-5 space-y-5">
        <div className="mb-4">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h3 className="text-xs font-black uppercase text-slate-800 mb-1">BOM Traceability</h3>
              <p className="text-xs font-medium text-slate-500">Recipe: <span className="text-slate-600 font-bold">{batch.formulations?.name}</span> | Base: {baseVol}ml | Target: {targetVol}ml</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-black uppercase text-slate-400">Scale Factor</span>
              <p className="text-sm font-black text-slate-600">{scaleFactor.toFixed(2)}x</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {formulationIngredients.length === 0 && <p className="text-xs text-slate-400 italic">No ingredients found in recipe.</p>}
            {formulationIngredients.map(ing => {
               const scaledQty = ((parseFloat(ing.quantity) || 0) * scaleFactor).toFixed(2);
               // Filter stock: match by exact item_id, OR match by name for legacy compat
               const matchStock = availableStock.filter(s => s.item_id === ing.item_id || s.inventory_items?.id === ing.item_id || (s.inventory_items?.name?.toLowerCase() === ing.name?.toLowerCase()));
               const usage = watchBomUsage?.[ing.item_id] || {lotId:'', usedQty:''};
               const isKavuni = ing.name?.toLowerCase().includes('kavuni');

               return (
                 <div key={ing.item_id} className="p-4 border border-slate-100 bg-slate-50/20 rounded-xl">
                   <div className="flex justify-between items-center mb-3">
                     <span className="font-bold text-sm text-slate-900">{ing.name}</span>
                     <span className="text-xs font-black text-slate-600 bg-slate-100 px-2 py-1 rounded">Target: {parseFloat(scaledQty)} {ing.unit}</span>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     <div>
                       <div className="flex items-center justify-between mb-1">
                         <label className="field-label mb-0">Inventory Lot Selection</label>
                         {/* G-18: Clear lot selection */}
                         {usage.lotId && (
                           <button type="button" onClick={() => setValue(`bomUsage.${ing.item_id}`, {lotId:'', usedQty:''})}
                             className="text-xs text-amber-600 font-black uppercase hover:underline flex items-center gap-0.5">
                             <X className="w-2.5 h-2.5"/>Clear Lot
                           </button>
                         )}
                       </div>
                       <select {...register(`bomUsage.${ing.item_id}.lotId`)} className="field-input">
                         <option value="">Select lot...</option>
                         {matchStock.length > 0 && <option disabled>── Matching Lots ──</option>}
                         {matchStock.map(s => {
                           const isExpired = s.expiry_date && new Date(s.expiry_date) < new Date();
                           return (
                             <option key={s.id} value={s.id} disabled={isExpired}>
                               {s.supplier_batch_number || 'UN-LOT'} | {parseFloat(s.current_quantity).toFixed(1)}{s.inventory_items?.unit} {isExpired ? '(EXPIRED)' : ''}
                             </option>
                           );
                         })}
                         {matchStock.length === 0 && <option disabled>No matching lots available</option>}
                       </select>
                     </div>
                     <div>
                       <label className="field-label">Actual Used Qty ({ing.unit})</label>
                       <input type="number" step="0.01" {...register(`bomUsage.${ing.item_id}.usedQty`)} className="field-input" placeholder={parseFloat(scaledQty)} />
                       {(() => {
                         const target = parseFloat(scaledQty);
                         const actual = parseFloat(usage.usedQty);
                         if (!usage.usedQty || isNaN(actual) || target === 0) return null;
                         const pct = Math.abs((actual - target) / target) * 100;
                         if (pct > 10) return (
                           <p className="text-xs font-bold text-amber-600 mt-1 flex items-center gap-1">
                             <AlertTriangle className="w-3 h-3 shrink-0"/>
                             {actual > target ? '+' : ''}{(actual - target).toFixed(2)} {ing.unit} deviation ({pct.toFixed(1)}% from target)
                           </p>
                         );
                         if (pct > 0) return (
                           <p className="text-xs font-semibold text-slate-400 mt-1">
                             ±{pct.toFixed(1)}% from target — within tolerance
                           </p>
                         );
                         return null;
                       })()}
                     </div>
                   </div>
                   
                   {isKavuni && isF2 && (
                     <div className="mt-4 pt-3 border-t border-slate-100/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className="field-label">Pre-cook Temp (°C)</label><input type="number" step="0.1" {...register('kavuniTemp')} className="field-input" placeholder="90.0"/></div>
                        <div><label className="field-label">Pre-cook Duration (min)</label><input type="number" {...register('kavuniMin')} className="field-input" placeholder="30"/></div>
                     </div>
                   )}
                 </div>
               );
            })}
          </div>
        </div>

        {/* G-51: Substrate particle size / mesh */}
        <div className="border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Substrate Particle Size / Mesh #</label>
              <input {...register('particleSize')} className="field-input" placeholder="e.g. 60 mesh / 250 µm"/>
            </div>
            {/* G-53: Water Activity */}
            <div>
              <label className="field-label">Water Activity (aW) <span className="text-slate-400 text-xs">substrate</span></label>
              <input type="number" step="0.01" min="0" max="1" {...register('awValue')} className="field-input" placeholder="0.95"/>
              {watchAwValue && parseFloat(watchAwValue) > 0.97 && <p className="text-xs text-amber-600 font-bold mt-0.5">⚠ aW &gt;0.97 — microbial risk elevated</p>}
            </div>
            {/* A-25: Starch Gelatinization */}
            <div>
              <label className="field-label">Starch Gelatinization Temp (°C) <span className="text-slate-400 text-xs">A-25</span></label>
              <input type="number" step="0.1" {...register('starchGelTemp')} className="field-input" placeholder="65–70°C (grain substrates)"/>
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('starchGelConfirm')} className="w-4 h-4 rounded border-slate-300"/>
                <span className="text-xs font-bold text-slate-700">Gelatinization confirmed (iodine test / viscosity change)</span>
              </label>
            </div>
            {/* A-58: Buffer Capacity */}
            <div>
              <label className="field-label">Buffer Capacity (mmol/L) <span className="text-slate-400 text-xs">A-58</span></label>
              <input type="number" step="0.1" {...register('bufferCapacity')} className="field-input" placeholder="e.g. 25"/>
              <p className="text-xs text-slate-400 mt-0.5">Resistance to pH change — affects fermentation rate variability</p>
            </div>
            {/* A-59: Viscosity */}
            <div>
              <label className="field-label">Substrate Viscosity (cP) <span className="text-slate-400 text-xs">A-59</span></label>
              <input type="number" step="0.1" {...register('viscosityCp')} className="field-input" placeholder="e.g. 120"/>
              <p className="text-xs text-slate-400 mt-0.5">Affects mixing efficiency and mass transfer</p>
            </div>
          </div>
          {/* G-85: Substrate photo URL */}
          <div>
            <label className="field-label">Substrate Photo URL <span className="text-slate-400 text-xs">optional — colour/texture traceability</span></label>
            <input type="url" {...register('substratePhotoUrl')} className="field-input" placeholder="https://... (link to substrate photo)"/>
            {watch('substratePhotoUrl') && <a href={watch('substratePhotoUrl')} target="_blank" rel="noreferrer" className="text-xs text-navy underline font-bold mt-0.5 inline-block">View photo →</a>}
          </div>
        </div>

        {/* G-52: Modular pre-treatment steps */}
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="field-label mb-0">Pre-treatment Steps</label>
            <button type="button" onClick={()=>appendPretreat({type:'Heat',target_temp:'',duration_min:'',notes:''})}
              className="px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 text-xs font-black rounded-lg uppercase hover:bg-slate-100">
              + Add Step
            </button>
          </div>
          {pretreatFields.map((step, idx) => (
            <div key={step.id} className="p-3 bg-slate-50/40 border border-slate-100 rounded-xl space-y-2">
              <div className="grid grid-cols-4 gap-2 items-center">
                <select {...register(`pretreatSteps.${idx}.type`)} className="field-input text-xs col-span-1 bg-white p-1.5">
                  {['Heat','Steam','Chemical','Enzymatic','Mechanical','Other'].map(t=><option key={t}>{t}</option>)}
                </select>
                <input type="number" {...register(`pretreatSteps.${idx}.target_temp`)} placeholder="Temp °C" className="field-input text-xs p-1.5"/>
                <input type="number" {...register(`pretreatSteps.${idx}.duration_min`)} placeholder="Min" className="field-input text-xs p-1.5"/>
                <button type="button" onClick={()=>removePretreat(idx)} className="text-red-400 hover:text-red-600 text-xs font-black">✕</button>
              </div>
              <input {...register(`pretreatSteps.${idx}.notes`)} placeholder="Notes (optional)" className="field-input text-xs p-1.5 w-full"/>
            </div>
          ))}
          {pretreatFields.length === 0 && <p className="text-xs text-slate-400 italic">No additional pre-treatment steps. Click + Add Step to log.</p>}
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Added Water Volume (ml)</label>
              <input type="number" step="1" {...register('waterVol')} className="field-input" placeholder="0"/>
            </div>
            <div>
              <label className="field-label">Total Volume Prepared (ml)</label>
              <input type="number" step="1" {...register('totalVol')} className="field-input" placeholder="250"/>
            </div>
          </div>
          <div className="mt-3">
            <label className="field-label">Initial pH of Slurry <span className="text-slate-400">(pre-fermentation)</span></label>
            <input type="number" step="0.01" {...register('initPH')} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-2xl font-black font-mono text-center focus:border-navy outline-none" placeholder="6.00"/>
          </div>
        </div>

        {isIntern && (
          <div><label className="field-label text-red-500">Supervised By *</label>
            <select {...register('supervisedBy')} className="field-input border-red-200">
              <option value="">Select supervisor...</option>
              {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}
        <textarea {...register('notes')} rows={2} placeholder="Notes / observations..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button onClick={handleSubmit((data) => onSubmit(data, false))} disabled={saving} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={handleSubmit((data) => onSubmit(data, true))} disabled={saving||actionLoading} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Complete → Sterilisation
          </button>
        </div>
      </div>

      {/* G-17: BOM Batch Traceability Report */}
      {showBomReport && (
        <div className="fixed inset-0 z-50 bg-slate-50/10 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-slate-600"/>
                <h3 className="text-base font-black text-slate-900">BOM Traceability Report</h3>
              </div>
              <button onClick={() => setShowBomReport(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400"/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500 font-semibold">Batch: <span className="font-black text-slate-800">{batch.batch_id}</span> · Recipe: <span className="font-black text-navy">{batch.formulations?.name}</span></p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-100 px-3 py-2 text-left font-black text-slate-800">Ingredient</th>
                    <th className="border border-slate-100 px-3 py-2 text-right font-black text-slate-800">Target</th>
                    <th className="border border-slate-100 px-3 py-2 font-black text-slate-800">Lot Selected</th>
                    <th className="border border-slate-100 px-3 py-2 text-right font-black text-slate-800">Actual</th>
                    <th className="border border-slate-100 px-3 py-2 text-right font-black text-slate-800">Dev %</th>
                  </tr>
                </thead>
                <tbody>
                  {formulationIngredients.map(ing => {
                    const target = ((parseFloat(ing.quantity)||0) * scaleFactor).toFixed(2);
                    const usage = watchBomUsage?.[ing.item_id] || {};
                    const actual = parseFloat(usage.usedQty);
                    const dev = (!isNaN(actual) && parseFloat(target)>0) ? ((actual - parseFloat(target)) / parseFloat(target) * 100).toFixed(1) : '—';
                    const devNum = parseFloat(dev);
                    const lot = availableStock.find(s=>s.id===usage.lotId);
                    return (
                      <tr key={ing.item_id} className={Math.abs(devNum)>10 ? 'bg-amber-50' : ''}>
                        <td className="border border-slate-100 px-3 py-1.5 font-semibold text-slate-800">{ing.name}</td>
                        <td className="border border-slate-100 px-3 py-1.5 text-right text-slate-600">{parseFloat(target)} {ing.unit}</td>
                        <td className="border border-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700">{lot?.supplier_batch_number || (usage.lotId ? '—' : 'Not selected')}</td>
                        <td className="border border-slate-100 px-3 py-1.5 text-right font-bold text-slate-900">{isNaN(actual) ? '—' : `${actual} ${ing.unit}`}</td>
                        <td className={`border border-slate-100 px-3 py-1.5 text-right font-black ${Math.abs(devNum)>10 ? 'text-amber-700' : 'text-slate-500'}`}>{dev === '—' ? '—' : `${devNum > 0 ? '+' : ''}${dev}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {formulationIngredients.some(ing => {
                const target = ((parseFloat(ing.quantity)||0)*scaleFactor);
                const actual = parseFloat((watchBomUsage?.[ing.item_id]||{}).usedQty);
                return !isNaN(actual) && target>0 && Math.abs((actual-target)/target*100)>10;
              }) && <p className="text-xs font-bold text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>One or more ingredients deviate &gt;10% from target — log deviation if not already done.</p>}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
