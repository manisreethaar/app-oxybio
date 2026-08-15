'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { Beaker, ShieldCheck, Droplets, Activity, Plus, Loader, ArrowRight, CheckCircle2 } from 'lucide-react';

const formatDateTime = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};

const INOCULUM_TYPES = ['glycerol', 'curd', 'rice_water', 'natural', 'previous_seed'];

export default function SeedPhasePanel({ batch, stageType, employees, employeeProfile, supabase, onComplete }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [readings, setReadings] = useState([]);
  
  // Dropdown data
  const [formulations, setFormulations] = useState([]);
  const [vials, setVials] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Readings log state
  const [showLogModal, setShowLogModal] = useState(false);
  const [logPh, setLogPh] = useState('');
  const [logOd, setLogOd] = useState('');
  const [logIsBlank, setLogIsBlank] = useState(false);

  const form = useForm({
    defaultValues: {
      formulationId: '',
      mediaVolumeMl: '',
      mediaNotes: '',
      inoculumSourceType: 'glycerol',
      cellBankVialId: '',
      inoculumDetails: ''
    }
  });
  const { register, handleSubmit, reset, watch } = form;
  const watchedSourceType = watch('inoculumSourceType');

  const fetchData = useCallback(async () => {
    try {
      // Fetch Dropdowns
      const { data: f } = await supabase.from('formulations').select('id, name, version').is('archived_at', null).order('name');
      const { data: v } = await supabase.from('cell_bank_vials').select('id, vial_label').order('vial_label');
      setFormulations(f || []);
      setVials(v || []);

      // Fetch seed train record
      const { data: seed } = await supabase.from('batch_seed_trains')
        .select('*')
        .eq('batch_id', batch.id)
        .eq('stage_type', stageType)
        .maybeSingle();
      
      if (seed) {
        setData(seed);
        reset({
          formulationId: seed.formulation_id || '',
          mediaVolumeMl: seed.media_volume_ml || '',
          mediaNotes: seed.media_recipe_notes || '',
          inoculumSourceType: seed.inoculum_source_type || 'glycerol',
          cellBankVialId: seed.cell_bank_vial_id || '',
          inoculumDetails: seed.inoculum_source_details || ''
        });
        
        // Fetch readings
        const { data: r } = await supabase.from('batch_fermentation_readings')
          .select('*')
          .eq('seed_train_id', seed.id)
          .order('logged_at', { ascending: true });
        setReadings(r || []);
      }
    } catch (err) {
      toast.error('Failed to load phase data');
    } finally {
      setLoading(false);
    }
  }, [batch.id, stageType, supabase, reset, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSetup = async (formData) => {
    setSaving(true);
    try {
      const payload = {
        batch_id: batch.id,
        stage_type: stageType,
        formulation_id: formData.formulationId || null,
        media_volume_ml: formData.mediaVolumeMl ? parseFloat(formData.mediaVolumeMl) : null,
        media_recipe_notes: formData.mediaNotes || null,
        inoculum_source_type: formData.inoculumSourceType,
        cell_bank_vial_id: formData.inoculumSourceType === 'glycerol' && formData.cellBankVialId ? formData.cellBankVialId : null,
        inoculum_source_details: formData.inoculumDetails || null
      };
      
      const { error } = data?.id 
        ? await supabase.from('batch_seed_trains').update(payload).eq('id', data.id)
        : await supabase.from('batch_seed_trains').insert(payload);
        
      if (error) throw error;
      toast.success('Phase setup saved.');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action) => {
    if (!data?.id) return toast.warn('Save setup first.');
    setSaving(true);
    try {
      const updates = {};
      if (action === 'sterilise') {
        updates.is_sterilised = true;
        updates.sterilised_at = new Date().toISOString();
      } else if (action === 'inoculate') {
        updates.inoculated_at = new Date().toISOString();
      }
      
      const { error } = await supabase.from('batch_seed_trains').update(updates).eq('id', data.id);
      if (error) throw error;
      toast.success(`Marked as ${action}d!`);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitReading = async () => {
    if (!logPh && !logOd) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_fermentation_readings').insert({
        batch_id: batch.id,
        seed_train_id: data.id,
        ph: logPh ? parseFloat(logPh) : null,
        optical_density: logOd ? parseFloat(logOd) : null,
        is_blank: logIsBlank,
        logged_at: new Date().toISOString(),
        logged_by: employeeProfile?.id
      });
      if (error) throw error;
      toast.success('Reading logged.');
      setShowLogModal(false);
      setLogPh(''); setLogOd(''); setLogIsBlank(false);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  
  const handleTransfer = async (nextStage) => {
    if (!confirm(`Are you sure you want to transfer this to ${nextStage.replace('_', ' ').toUpperCase()}?`)) return;
    setSaving(true);
    try {
      await supabase.from('batch_seed_trains').insert({ batch_id: batch.id, stage_type: nextStage, status: 'active' });
      await supabase.from('batch_seed_trains').update({ status: 'completed' }).eq('id', data.id);
      await supabase.from('batches').update({ current_stage: nextStage }).eq('id', batch.id);
      
      toast.success(`Transferred to ${nextStage.replace('_', ' ').toUpperCase()}`);
      onComplete();
    } catch (err) {
      toast.error('Transfer failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 animate-pulse">Loading phase...</div>;

  const isSterilised = data?.is_sterilised;
  const isInoculated = !!data?.inoculated_at;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. Setup & Media */}
      <div className="card p-6 border-l-4 border-l-navy/40">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Beaker className="w-4 h-4 text-navy"/> Media Setup
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Formulation (Recipe)</label>
            <select {...register('formulationId')} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">-- Inherit from Batch / None --</option>
              {formulations.map(f => <option key={f.id} value={f.id}>{f.name} v{f.version}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Media Volume (ml)</label>
            <input type="number" {...register('mediaVolumeMl')} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Inoculum Source Type</label>
            <select {...register('inoculumSourceType')} className="w-full px-3 py-2 border rounded-lg text-sm">
              {INOCULUM_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
            </select>
          </div>
          
          {watchedSourceType === 'glycerol' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Select Cell Bank Vial</label>
              <select {...register('cellBankVialId')} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">-- Select Vial --</option>
                {vials.map(v => <option key={v.id} value={v.id}>{v.vial_label}</option>)}
              </select>
            </div>
          )}
          
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">Inoculum / Recipe Details (e.g. notes)</label>
            <input type="text" {...register('inoculumDetails')} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <button onClick={handleSubmit(handleSaveSetup)} disabled={saving} className="px-4 py-2 bg-navy/10 text-navy text-xs font-black rounded-lg hover:bg-navy/20">
          Save Setup
        </button>
      </div>

      {/* 2. Micro-Workflow Gates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Sterilisation Gate */}
        <div className={`card p-6 border ${isSterilised ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'} transition-all`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isSterilised ? 'text-emerald-600' : 'text-slate-400'}`}/> Sterilisation
            </h3>
            {isSterilised && <CheckCircle2 className="w-5 h-5 text-emerald-500"/>}
          </div>
          {isSterilised ? (
            <p className="text-xs font-bold text-emerald-700">Sterilised at {formatDateTime(data.sterilised_at)}</p>
          ) : (
            <button onClick={() => handleAction('sterilise')} disabled={saving || !data?.id} className="w-full py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover">Mark as Sterilised</button>
          )}
        </div>
        
        {/* Inoculation Gate */}
        <div className={`card p-6 border ${isInoculated ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'} transition-all`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Droplets className={`w-4 h-4 ${isInoculated ? 'text-emerald-600' : 'text-slate-400'}`}/> Inoculation
            </h3>
            {isInoculated && <CheckCircle2 className="w-5 h-5 text-emerald-500"/>}
          </div>
          {isInoculated ? (
            <p className="text-xs font-bold text-emerald-700">Inoculated at {formatDateTime(data.inoculated_at)}</p>
          ) : (
            <button onClick={() => handleAction('inoculate')} disabled={saving || !isSterilised} className="w-full py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover disabled:opacity-50">Mark as Inoculated</button>
          )}
        </div>
      </div>

      {/* 3. Incubation & Sampling */}
      {isInoculated && (
        <div className="card p-6 border-t-4 border-t-navy/40">
           <div className="flex justify-between items-end mb-4">
             <div>
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-1">
                 <Activity className="w-4 h-4 text-navy"/> Incubation & Sampling
               </h3>
               <p className="text-xs text-slate-500">Log pH and OD until target is reached.</p>
             </div>
             <button onClick={() => setShowLogModal(true)} className="px-4 py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover flex items-center gap-1">
               <Plus className="w-3 h-3"/> Log Sample
             </button>
           </div>
           
           {readings.length > 0 ? (
             <div className="overflow-x-auto border border-slate-200 rounded-xl">
               <table className="w-full text-left text-xs">
                 <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider">
                   <tr>
                     <th className="px-4 py-3">Time</th>
                     <th className="px-4 py-3">pH</th>
                     <th className="px-4 py-3">OD 600nm</th>
                     <th className="px-4 py-3">Type</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {readings.map(r => (
                     <tr key={r.id} className="hover:bg-slate-50/50">
                       <td className="px-4 py-3 text-slate-500 font-medium">{formatDateTime(r.logged_at)}</td>
                       <td className="px-4 py-3 font-bold">{r.ph || '-'}</td>
                       <td className="px-4 py-3 font-bold">{r.optical_density || '-'}</td>
                       <td className="px-4 py-3">
                         {r.is_blank ? <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">BLANK</span> : <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">SAMPLE</span>}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           ) : (
             <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">No samples logged yet.</div>
           )}
           
           {/* Transfer Actions */}
           <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap gap-3">
             {stageType === 'seed_1' && (
               <button onClick={() => handleTransfer('seed_2')} className="px-5 py-2.5 bg-white border-2 border-navy text-navy hover:bg-navy/5 text-xs font-black rounded-xl uppercase tracking-wider">
                 Transfer to Seed 2
               </button>
             )}
             {['seed_1', 'seed_2'].includes(stageType) && (
               <button onClick={() => handleTransfer('seed_3')} className="px-5 py-2.5 bg-white border-2 border-navy text-navy hover:bg-navy/5 text-xs font-black rounded-xl uppercase tracking-wider">
                 Transfer to Seed 3
               </button>
             )}
             {stageType !== 'production' && (
               <button onClick={() => handleTransfer('production')} className="px-5 py-2.5 bg-navy text-white hover:bg-navy-hover text-xs font-black rounded-xl uppercase tracking-wider flex items-center gap-2 ml-auto shadow-sm">
                 Transfer to Production <ArrowRight className="w-4 h-4"/>
               </button>
             )}
             {stageType === 'production' && (
               <button onClick={() => handleTransfer('straining')} className="px-5 py-2.5 bg-amber-600 text-white hover:bg-amber-700 text-xs font-black rounded-xl uppercase tracking-wider flex items-center gap-2 ml-auto shadow-sm">
                 Harvest (To Downstream) <ArrowRight className="w-4 h-4"/>
               </button>
             )}
           </div>
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-slate-900 mb-4">Log Sample</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">pH</label>
                <input type="number" step="0.01" value={logPh} onChange={e=>setLogPh(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">OD 600nm</label>
                <input type="number" step="0.01" value={logOd} onChange={e=>setLogOd(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={logIsBlank} onChange={e=>setLogIsBlank(e.target.checked)} className="w-4 h-4 text-navy rounded border-slate-300" />
                This is a BLANK flask reading
              </label>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => setShowLogModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={submitReading} disabled={saving || (!logPh && !logOd)} className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold disabled:opacity-50">Save Reading</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
