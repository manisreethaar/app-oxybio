'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { Filter, CheckCircle2 } from 'lucide-react';

export default function SeparationPanel({ batch, activeFlask, employees, employeeProfile, role, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const form = useForm({
    defaultValues: {
      freezing_time_hrs: '', thawing_time_hrs: '',
      pre_straining_vol_ml: '', post_straining_vol_ml: '',
      broth_wt_before_g: '', straining_wt_after_g: '',
      straining_pellet_wet_wt_g: '', straining_sup_collected_ml: '',
      centrifuge_duration_min: '', centrifuge_spins_count: '',
      centrifuge_broth_obtained_ml: '', centrifuge_pellet_wet_wt_g: '',
      total_weight_obtained_g: '',
      drying_temp_c: '', drying_duration_hrs: '', dry_pellet_wt_g: '',
      storage_broth_details: '', storage_pellet_details: '',
      notes: ''
    }
  });
  const { register, handleSubmit, reset, getValues } = form;

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
        freezing_time_hrs: data.freezing_time_hrs ?? '',
        thawing_time_hrs: data.thawing_time_hrs ?? '',
        pre_straining_vol_ml: data.pre_straining_vol_ml ?? '',
        post_straining_vol_ml: data.post_straining_vol_ml ?? '',
        broth_wt_before_g: data.broth_wt_before_g ?? '',
        straining_wt_after_g: data.straining_wt_after_g ?? '',
        straining_pellet_wet_wt_g: data.straining_pellet_wet_wt_g ?? '',
        straining_sup_collected_ml: data.straining_sup_collected_ml ?? '',
        centrifuge_duration_min: data.centrifuge_duration_min ?? '',
        centrifuge_spins_count: data.centrifuge_spins_count ?? '',
        centrifuge_broth_obtained_ml: data.centrifuge_broth_obtained_ml ?? '',
        centrifuge_pellet_wet_wt_g: data.centrifuge_pellet_wet_wt_g ?? '',
        total_weight_obtained_g: data.total_weight_obtained_g ?? '',
        drying_temp_c: data.drying_temp_c ?? '',
        drying_duration_hrs: data.drying_duration_hrs ?? '',
        dry_pellet_wt_g: data.dry_pellet_wt_g ?? '',
        storage_broth_details: data.storage_broth_details ?? '',
        storage_pellet_details: data.storage_pellet_details ?? '',
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
        freezing_time_hrs: data.freezing_time_hrs ? parseFloat(data.freezing_time_hrs) : null,
        thawing_time_hrs: data.thawing_time_hrs ? parseFloat(data.thawing_time_hrs) : null,
        pre_straining_vol_ml: data.pre_straining_vol_ml ? parseFloat(data.pre_straining_vol_ml) : null,
        post_straining_vol_ml: data.post_straining_vol_ml ? parseFloat(data.post_straining_vol_ml) : null,
        broth_wt_before_g: data.broth_wt_before_g ? parseFloat(data.broth_wt_before_g) : null,
        straining_wt_after_g: data.straining_wt_after_g ? parseFloat(data.straining_wt_after_g) : null,
        straining_pellet_wet_wt_g: data.straining_pellet_wet_wt_g ? parseFloat(data.straining_pellet_wet_wt_g) : null,
        straining_sup_collected_ml: data.straining_sup_collected_ml ? parseFloat(data.straining_sup_collected_ml) : null,
        centrifuge_duration_min: data.centrifuge_duration_min ? parseFloat(data.centrifuge_duration_min) : null,
        centrifuge_spins_count: data.centrifuge_spins_count ? parseInt(data.centrifuge_spins_count) : null,
        centrifuge_broth_obtained_ml: data.centrifuge_broth_obtained_ml ? parseFloat(data.centrifuge_broth_obtained_ml) : null,
        centrifuge_pellet_wet_wt_g: data.centrifuge_pellet_wet_wt_g ? parseFloat(data.centrifuge_pellet_wet_wt_g) : null,
        total_weight_obtained_g: data.total_weight_obtained_g ? parseFloat(data.total_weight_obtained_g) : null,
        drying_temp_c: data.drying_temp_c ? parseFloat(data.drying_temp_c) : null,
        drying_duration_hrs: data.drying_duration_hrs ? parseFloat(data.drying_duration_hrs) : null,
        dry_pellet_wt_g: data.dry_pellet_wt_g ? parseFloat(data.dry_pellet_wt_g) : null,
        storage_broth_details: data.storage_broth_details || null,
        storage_pellet_details: data.storage_pellet_details || null,
        notes: data.notes || null,
        operator_id: employeeProfile?.id,
      };

      const { error } = await withTimeout(
        supabase.from('batch_flask_straining').upsert(payload, { onConflict: 'flask_id' }),
        15000,
        'Database save timed out. Please try again.'
      );
      if (error) throw error;

      toast.success(advance ? `Trial ${activeFlask.flask_label} Downstream complete.` : 'Draft saved.');
      if (advance && onAdvanceFlaskStage) {
        // Now it goes directly to qc_hold
        await onAdvanceFlaskStage('qc_hold');
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
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Freezing & Thawing</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="field-label">Freezing Time (hrs)</label><input type="number" step="0.1" {...register('freezing_time_hrs')} className="field-input" placeholder="e.g. 24"/></div>
          <div><label className="field-label">Thawing Time (hrs)</label><input type="number" step="0.1" {...register('thawing_time_hrs')} className="field-input" placeholder="e.g. 12"/></div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Straining Details</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><label className="field-label">Volume Before (ml)</label><input type="number" step="0.1" {...register('pre_straining_vol_ml')} className="field-input"/></div>
          <div><label className="field-label">Volume After (ml)</label><input type="number" step="0.1" {...register('post_straining_vol_ml')} className="field-input"/></div>
          <div><label className="field-label">Weight Before (g)</label><input type="number" step="0.1" {...register('broth_wt_before_g')} className="field-input"/></div>
          <div><label className="field-label">Weight After (g)</label><input type="number" step="0.1" {...register('straining_wt_after_g')} className="field-input"/></div>
          <div><label className="field-label">Pellet Wet Weight (g)</label><input type="number" step="0.1" {...register('straining_pellet_wet_wt_g')} className="field-input"/></div>
          <div><label className="field-label">Supernatant Collected (ml)</label><input type="number" step="0.1" {...register('straining_sup_collected_ml')} className="field-input"/></div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Centrifuge Details</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><label className="field-label">Duration (min)</label><input type="number" step="0.1" {...register('centrifuge_duration_min')} className="field-input"/></div>
          <div><label className="field-label">No. of Spins</label><input type="number" {...register('centrifuge_spins_count')} className="field-input"/></div>
          <div><label className="field-label">Broth Obtained (ml)</label><input type="number" step="0.1" {...register('centrifuge_broth_obtained_ml')} className="field-input"/></div>
          <div><label className="field-label">Wet Pellet Wt (g)</label><input type="number" step="0.1" {...register('centrifuge_pellet_wet_wt_g')} className="field-input"/></div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Drying & Total Yield</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><label className="field-label">Total Wt (Straining + Centrifuge) (g)</label><input type="number" step="0.1" {...register('total_weight_obtained_g')} className="field-input"/></div>
          <div><label className="field-label">Drying Temp (°C)</label><input type="number" step="0.1" {...register('drying_temp_c')} className="field-input"/></div>
          <div><label className="field-label">Drying Duration (hrs)</label><input type="number" step="0.1" {...register('drying_duration_hrs')} className="field-input"/></div>
          <div><label className="field-label">Dry Pellet Wt (g)</label><input type="number" step="0.1" {...register('dry_pellet_wt_g')} className="field-input"/></div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Storage & Notes</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="field-label">Storage Details (Broth)</label><textarea {...register('storage_broth_details')} className="field-input" rows={2}/></div>
          <div><label className="field-label">Storage Details (Pellet)</label><textarea {...register('storage_pellet_details')} className="field-input" rows={2}/></div>
        </div>
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
