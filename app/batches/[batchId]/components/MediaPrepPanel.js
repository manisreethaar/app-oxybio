'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { Beaker, AlertTriangle, ClipboardList, X } from 'lucide-react';
import { syncStageToLNB } from '@/lib/lnbSync';

export default function MediaPrepPanel({ batch, employees, availableStock, employeeProfile, role, supabase, onDataSaved, onAdvanceStage, actionLoading }) {
  const toast = useToast();
  const [data,   setData]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingOverride, setPendingOverride] = useState(null);
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

  const [bomUsage, setBomUsage] = useState({});
  // G-17: BOM report modal
  const [showBomReport, setShowBomReport] = useState(false);

  const [ragiMoist,  setRagiMoist]  = useState('');
  const [kavuniTemp, setKavuniTemp] = useState('');
  const [kavuniMin,  setKavuniMin]  = useState('');
  const [waterVol,   setWaterVol]   = useState('');
  const [totalVol,   setTotalVol]   = useState('');
  const [initPH,     setInitPH]     = useState('');
  const [notes,      setNotes]      = useState('');
  const [supervisedBy, setSupervisedBy] = useState('');
  // G-51: particle size
  const [particleSize, setParticleSize] = useState('');
  // A-25: starch gelatinization
  const [starchGelTemp,  setStarchGelTemp]  = useState('');
  const [starchGelConfirm, setStarchGelConfirm] = useState(false);
  // A-58: buffer capacity
  const [bufferCapacity, setBufferCapacity] = useState('');
  // A-59: viscosity
  const [viscosityCp,   setViscosityCp]   = useState('');
  // G-85: substrate photo URL
  const [substratePhotoUrl, setSubstratePhotoUrl] = useState('');
  // G-53: water activity
  const [awValue, setAwValue] = useState('');
  // G-52: modular pre-treatment steps [{type, target_temp, duration_min, notes}]
  const [pretreatSteps, setPretreatSteps] = useState([]);

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

  const loadData = useCallback(async () => {
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
      setParticleSize(d.particle_size_mesh||'');
      setStarchGelTemp(d.starch_gelat_temp_c||'');
      setStarchGelConfirm(d.starch_gelat_confirmed||false);
      setBufferCapacity(d.buffer_capacity_mmol_l||'');
      setViscosityCp(d.viscosity_cp||'');
      setSubstratePhotoUrl(d.substrate_photo_url||'');
      setAwValue(d.aw_value||'');
      setPretreatSteps(d.pre_treatment_steps||[]);

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

  useEffect(() => { loadData(); }, [loadData]);

  const getUsageFor = (nameSubstring) => {
    const ing = formulationIngredients.find(i => i.name?.toLowerCase().includes(nameSubstring));
    if (!ing) return { lot: '', wt: null };
    const u = bomUsage[ing.item_id];
    return { lot: u?.lotId || null, wt: u?.usedQty ? parseFloat(u.usedQty) : null };
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  // Server-side deduction — called once when Media Prep is marked complete.
  // Replaces the old client-side deductLot() which used wrong column names
  // (movement_type / batch_reference don't exist in inventory_movements).
  const deductAllLots = async () => {
    const entries = formulationIngredients
      .map(ing => {
        const u = bomUsage[ing.item_id];
        if (u?.lotId && u?.usedQty && parseFloat(u.usedQty) > 0) {
          return { stock_id: u.lotId, quantity_used: parseFloat(u.usedQty), item_name: ing.name };
        }
        return null;
      })
      .filter(Boolean);

    if (!entries.length) return;

    const res = await window.fetch(`/api/batches/${batch.id}/media-deduct`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ entries, employee_id: employeeProfile?.id }),
    });
    const json = await res.json();
    (json.warnings || []).forEach(w => toast.warn(w));
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
        particle_size_mesh:  particleSize || null,
        starch_gelat_temp_c: starchGelTemp ? parseFloat(starchGelTemp) : null,
        starch_gelat_confirmed: starchGelConfirm,
        buffer_capacity_mmol_l: bufferCapacity ? parseFloat(bufferCapacity) : null,
        viscosity_cp: viscosityCp ? parseFloat(viscosityCp) : null,
        aw_value:            awValue ? parseFloat(awValue) : null,
        pre_treatment_steps: pretreatSteps,
        substrate_photo_url: substratePhotoUrl || null,
      }, { onConflict: 'batch_id' });
      if (error) throw error;

      if (advance) {
        await deductAllLots();
      }

      toast.success(advance ? 'Media Prep complete. BOM Inventory deducted.' : 'Draft saved.');
      // G-50: Notify supervisors if any ingredient >10% deviation
      const deviations = formulationIngredients.filter(ing => {
        const target = ((parseFloat(ing.quantity)||0) * scaleFactor);
        const actual = parseFloat((bomUsage[ing.item_id]||{}).usedQty);
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
        loadData();
        onDataSaved();
      }
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <Beaker className="w-5 h-5 text-slate-600"/>
        <div><h2 className="text-base font-bold text-slate-900">Media Preparation & BOM</h2>
          <p className="text-xs text-slate-500">Record all raw material BOM fulfillment and substrate setup.</p></div>
        <div className="ml-auto flex items-center gap-2">
          {/* G-17: BOM Report */}
          <button onClick={()=>setShowBomReport(true)} className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black rounded-lg uppercase flex items-center gap-1">
            <ClipboardList className="w-3 h-3"/>BOM Report
          </button>
          {data?.is_complete && <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black rounded-lg uppercase">Complete</span>}
        </div>
      </div>

      <div className="surface p-5 space-y-5">
        <div className="mb-4">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h3 className="text-xs font-black uppercase text-slate-800 mb-1">BOM Traceability</h3>
              <p className="text-[11px] font-medium text-slate-500">Recipe: <span className="text-slate-600 font-bold">{batch.formulations?.name}</span> | Base: {baseVol}ml | Target: {targetVol}ml</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black uppercase text-slate-400">Scale Factor</span>
              <p className="text-sm font-black text-slate-600">{scaleFactor.toFixed(2)}x</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {formulationIngredients.length === 0 && <p className="text-xs text-slate-400 italic">No ingredients found in recipe.</p>}
            {formulationIngredients.map(ing => {
               const scaledQty = ((parseFloat(ing.quantity) || 0) * scaleFactor).toFixed(2);
               // Filter stock: match by exact item_id, OR match by name for legacy compat
               const matchStock = availableStock.filter(s => s.item_id === ing.item_id || s.inventory_items?.id === ing.item_id || (s.inventory_items?.name?.toLowerCase() === ing.name?.toLowerCase()));
               const usage = bomUsage[ing.item_id] || {lotId:'', usedQty:''};
               const isRagi = ing.name?.toLowerCase().includes('ragi');
               const isKavuni = ing.name?.toLowerCase().includes('kavuni');

               return (
                 <div key={ing.item_id} className="p-4 border border-slate-100 bg-slate-50/20 rounded-xl">
                   <div className="flex justify-between items-center mb-3">
                     <span className="font-bold text-sm text-slate-900">{ing.name}</span>
                     <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-2 py-1 rounded">Target: {parseFloat(scaledQty)} {ing.unit}</span>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     <div>
                       <div className="flex items-center justify-between mb-1">
                         <label className="field-label mb-0">Inventory Lot Selection</label>
                         {/* G-18: Clear lot selection */}
                         {usage.lotId && (
                           <button type="button" onClick={() => setBomUsage(p=>({...p, [ing.item_id]: {lotId:'', usedQty:''}}))}
                             className="text-[9px] text-amber-600 font-black uppercase hover:underline flex items-center gap-0.5">
                             <X className="w-2.5 h-2.5"/>Clear Lot
                           </button>
                         )}
                       </div>
                       <select value={usage.lotId} onChange={e => setBomUsage(p=>({...p, [ing.item_id]: {...p[ing.item_id], lotId: e.target.value}}))} className="field-input">
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
                       <input type="number" step="0.01" value={usage.usedQty} onChange={e => setBomUsage(p=>({...p, [ing.item_id]: {...p[ing.item_id], usedQty: e.target.value}}))} className="field-input" placeholder={parseFloat(scaledQty)} />
                       {(() => {
                         const target = parseFloat(scaledQty);
                         const actual = parseFloat(usage.usedQty);
                         if (!usage.usedQty || isNaN(actual) || target === 0) return null;
                         const pct = Math.abs((actual - target) / target) * 100;
                         if (pct > 10) return (
                           <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-1">
                             <AlertTriangle className="w-3 h-3 shrink-0"/>
                             {actual > target ? '+' : ''}{(actual - target).toFixed(2)} {ing.unit} deviation ({pct.toFixed(1)}% from target)
                           </p>
                         );
                         if (pct > 0) return (
                           <p className="text-[10px] font-semibold text-slate-400 mt-1">
                             ±{pct.toFixed(1)}% from target — within tolerance
                           </p>
                         );
                         return null;
                       })()}
                     </div>
                   </div>
                   
                   {/* Specific Process Parameters tied to Ingredients */}
                   {isRagi && (
                     <div className="mt-4 pt-3 border-t border-slate-100/50">
                        <label className="field-label">Ragi Moisture Check</label>
                        <div className="flex gap-2">
                          {['Pass','Fail'].map(o=>(
                            <button key={o} type="button" onClick={()=>setRagiMoist(o)}
                              className={`flex-1 py-1 text-xs font-black rounded-lg border transition-all ${ragiMoist===o?(o==='Pass'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                              {o}
                            </button>
                          ))}
                          <button type="button" onClick={()=>setRagiMoist('')} className={`px-3 text-xs font-bold rounded-lg border transition-all ${!ragiMoist?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-400 border-slate-200'}`}>N/A</button>
                        </div>
                        {ragiMoist==='Fail' && <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Moisture check failed — log deviation before advancing.</p>}
                     </div>
                   )}
                   {isKavuni && isF2 && (
                     <div className="mt-4 pt-3 border-t border-slate-100/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className="field-label">Pre-cook Temp (°C)</label><input type="number" step="0.1" value={kavuniTemp} onChange={e=>setKavuniTemp(e.target.value)} className="field-input" placeholder="90.0"/></div>
                        <div><label className="field-label">Pre-cook Duration (min)</label><input type="number" value={kavuniMin} onChange={e=>setKavuniMin(e.target.value)} className="field-input" placeholder="30"/></div>
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
              <input value={particleSize} onChange={e=>setParticleSize(e.target.value)} className="field-input" placeholder="e.g. 60 mesh / 250 µm"/>
            </div>
            {/* G-53: Water Activity */}
            <div>
              <label className="field-label">Water Activity (aW) <span className="text-slate-400 text-[9px]">substrate</span></label>
              <input type="number" step="0.01" min="0" max="1" value={awValue} onChange={e=>setAwValue(e.target.value)} className="field-input" placeholder="0.95"/>
              {awValue && parseFloat(awValue) > 0.97 && <p className="text-[10px] text-amber-600 font-bold mt-0.5">⚠ aW &gt;0.97 — microbial risk elevated</p>}
            </div>
            {/* A-25: Starch Gelatinization */}
            <div>
              <label className="field-label">Starch Gelatinization Temp (°C) <span className="text-slate-400 text-[9px]">A-25</span></label>
              <input type="number" step="0.1" value={starchGelTemp} onChange={e=>setStarchGelTemp(e.target.value)} className="field-input" placeholder="65–70°C (grain substrates)"/>
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={starchGelConfirm} onChange={e=>setStarchGelConfirm(e.target.checked)} className="w-4 h-4 rounded border-slate-300"/>
                <span className="text-xs font-bold text-slate-700">Gelatinization confirmed (iodine test / viscosity change)</span>
              </label>
            </div>
            {/* A-58: Buffer Capacity */}
            <div>
              <label className="field-label">Buffer Capacity (mmol/L) <span className="text-slate-400 text-[9px]">A-58</span></label>
              <input type="number" step="0.1" value={bufferCapacity} onChange={e=>setBufferCapacity(e.target.value)} className="field-input" placeholder="e.g. 25"/>
              <p className="text-[9px] text-slate-400 mt-0.5">Resistance to pH change — affects fermentation rate variability</p>
            </div>
            {/* A-59: Viscosity */}
            <div>
              <label className="field-label">Substrate Viscosity (cP) <span className="text-slate-400 text-[9px]">A-59</span></label>
              <input type="number" step="0.1" value={viscosityCp} onChange={e=>setViscosityCp(e.target.value)} className="field-input" placeholder="e.g. 120"/>
              <p className="text-[9px] text-slate-400 mt-0.5">Affects mixing efficiency and mass transfer</p>
            </div>
          </div>
          {/* G-85: Substrate photo URL */}
          <div>
            <label className="field-label">Substrate Photo URL <span className="text-slate-400 text-[9px]">optional — colour/texture traceability</span></label>
            <input type="url" value={substratePhotoUrl} onChange={e=>setSubstratePhotoUrl(e.target.value)} className="field-input" placeholder="https://... (link to substrate photo)"/>
            {substratePhotoUrl && <a href={substratePhotoUrl} target="_blank" rel="noreferrer" className="text-[10px] text-navy underline font-bold mt-0.5 inline-block">View photo →</a>}
          </div>
        </div>

        {/* G-52: Modular pre-treatment steps */}
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="field-label mb-0">Pre-treatment Steps</label>
            <button type="button" onClick={()=>setPretreatSteps(p=>[...p,{type:'Heat',target_temp:'',duration_min:'',notes:''}])}
              className="px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 text-[9px] font-black rounded-lg uppercase hover:bg-slate-100">
              + Add Step
            </button>
          </div>
          {pretreatSteps.map((step, idx) => (
            <div key={idx} className="p-3 bg-slate-50/40 border border-slate-100 rounded-xl grid grid-cols-4 gap-2 items-center">
              <select value={step.type} onChange={e=>setPretreatSteps(p=>p.map((s,i)=>i===idx?{...s,type:e.target.value}:s))} className="field-input text-xs col-span-1 bg-white p-1.5">
                {['Heat','Steam','Chemical','Enzymatic','Mechanical','Other'].map(t=><option key={t}>{t}</option>)}
              </select>
              <input type="number" value={step.target_temp} onChange={e=>setPretreatSteps(p=>p.map((s,i)=>i===idx?{...s,target_temp:e.target.value}:s))} placeholder="Temp °C" className="field-input text-xs p-1.5"/>
              <input type="number" value={step.duration_min} onChange={e=>setPretreatSteps(p=>p.map((s,i)=>i===idx?{...s,duration_min:e.target.value}:s))} placeholder="Min" className="field-input text-xs p-1.5"/>
              <button type="button" onClick={()=>setPretreatSteps(p=>p.filter((_,i)=>i!==idx))} className="text-red-400 hover:text-red-600 text-xs font-black">✕</button>
            </div>
          ))}
          {pretreatSteps.length === 0 && <p className="text-[10px] text-slate-400 italic">No additional pre-treatment steps. Click + Add Step to log.</p>}
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <label className="field-label">Initial pH of Slurry <span className="text-slate-400">(pre-fermentation)</span></label>
            <input type="number" step="0.01" value={initPH} onChange={e=>setInitPH(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-2xl font-black font-mono text-center focus:border-navy outline-none" placeholder="6.00"/>
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
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Notes / observations..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button onClick={()=>handleSave(false)} disabled={saving} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={()=>handleSave(true)} disabled={saving||actionLoading||ragiMoist==='Fail'} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Complete → Sterilisation
          </button>
        </div>
      </div>

      {/* G-17: BOM Batch Traceability Report */}
      {showBomReport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
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
                    const usage = bomUsage[ing.item_id] || {};
                    const actual = parseFloat(usage.usedQty);
                    const dev = (!isNaN(actual) && parseFloat(target)>0) ? ((actual - parseFloat(target)) / parseFloat(target) * 100).toFixed(1) : '—';
                    const devNum = parseFloat(dev);
                    const lot = availableStock.find(s=>s.id===usage.lotId);
                    return (
                      <tr key={ing.item_id} className={Math.abs(devNum)>10 ? 'bg-amber-50' : ''}>
                        <td className="border border-slate-100 px-3 py-1.5 font-semibold text-slate-800">{ing.name}</td>
                        <td className="border border-slate-100 px-3 py-1.5 text-right text-slate-600">{parseFloat(target)} {ing.unit}</td>
                        <td className="border border-slate-100 px-3 py-1.5 font-mono text-[10px] text-slate-700">{lot?.supplier_batch_number || (usage.lotId ? '—' : 'Not selected')}</td>
                        <td className="border border-slate-100 px-3 py-1.5 text-right font-bold text-slate-900">{isNaN(actual) ? '—' : `${actual} ${ing.unit}`}</td>
                        <td className={`border border-slate-100 px-3 py-1.5 text-right font-black ${Math.abs(devNum)>10 ? 'text-amber-700' : 'text-slate-500'}`}>{dev === '—' ? '—' : `${devNum > 0 ? '+' : ''}${dev}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {formulationIngredients.some(ing => {
                const target = ((parseFloat(ing.quantity)||0)*scaleFactor);
                const actual = parseFloat((bomUsage[ing.item_id]||{}).usedQty);
                return !isNaN(actual) && target>0 && Math.abs((actual-target)/target*100)>10;
              }) && <p className="text-xs font-bold text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>One or more ingredients deviate &gt;10% from target — log deviation if not already done.</p>}
            </div>
          </div>
        </div>
      )}

      {pendingOverride !== null && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Safety Override</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">Ragi moisture check failed. Please ensure you log a Process Deviation before continuing. Proceed anyway?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingOverride(null)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
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
