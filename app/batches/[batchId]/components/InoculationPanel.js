'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import SeedTrainManager from '@/components/SeedTrainManager';
import { Droplets, AlertTriangle, Dna, ChevronDown, FlaskConical } from 'lucide-react';
import { syncStageToLNB } from '@/lib/lnbSync';

const TRANSFER_METHODS = ['Pipette', 'Syringe', 'Sterile spoon'];
const SOURCE_TYPES = [
  { value: 'cell_bank', label: 'Cell Bank Vial' },
  { value: 'seed_passage', label: 'Seed Passage' },
  { value: 'back_slop', label: 'Back-Slop' },
  { value: 'other',     label: 'External / Other' },
];

export default function InoculationPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const isInternOrRI = ['intern','research_intern'].includes(role);

  const toLocalDatetime = (utcStr) => {
    if (!utcStr) return '';
    const d = new Date(utcStr);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
  };

  const { register, handleSubmit, setValue, getValues, watch, reset, control } = useForm({
    defaultValues: {
      sourceType: 'other',
      source: '',
      vialId: '',
      seedPassageId: '',
      inVol: '',
      plannedHr: '',
      tZero: '',
      transfer: 'Pipette',
      lafUsed: false,
      contCheck: 'Clear',
      contNotes: '',
      preInocuPh: '',
      inoculumViabilityPct: '',
      inoculumViabilityMethod: 'Not checked',
      postInocuPh15min: '',
      backSlopSourceBatch: '',
      backSlopFinalPh: '',
      backSlopFinalTa: '',
      samplingPlanHrs: '',
      flaskTempC: '',
      backSlopPct: '',
      coStarters: []
    }
  });

  const watchSourceType = watch('sourceType');
  const watchVialId = watch('vialId');
  const watchSeedPassageId = watch('seedPassageId');
  const watchContCheck = watch('contCheck');
  const watchPlannedHr = watch('plannedHr');
  const watchInVol = watch('inVol');
  const watchSamplingPlanHrs = watch('samplingPlanHrs');
  const watchPreInocuPh = watch('preInocuPh');
  const watchInoculumViabilityPct = watch('inoculumViabilityPct');
  const watchPostInocuPh15min = watch('postInocuPh15min');
  const watchTZero = watch('tZero');
  const watchFlaskTempC = watch('flaskTempC');
  const watchCoStarters = watch('coStarters');
  
  const { fields: coStarterFields, append: appendCoStarter, remove: removeCoStarter } = useFieldArray({
    control,
    name: 'coStarters'
  });

  const [availVials, setAvailVials] = useState([]);
  const [vialsLoading, setVialsLoading] = useState(false);
  const [availSeedPassages, setAvailSeedPassages] = useState([]);
  const [seedPassagesLoading, setSeedPassagesLoading] = useState(false);
  // G-04: CAPA linkage for contamination
  const [capaDevId, setCapaDevId] = useState(null);
  const [raisingCapa, setRaisingCapa] = useState(false);

  useEffect(() => {
    if (watchSourceType !== 'cell_bank') return;
    setVialsLoading(true);
    withTimeout(fetch('/api/research/cell-bank/vials?status=Available'), 45000, 'Available vials load timed out')
      .then(r => r.json())
      .then(j => { if (j.success) setAvailVials(j.data || []); })
      .catch(() => {})
      .finally(() => setVialsLoading(false));
  }, [watchSourceType]);

  useEffect(() => {
    if (watchSourceType !== 'seed_passage') return;
    setSeedPassagesLoading(true);
    withTimeout(fetch(`/api/seed-passages?batchId=${batch.batch_id}`), 45000, 'Seed passages load timed out')
      .then(r => r.json())
      .then(j => { if (j.success) setAvailSeedPassages(j.data || []); })
      .catch(() => {})
      .finally(() => setSeedPassagesLoading(false));
  }, [watchSourceType, batch.batch_id]);

  const fetchRecord = useCallback(() => {
    if (!activeFlask?.id) return;
    withTimeout(supabase.from('batch_flask_inoculations').select('*').eq('flask_id', activeFlask.id).maybeSingle(), 45000, 'Inoculation record load timed out')
      .then(({ data: d }) => {
        if (d) {
          reset({
            sourceType: d.inoculum_source_type || 'other',
            source: d.inoculum_source||'',
            vialId: d.cell_bank_vial_id||'',
            seedPassageId: d.seed_passage_id||'',
            inVol: d.inoculum_vol_ml||'',
            plannedHr: d.planned_fermentation_hrs||'',
            tZero: toLocalDatetime(d.t_zero_time),
            transfer: d.transfer_method||'Pipette',
            lafUsed: d.laf_used||false,
            contCheck: d.contamination_check||'Clear',
            contNotes: d.contamination_notes||'',
            preInocuPh: d.pre_inocu_ph||'',
            inoculumViabilityPct: d.inoculum_viability_pct||'',
            inoculumViabilityMethod: d.inoculum_viability_method||'Not checked',
            postInocuPh15min: d.post_inocu_ph_15min||'',
            backSlopSourceBatch: d.back_slop_source_batch_id||'',
            backSlopFinalPh: d.back_slop_final_ph||'',
            backSlopFinalTa: d.back_slop_final_ta_pct||'',
            samplingPlanHrs: (d.sampling_plan_hrs||[]).join(', '),
            flaskTempC: d.flask_temp_c||'',
            backSlopPct: d.back_slop_ratio_pct||'',
            coStarters: d.co_starters||[]
          });
          setCapaDevId(d.capa_deviation_id||null);
        } else {
          reset({
            sourceType: 'other', source: '', vialId: '', seedPassageId: '', inVol: '', plannedHr: '',
            transfer: 'Pipette', lafUsed: false, contCheck: 'Clear', contNotes: '',
            tZero: ''
          });
        }
      })
      .catch(err => console.error('InoculationPanel fetch error:', err));
  }, [activeFlask?.id, supabase]);

  useEffect(() => { fetchRecord(); }, [fetchRecord]);

  const selectedVial = availVials.find(v => v.id === watchVialId);
  const selectedSeedPassage = availSeedPassages.find(sp => sp.id === watchSeedPassageId);

  // G-04: auto-raise CAPA when contamination is suspected
  const autoRaiseContaminationCapa = async (contNotes) => {
    if (capaDevId) return capaDevId;
    setRaisingCapa(true);
    try {
      const res = await fetch('/api/capa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'raise',
          payload: {
            title: `Suspected Contamination at Inoculation — ${activeFlask.flask_label} (${batch.batch_id})`,
            severity: 'Major',
            source: 'Inoculation',
            description: `Contamination suspected during inoculation of trial ${activeFlask.flask_label} in batch ${batch.batch_id}. Notes: ${contNotes || 'No details provided'}. Investigate source and scope before proceeding.`,
          },
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        setCapaDevId(json.data.id);
        return json.data.id;
      }
    } catch {
      // non-blocking
    } finally {
      setRaisingCapa(false);
    }
    return null;
  };

  const onSubmit = async (formData, advance = false) => {
    if (!activeFlask) return;
    if (setGlobalError) setGlobalError(null);
    if (advance) {
      const missing = [];
      if (!formData.tZero) missing.push('T=0 inoculation time');
      if (!formData.plannedHr) missing.push('Planned fermentation time (hr)');
      
      if (missing.length > 0) {
        if (setGlobalError) setGlobalError(`Cannot advance to Fermentation. Missing mandatory details: ${missing.join(', ')}.`);
        toast.warn(`Cannot advance to Fermentation. Missing mandatory details: ${missing.join(', ')}.`);
        return;
      }
    }

    setSaving(true);
    try {
      let devId = capaDevId;
      // G-04: auto-raise CAPA when contamination is suspected
      if (formData.contCheck === 'Suspected' && !capaDevId) {
        devId = await autoRaiseContaminationCapa(formData.contNotes);
        if (devId) toast.warn('CAPA deviation raised for suspected contamination. Review in Compliance module.');
      }

      const { error } = await supabase.from('batch_flask_inoculations').upsert({
        flask_id: activeFlask.id, batch_id: batch.id,
        inoculum_source_type: formData.sourceType,
        inoculum_source: formData.sourceType === 'cell_bank' ? (selectedVial ? `${selectedVial.vial_code} — ${selectedVial.cell_bank_preparations?.cell_bank_strains?.name || ''}` : null) : formData.sourceType === 'seed_passage' ? (selectedSeedPassage ? `Seed Passage ${selectedSeedPassage.passage_number}` : null) : (formData.source || null),
        cell_bank_vial_id: formData.sourceType === 'cell_bank' && formData.vialId ? formData.vialId : null,
        seed_passage_id: formData.sourceType === 'seed_passage' && formData.seedPassageId ? formData.seedPassageId : null,
        inoculum_vol_ml: formData.inVol ? parseFloat(formData.inVol) : null,
        planned_fermentation_hrs: formData.plannedHr ? parseFloat(formData.plannedHr) : null,
        t_zero_time: formData.tZero ? new Date(formData.tZero).toISOString() : null,
        transfer_method: formData.transfer, laf_used: formData.lafUsed,
        contamination_check: formData.contCheck,
        contamination_notes: formData.contCheck === 'Suspected' ? formData.contNotes : null,
        capa_deviation_id: devId || null,
        pre_inocu_ph: formData.preInocuPh ? parseFloat(formData.preInocuPh) : null,
        flask_temp_c: formData.flaskTempC ? parseFloat(formData.flaskTempC) : null,
        back_slop_ratio_pct: formData.backSlopPct ? parseFloat(formData.backSlopPct) : null,
        co_starters: formData.coStarters,
        sampling_plan_hrs: formData.samplingPlanHrs.trim()
          ? formData.samplingPlanHrs.split(',').map(s=>s.trim()).filter(Boolean)
          : [],
        inoculum_viability_pct: formData.inoculumViabilityPct ? parseFloat(formData.inoculumViabilityPct) : null,
        inoculum_viability_method: formData.inoculumViabilityMethod !== 'Not checked' ? formData.inoculumViabilityMethod : null,
        post_inocu_ph_15min: formData.postInocuPh15min ? parseFloat(formData.postInocuPh15min) : null,
        back_slop_source_batch_id: formData.sourceType === 'back_slop' ? (formData.backSlopSourceBatch || null) : null,
        back_slop_final_ph: formData.sourceType === 'back_slop' && formData.backSlopFinalPh ? parseFloat(formData.backSlopFinalPh) : null,
        back_slop_final_ta_pct: formData.sourceType === 'back_slop' && formData.backSlopFinalTa ? parseFloat(formData.backSlopFinalTa) : null,
        operator_id: employeeProfile?.id,
      }, { onConflict: 'flask_id' });
      if (error) throw error;

      // Mark vial as used
      if (formData.sourceType === 'cell_bank' && formData.vialId) {
        fetch(`/api/research/cell-bank/vials/${formData.vialId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'use', batch_id: batch.id, flask_id: activeFlask.id }),
        }).catch(() => {});
      }

      toast.success(advance ? `Trial ${activeFlask.flask_label} Inoculated. T=0 anchored.` : 'Draft saved.');
      syncStageToLNB(supabase, batch.id, 'inoculation', {
        inoculum_source_type: formData.sourceType,
        inoculum_source: formData.sourceType === 'cell_bank' ? (selectedVial?.vial_code || null) : formData.sourceType === 'seed_passage' ? (selectedSeedPassage ? `Seed Passage ${selectedSeedPassage.passage_number}` : null) : (formData.source || null),
        cell_bank_vial_id: formData.vialId || null,
        seed_passage_id: formData.seedPassageId || null,
        strain_name: selectedVial?.cell_bank_preparations?.cell_bank_strains?.name || null,
        inoculum_vol_ml: formData.inVol ? parseFloat(formData.inVol) : null,
        planned_fermentation_hrs: formData.plannedHr ? parseFloat(formData.plannedHr) : null,
        t_zero_time: formData.tZero || null,
        transfer_method: formData.transfer,
        laf_used: formData.lafUsed,
        contamination_check: formData.contCheck,
      }, activeFlask.flask_label);
      if (advance && onAdvanceFlaskStage) {
        await onAdvanceFlaskStage('fermentation');
      } else {
        fetchRecord();
        onDataSaved();
      }
    } catch (err) { 
      if (setGlobalError) setGlobalError(err.message);
      toast.error(err.message); 
    }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Inoculation details.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-3 border-l-4 border-l-blue-500">
        <Droplets className="w-5 h-5 text-slate-600"/>
        <div><h2 className="text-base font-bold text-slate-900">Inoculation: <span className="text-slate-600">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-slate-500">Define the independent starter source and timeline for this specific trial.</p></div>
      </div>

      <div className="card p-5">
        <SeedTrainManager targetType="batch" targetId={batch.id} onSuccess={fetchRecord} />
      </div>

      <div className="card p-5 space-y-4">
        {/* Source Type */}
        <div>
          <label className="field-label">Inoculum Source Type</label>
          <div className="flex gap-2 flex-wrap">
            {SOURCE_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setValue('sourceType', t.value)}
                className={`flex-1 min-w-[100px] py-2 text-xs font-bold rounded-xl border transition-all ${watchSourceType === t.value ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cell Bank Vial picker */}
        {watchSourceType === 'cell_bank' && (
          <div className="space-y-2">
            <label className="field-label flex items-center gap-1"><Dna className="w-3.5 h-3.5 text-slate-600"/> Cell Bank Vial</label>
            {vialsLoading ? (
              <div className="field-input text-slate-400 text-xs">Loading available vials...</div>
            ) : availVials.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-semibold">
                No available cell bank vials found. Register vials in the Cell Bank module first.
              </div>
            ) : (
              <select {...register('vialId')} className="field-input bg-white">
                <option value="">Select vial...</option>
                {availVials.map(v => {
                  const strain = v.cell_bank_preparations?.cell_bank_strains;
                  const prep = v.cell_bank_preparations;
                  return (
                    <option key={v.id} value={v.id}>
                      {v.vial_code} — {strain?.name || 'Unknown strain'} ({prep?.type} {prep?.prep_code}{prep?.passage_number != null ? ` P${prep.passage_number}` : ''}) · {v.storage_temp}
                    </option>
                  );
                })}
              </select>
            )}
            {selectedVial && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <p className="font-black text-slate-800">{selectedVial.vial_code}</p>
                <p className="text-slate-700 font-semibold">{selectedVial.cell_bank_preparations?.cell_bank_strains?.name}</p>
                <p className="text-slate-600">{selectedVial.cell_bank_preparations?.type} · {selectedVial.cell_bank_preparations?.prep_code}{selectedVial.cell_bank_preparations?.passage_number != null ? ` · Passage P${selectedVial.cell_bank_preparations.passage_number}` : ''} · Stored at {selectedVial.storage_temp}</p>
                {selectedVial.freezer_id && <p className="text-slate-500">Freezer: {selectedVial.freezer_id} / Rack {selectedVial.rack} / Box {selectedVial.box}</p>}
              </div>
            )}
          </div>
        )}

        {/* Seed Passage picker */}
        {watchSourceType === 'seed_passage' && (
          <div className="space-y-2">
            <label className="field-label flex items-center gap-1"><FlaskConical className="w-3.5 h-3.5 text-slate-600"/> Seed Passage</label>
            {seedPassagesLoading ? (
              <div className="field-input text-slate-400 text-xs">Loading seed passages...</div>
            ) : availSeedPassages.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-semibold">
                No seed passages found for this batch.
              </div>
            ) : (
              <select {...register('seedPassageId')} className="field-input bg-white">
                <option value="">Select seed passage...</option>
                {availSeedPassages.map(sp => (
                  <option key={sp.id} value={sp.id}>
                    Seed Passage {sp.passage_number} {sp.media_name ? `(${sp.media_name})` : ''} - {sp.status}
                  </option>
                ))}
              </select>
            )}
            {selectedSeedPassage && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <p className="font-black text-slate-800">Seed Passage {selectedSeedPassage.passage_number}</p>
                <p className="text-slate-700 font-semibold">Started: {toLocalDatetime(selectedSeedPassage.start_time)}</p>
                <p className="text-slate-600">Media: {selectedSeedPassage.media_name || 'N/A'} · Vol: {selectedSeedPassage.media_volume_ml || 'N/A'} ml</p>
                {selectedSeedPassage.inventory && <p className="text-slate-500">From Vial: {selectedSeedPassage.inventory.label}</p>}
              </div>
            )}
          </div>
        )}

        {/* Free text for back-slop or other */}
        {watchSourceType !== 'cell_bank' && watchSourceType !== 'seed_passage' && (
          <div>
            <label className="field-label">Inoculum Source</label>
            <input {...register('source')} className="field-input"
              placeholder={watchSourceType === 'back_slop' ? 'e.g. Back-slop from Batch OXY-2026-001' : 'e.g. Isolate ISOL-001 / External culture'}/>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Inoculum Volume (ml)</label>
            <input type="number" step="0.1" {...register('inVol')} className="field-input" placeholder="12.5"/>
          </div>
          <div>
            <label className="field-label">Planned Fermentation Time (hr)</label>
            <input type="number" step="0.1" {...register('plannedHr', {
              onChange: (e) => {
                const hrs = parseFloat(e.target.value);
                if (hrs > 0 && !getValues('samplingPlanHrs')) {
                  const interval = hrs / 4;
                  const suggested = [1,2,3,4].map(i => Math.round(interval*i)).join(', ');
                  setValue('samplingPlanHrs', suggested);
                }
              }
            })} className="field-input" placeholder="e.g. 12"/>
            <p className="text-xs text-slate-400 mt-1">User-defined threshold for alerting</p>
          </div>
        </div>

        {/* G-55: Flask temperature at inoculation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Flask Temp at Inoculation (°C) <span className="text-slate-400 text-xs">must be &lt;40°C for LAB</span></label>
            <input type="number" step="0.5" {...register('flaskTempC')} className="field-input" placeholder="e.g. 35.0"/>
            {watchFlaskTempC && parseFloat(watchFlaskTempC) > 42 && <p className="text-xs text-red-600 font-bold mt-0.5">⚠ Temperature exceeds 42°C — LAB may not survive inoculation</p>}
          </div>
          {/* G-54: Inoculation rate auto-calc */}
          <div>
            <label className="field-label">Inoculation Rate (% v/v) <span className="text-slate-400 text-xs">auto-calculated</span></label>
            <div className="field-input bg-slate-50 font-black text-navy text-sm">
              {watchInVol && batch.planned_volume_ml
                ? `${((parseFloat(watchInVol) / (batch.planned_volume_ml)) * 100).toFixed(2)}%`
                : '—'}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">= vol_inocu / vol_flask × 100</p>
          </div>
        </div>

        {/* G-56: Back-slop ratio */}
        {watchSourceType === 'back_slop' && (
          <div>
            <label className="field-label">Back-Slop Ratio (% v/v of previous batch)</label>
            <input type="number" step="0.5" min="0" max="100" {...register('backSlopPct')} className="field-input" placeholder="e.g. 10"/>
            <p className="text-xs text-slate-400 mt-0.5">Typical back-slop ratio: 3–15% v/v</p>
          </div>
        )}

        {/* G-57: Multi-starter / co-culture */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="field-label mb-0">Co-Culture / Additional Starters</label>
            <button type="button" onClick={()=>appendCoStarter({source_type:'other',source:'',vol_ml:''})}
              className="px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 text-xs font-black rounded-lg uppercase hover:bg-slate-100">
              + Add Organism
            </button>
          </div>
          {coStarterFields.map((cs, idx) => (
            <div key={cs.id} className="p-3 bg-slate-50/30 border border-slate-100 rounded-xl grid grid-cols-3 gap-2">
              <input {...register(`coStarters.${idx}.source`)} placeholder="e.g. Saccharomyces cerevisiae" className="field-input text-xs col-span-2 p-1.5"/>
              <input type="number" {...register(`coStarters.${idx}.vol_ml`)} placeholder="ml" className="field-input text-xs p-1.5"/>
              <button type="button" onClick={()=>removeCoStarter(idx)} className="col-span-3 text-right text-xs text-red-400 hover:text-red-600 font-black">✕ Remove</button>
            </div>
          ))}
          {coStarterFields.length === 0 && <p className="text-xs text-slate-400 italic">No co-cultures. Single-starter inoculation.</p>}
        </div>

        {/* G-34: Sampling plan */}
        <div className="p-3 bg-navy/5 border border-navy/15 rounded-xl">
          <label className="block text-xs font-black uppercase tracking-wider text-navy/80 mb-1.5">
            Fermentation Sampling Schedule <span className="text-slate-400 font-normal normal-case text-xs">(comma-separated hours)</span>
          </label>
          <input {...register('samplingPlanHrs')}
            className="w-full px-3 py-2 border border-navy/20 rounded-xl text-xs font-semibold outline-none bg-white focus:border-navy"
            placeholder="e.g. 6, 12, 18, 24"/>
          {watchSamplingPlanHrs && (
            <div className="flex flex-wrap gap-1 mt-2">
              {watchSamplingPlanHrs.split(',').map(h=>h.trim()).filter(Boolean).map(hr => (
                <span key={hr} className="px-2 py-0.5 bg-navy/10 text-navy text-xs font-black rounded border border-navy/15">T+{hr}h</span>
              ))}
            </div>
          )}
        </div>

        {/* G-19: Pre-inoculation pH check */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
          <label className="block text-xs font-black uppercase tracking-wider text-amber-900">
            Pre-Inoculation Substrate pH <span className="text-amber-500">(check before adding starter)</span>
          </label>
          <input type="number" step="0.01" {...register('preInocuPh')}
            className="w-full px-4 py-2 border-2 border-amber-200 rounded-xl text-lg font-black font-mono text-center text-amber-900 bg-white outline-none focus:border-amber-400"
            placeholder="e.g. 6.50"/>
          {watchPreInocuPh && (parseFloat(watchPreInocuPh) < 5.5 || parseFloat(watchPreInocuPh) > 7.0) && (
            <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Substrate pH is outside typical pre-inoculation range (5.5–7.0). Verify before proceeding.</p>
          )}
          {watchPreInocuPh && parseFloat(watchPreInocuPh) >= 5.5 && parseFloat(watchPreInocuPh) <= 7.0 && (
            <p className="text-xs text-emerald-700 font-bold">✓ pH in acceptable pre-inoculation range</p>
          )}
        </div>

        {/* A-26: Inoculum viability at point of use */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-slate-900">Inoculum Viability at Point of Use <span className="text-slate-500 font-semibold text-xs">(A-26)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label text-slate-800">Viability (%)</label>
              <input type="number" step="0.1" min="0" max="100" {...register('inoculumViabilityPct')} className="field-input" placeholder="e.g. 92"/>
            </div>
            <div>
              <label className="field-label text-slate-800">Method</label>
              <select {...register('inoculumViabilityMethod')} className="field-input bg-white text-xs">
                {['Not checked','Methylene Blue','Live/Dead stain','Plate count','OD reading'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {watchInoculumViabilityPct && parseFloat(watchInoculumViabilityPct) < 80 && (
            <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>Low inoculum viability — extended lag phase expected</p>
          )}
        </div>

        {/* A-49: Back-slop prep log */}
        {watchSourceType === 'back_slop' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <p className="text-xs font-black text-amber-900">Back-Slop Preparation Record <span className="text-amber-500 font-semibold text-xs">(A-49)</span></p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="field-label">Source Batch ID</label><input {...register('backSlopSourceBatch')} className="field-input text-xs" placeholder="e.g. OXY-2026-001"/></div>
              <div><label className="field-label">Source Final pH</label><input type="number" step="0.01" {...register('backSlopFinalPh')} className="field-input text-xs" placeholder="4.2"/></div>
              <div><label className="field-label">Source Final TA%</label><input type="number" step="0.01" {...register('backSlopFinalTa')} className="field-input text-xs" placeholder="0.85"/></div>
            </div>
          </div>
        )}

        {/* A-27: Post-inoculation pH at 15 min */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <label className="block text-xs font-black text-emerald-900 mb-1">Post-Inoculation pH at 15 min <span className="text-emerald-500 font-semibold text-xs">(A-27)</span></label>
          <input type="number" step="0.01" {...register('postInocuPh15min')} className="field-input" placeholder="Measure pH 15 min after adding starter to confirm activity"/>
          {watchPostInocuPh15min && watchPreInocuPh && (
            <p className="text-xs text-emerald-700 font-semibold mt-1">
              ΔpH = {(parseFloat(watchPostInocuPh15min) - parseFloat(watchPreInocuPh)).toFixed(2)} {parseFloat(watchPostInocuPh15min) < parseFloat(watchPreInocuPh) ? '✓ Starter is active' : '⚠ No acidification — check starter viability'}
            </p>
          )}
        </div>

        {/* T=0 */}
        <div className="p-4 border-2 border-navy/30 rounded-2xl bg-navy/5">
          <label className="block text-xs font-black uppercase tracking-wider text-navy mb-2">
            ⏱ T=0 — Inoculation Time for {activeFlask.flask_label}
          </label>
          <input type="datetime-local" {...register('tZero')}
            className="w-full px-4 py-3 border-2 border-navy/30 rounded-xl text-sm font-black font-mono text-navy bg-white outline-none focus:border-navy"/>
          {watchTZero && new Date(watchTZero) < new Date(batch.created_at || batch.start_time) ? (
            <p className="text-xs text-amber-600 font-bold mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3"/>Retrospective entry — T=0 is before this batch was created in OxyOS. This is valid for historical data.
            </p>
          ) : (
            <p className="text-xs text-navy/60 font-semibold mt-1.5">This sets the clock specifically for this trial.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="field-label">Transfer Method</label>
            <select {...register('transfer')} className="field-input bg-white">
              {TRANSFER_METHODS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col justify-end pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('lafUsed')} className="w-4 h-4 rounded border-slate-300"/>
              <span className="text-xs font-bold text-slate-700">LAF Cabinet Used</span>
            </label>
          </div>
        </div>

        {/* Contamination Check */}
        <div>
          <label className="field-label">Contamination Check</label>
          <div className="flex gap-2 mb-2">
            {['Clear','Suspected'].map(o=>(
              <button key={o} type="button" onClick={()=>setValue('contCheck', o)}
                className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${watchContCheck===o?(o==='Clear'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                {o}
              </button>
            ))}
          </div>
          {watchContCheck === 'Suspected' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <textarea {...register('contNotes')} rows={2} placeholder="Describe suspected contamination (visual signs, odour, timing)..." className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs font-semibold outline-none resize-none bg-white"/>
              {capaDevId
                ? <p className="text-xs text-red-700 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>CAPA raised. <a href="/compliance" className="underline">Review in Compliance →</a></p>
                : <p className="text-xs text-red-600 font-bold">Saving will auto-raise a CAPA deviation for this contamination event.</p>
              }
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={handleSubmit((data) => onSubmit(data, false))} disabled={saving} className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
            {saving?'Saving...':'Save Draft'}
          </button>
          <button onClick={handleSubmit((data) => onSubmit(data, true))} disabled={saving||actionLoading||!watchTZero} className="py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-40">
            Set T=0 → Fermentation
          </button>
        </div>
      </div>
    </div>
  );
}
