'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Filter, CheckCircle2 } from 'lucide-react';
import { getStrainingWarnings } from '@/lib/batches/stageGates';

export default function SeparationPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const form = useForm({
    defaultValues: {
      freezing_start_time: '', freezing_end_time: '', freezer_equipment_id: '',
      thawing_start_time: '', thawing_end_time: '',
      filtration_equipment_id: '', pre_filtration_vol_ml: '', post_filtration_vol_ml: '', filtration_solid_wt_g: '',
      centrifuge_equipment_id: '', centrifuge_rpm: '', centrifuge_duration_min: '',
      centrifuge_pre_vol_ml: '', centrifuge_post_vol_ml: '', centrifuge_pellet_wt_g: '',
      total_pellet_wt_g: '', final_broth_vol_ml: '',
      broth_storage_equipment_id: '', pellet_storage_equipment_id: '',
      broth_storage_location: '', pellet_storage_location: '',
      dryer_equipment_id: '', drying_temp_c: '', drying_start_time: '', drying_end_time: '',
      wet_pellet_wt_g: '', dry_pellet_wt_g: '',
      notes: ''
    }
  });
  const { register, handleSubmit, reset, getValues, control } = form;

  const filterWeight = useWatch({ control, name: 'filtration_solid_wt_g' });
  const centrifugeWeight = useWatch({ control, name: 'centrifuge_pellet_wt_g' });

  const totalPelletWeight = useMemo(() => {
    const f = parseFloat(filterWeight) || 0;
    const c = parseFloat(centrifugeWeight) || 0;
    return (f + c).toFixed(2);
  }, [filterWeight, centrifugeWeight]);

  const fetchRecord = useCallback(async () => {
    if (!activeFlask?.id) return;
    let isCurrent = true;
    let data;
    try {
      ({ data } = await withTimeout(
        supabase.from('batch_flask_straining').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
        45000, 
        'Data load timed out'
      ));
    } catch (err) {
      console.error('Fetch error:', err);
      return;
    }
    if (!isCurrent) return;
    if (data) {
      setRecord(data);
      reset({
        freezing_start_time: data.freezing_start_time ? new Date(data.freezing_start_time).toISOString().slice(0, 16) : '',
        freezing_end_time: data.freezing_end_time ? new Date(data.freezing_end_time).toISOString().slice(0, 16) : '',
        freezer_equipment_id: data.freezer_equipment_id ?? '',
        thawing_start_time: data.thawing_start_time ? new Date(data.thawing_start_time).toISOString().slice(0, 16) : '',
        thawing_end_time: data.thawing_end_time ? new Date(data.thawing_end_time).toISOString().slice(0, 16) : '',
        filtration_equipment_id: data.filtration_equipment_id ?? '',
        pre_filtration_vol_ml: data.pre_filtration_vol_ml ?? '',
        post_filtration_vol_ml: data.post_filtration_vol_ml ?? '',
        filtration_solid_wt_g: data.filtration_solid_wt_g ?? '',
        centrifuge_equipment_id: data.centrifuge_equipment_id ?? '',
        centrifuge_rpm: data.centrifuge_rpm ?? '',
        centrifuge_duration_min: data.centrifuge_duration_min ?? '',
        centrifuge_pre_vol_ml: data.centrifuge_pre_vol_ml ?? '',
        centrifuge_post_vol_ml: data.centrifuge_post_vol_ml ?? '',
        centrifuge_pellet_wt_g: data.centrifuge_pellet_wt_g ?? '',
        total_pellet_wt_g: data.total_pellet_wt_g ?? '',
        final_broth_vol_ml: data.final_broth_vol_ml ?? '',
        broth_storage_equipment_id: data.broth_storage_equipment_id ?? '',
        pellet_storage_equipment_id: data.pellet_storage_equipment_id ?? '',
        broth_storage_location: data.broth_storage_location ?? '',
        pellet_storage_location: data.pellet_storage_location ?? '',
        dryer_equipment_id: data.dryer_equipment_id ?? '',
        drying_temp_c: data.drying_temp_c ?? '',
        drying_start_time: data.drying_start_time ? new Date(data.drying_start_time).toISOString().slice(0, 16) : '',
        drying_end_time: data.drying_end_time ? new Date(data.drying_end_time).toISOString().slice(0, 16) : '',
        wet_pellet_wt_g: data.wet_pellet_wt_g ?? '',
        dry_pellet_wt_g: data.dry_pellet_wt_g ?? '',
        notes: data.notes ?? ''
      });
    } else { setRecord(null); reset(); }
    return () => { isCurrent = false; };
  }, [activeFlask?.id, supabase, reset]);

  useEffect(() => { setRecord(null); fetchRecord(); }, [fetchRecord]);

  const handleSave = async (advance = false) => {
    const data = getValues();
    if (!activeFlask) return;
    if (setGlobalError) setGlobalError(null);

    setSaving(true);
    try {
      const payload = {
        flask_id: activeFlask.id, batch_id: batch.id,
        freezing_start_time: data.freezing_start_time ? new Date(data.freezing_start_time).toISOString() : null,
        freezing_end_time: data.freezing_end_time ? new Date(data.freezing_end_time).toISOString() : null,
        freezer_equipment_id: data.freezer_equipment_id || null,
        thawing_start_time: data.thawing_start_time ? new Date(data.thawing_start_time).toISOString() : null,
        thawing_end_time: data.thawing_end_time ? new Date(data.thawing_end_time).toISOString() : null,
        filtration_equipment_id: data.filtration_equipment_id || null,
        pre_filtration_vol_ml: data.pre_filtration_vol_ml ? parseFloat(data.pre_filtration_vol_ml) : null,
        post_filtration_vol_ml: data.post_filtration_vol_ml ? parseFloat(data.post_filtration_vol_ml) : null,
        filtration_solid_wt_g: data.filtration_solid_wt_g ? parseFloat(data.filtration_solid_wt_g) : null,
        centrifuge_equipment_id: data.centrifuge_equipment_id || null,
        centrifuge_rpm: data.centrifuge_rpm ? parseFloat(data.centrifuge_rpm) : null,
        centrifuge_duration_min: data.centrifuge_duration_min ? parseFloat(data.centrifuge_duration_min) : null,
        centrifuge_pre_vol_ml: data.centrifuge_pre_vol_ml ? parseFloat(data.centrifuge_pre_vol_ml) : null,
        centrifuge_post_vol_ml: data.centrifuge_post_vol_ml ? parseFloat(data.centrifuge_post_vol_ml) : null,
        centrifuge_pellet_wt_g: data.centrifuge_pellet_wt_g ? parseFloat(data.centrifuge_pellet_wt_g) : null,
        
        // Tier-1: Mathematically derived total
        total_pellet_wt_g: ((parseFloat(data.filtration_solid_wt_g) || 0) + (parseFloat(data.centrifuge_pellet_wt_g) || 0)) || null,
        
        final_broth_vol_ml: data.final_broth_vol_ml ? parseFloat(data.final_broth_vol_ml) : null,
        broth_storage_equipment_id: data.broth_storage_equipment_id || null,
        pellet_storage_equipment_id: data.pellet_storage_equipment_id || null,
        broth_storage_location: data.broth_storage_location || null,
        pellet_storage_location: data.pellet_storage_location || null,
        dryer_equipment_id: data.dryer_equipment_id || null,
        drying_temp_c: data.drying_temp_c ? parseFloat(data.drying_temp_c) : null,
        drying_start_time: data.drying_start_time ? new Date(data.drying_start_time).toISOString() : null,
        drying_end_time: data.drying_end_time ? new Date(data.drying_end_time).toISOString() : null,
        wet_pellet_wt_g: data.wet_pellet_wt_g ? parseFloat(data.wet_pellet_wt_g) : null,
        dry_pellet_wt_g: data.dry_pellet_wt_g ? parseFloat(data.dry_pellet_wt_g) : null,
        notes: data.notes || null,
        operator_id: employeeProfile?.id,
      };

      const res = await fetch('/api/downstream/separation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');

      toast.success(advance ? `Trial ${activeFlask.flask_label} Downstream complete.` : 'Draft saved.');
      if (advance && onAdvanceFlaskStage) {
        // Now it goes directly to qc_hold
        await onAdvanceFlaskStage('qc_hold', getStrainingWarnings(data));
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

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Downstream Processing.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 border-l-4 border-l-amber-500">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-5 h-5 text-amber-600"/>
          <h2 className="text-base font-bold text-slate-900">Downstream Processing: <span className="text-amber-600">{activeFlask.flask_label}</span></h2>
        </div>
        <p className="text-xs text-slate-500">Log freezing, straining, centrifuge, drying, and storage parameters.</p>
        {record && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600"/>
            <span className="text-xs font-bold text-emerald-800">Record saved.</span>
          </div>
        )}
      </div>


      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">1. Freezing & Thawing</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="field-label">Freezer Equipment</label>
            <select {...register('freezer_equipment_id')} disabled={isLocked} className="field-input bg-white disabled:bg-slate-50">
              <option value="">Select Freezer...</option>
            </select>
          </div>
          <div>
            <label className="field-label">Freezing Start</label>
            <input type="datetime-local" {...register('freezing_start_time')} disabled={isLocked} className="field-input disabled:bg-slate-50" />
          </div>
          <div>
            <label className="field-label">Freezing End</label>
            <input type="datetime-local" {...register('freezing_end_time')} disabled={isLocked} className="field-input disabled:bg-slate-50" />
          </div>
          <div>
            <label className="field-label">Thawing Start</label>
            <input type="datetime-local" {...register('thawing_start_time')} disabled={isLocked} className="field-input disabled:bg-slate-50" />
          </div>
          <div>
            <label className="field-label">Thawing End</label>
            <input type="datetime-local" {...register('thawing_end_time')} disabled={isLocked} className="field-input disabled:bg-slate-50" />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">2. Filtration</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label className="field-label">Filtration Equipment</label>
            <select {...register('filtration_equipment_id')} disabled={isLocked} className="field-input bg-white disabled:bg-slate-50">
              <option value="">Select Filter...</option>
            </select>
          </div>
          <div>
            <label className="field-label">Pre-Filtration Vol (mL)</label>
            <input type="number" step="any" {...register('pre_filtration_vol_ml')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 1000" />
          </div>
          <div>
            <label className="field-label">Post-Filtration Vol (mL)</label>
            <input type="number" step="any" {...register('post_filtration_vol_ml')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 850" />
          </div>
          <div>
            <label className="field-label">Solid Weight Obtained (g)</label>
            <input type="number" step="any" {...register('filtration_solid_wt_g')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 15.5" />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">3. Centrifugation</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label className="field-label">Centrifuge Equipment</label>
            <select {...register('centrifuge_equipment_id')} disabled={isLocked} className="field-input bg-white disabled:bg-slate-50">
              <option value="">Select Centrifuge...</option>
            </select>
          </div>
          <div>
            <label className="field-label">Speed (RPM)</label>
            <input type="number" step="any" {...register('centrifuge_rpm')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 4000" />
          </div>
          <div>
            <label className="field-label">Duration (min)</label>
            <input type="number" step="any" {...register('centrifuge_duration_min')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 30" />
          </div>
          <div>
            <label className="field-label">Pre-Centrifuge Vol (mL)</label>
            <input type="number" step="any" {...register('centrifuge_pre_vol_ml')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 850" />
          </div>
          <div>
            <label className="field-label">Post-Centrifuge Vol (mL)</label>
            <input type="number" step="any" {...register('centrifuge_post_vol_ml')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 800" />
          </div>
          <div>
            <label className="field-label">Pellet Weight (g)</label>
            <input type="number" step="any" {...register('centrifuge_pellet_wt_g')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 45.2" />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">4. Drying</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-4">
            <label className="field-label">Dryer/Oven Equipment</label>
            <select {...register('dryer_equipment_id')} disabled={isLocked} className="field-input bg-white disabled:bg-slate-50">
              <option value="">Select Dryer...</option>
            </select>
          </div>
          <div>
            <label className="field-label">Temperature (°C)</label>
            <input type="number" step="any" {...register('drying_temp_c')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 60" />
          </div>
          <div>
            <label className="field-label">Drying Start</label>
            <input type="datetime-local" {...register('drying_start_time')} disabled={isLocked} className="field-input disabled:bg-slate-50" />
          </div>
          <div>
            <label className="field-label">Drying End</label>
            <input type="datetime-local" {...register('drying_end_time')} disabled={isLocked} className="field-input disabled:bg-slate-50" />
          </div>
          <div></div>
          <div>
            <label className="field-label">Wet Pellet Wt (g)</label>
            <input type="number" step="any" {...register('wet_pellet_wt_g')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 50" />
          </div>
          <div>
            <label className="field-label">Dry Pellet Wt (g)</label>
            <input type="number" step="any" {...register('dry_pellet_wt_g')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 12" />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">5. Yield & Storage</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <label className="field-label">Total Pellet Wt (g)</label>
            <div className="text-2xl font-black text-navy mt-1">{totalPelletWeight} <span className="text-sm font-normal text-slate-400">g</span></div>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Derived (Filtration + Centrifuge)</p>
          </div>
          <div>
            <label className="field-label">Final Broth Vol (mL)</label>
            <input type="number" step="any" {...register('final_broth_vol_ml')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. 800" />
          </div>
          
          <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h5 className="text-xs font-bold text-slate-700">Broth Storage</h5>
            <div>
              <label className="field-label">Equipment</label>
              <select {...register('broth_storage_equipment_id')} disabled={isLocked} className="field-input bg-white disabled:bg-slate-50">
                <option value="">Select Equipment...</option>
              </select>
            </div>
            <div>
              <label className="field-label">Location Details</label>
              <input type="text" {...register('broth_storage_location')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. Rack A, Shelf 2" />
            </div>
          </div>

          <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h5 className="text-xs font-bold text-slate-700">Pellet Storage</h5>
            <div>
              <label className="field-label">Equipment</label>
              <select {...register('pellet_storage_equipment_id')} disabled={isLocked} className="field-input bg-white disabled:bg-slate-50">
                <option value="">Select Equipment...</option>
              </select>
            </div>
            <div>
              <label className="field-label">Location Details</label>
              <input type="text" {...register('pellet_storage_location')} disabled={isLocked} className="field-input disabled:bg-slate-50" placeholder="e.g. Rack B, Shelf 1" />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="field-label">Additional Notes</label>
          <textarea {...register('notes')} className="field-input" rows={2}/>
        </div>
      </div>

      <div className="flex justify-between items-center bg-slate-50 p-4 border border-slate-200 rounded-xl mt-6">
        <button type="button" onClick={() => handleSave(false)} disabled={saving || actionLoading} className="btn-secondary">
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button type="button" onClick={() => handleSave(true)} disabled={saving || actionLoading} className="btn-primary">
          Submit Downstream Processing
        </button>
      </div>
    </div>
  );
}
