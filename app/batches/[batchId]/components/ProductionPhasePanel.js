'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { Beaker, ShieldCheck, Droplets, Activity, Plus, Loader, ArrowRight, CheckCircle2, FlaskConical, Link } from 'lucide-react';

const formatTime = (isoString) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function ProductionPhasePanel({ batch, employees, employeeProfile, supabase, onComplete }) {
  const toast = useToast();
  
  const [setupData, setSetupData] = useState(null);
  const [formulations, setFormulations] = useState([]);
  const [flasks, setFlasks] = useState([]);
  const [readings, setReadings] = useState([]);
  const [activeCurve, setActiveCurve] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [selectedFlaskId, setSelectedFlaskId] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  
  // Log Modal State
  const [logPh, setLogPh] = useState('');
  const [logOd, setLogOd] = useState('');
  const [logAnthroneOd, setLogAnthroneOd] = useState('');
  const [logIsBlank, setLogIsBlank] = useState(false);

  const form = useForm({
    defaultValues: {
      formulationId: '',
      numFlasks: 1,
      seedInoculum: 'seed_1'
    }
  });
  const { register, handleSubmit, reset } = form;

  const fetchData = useCallback(async () => {
    try {
      const { data: f } = await supabase.from('formulations').select('id, name, version').is('archived_at', null).order('name');
      setFormulations(f || []);
      
      const { data: curve, error: curveErr } = await supabase.from('standard_curves').select('*').eq('is_active', true).eq('test_type', 'anthrone').maybeSingle();
      if (!curveErr && curve) setActiveCurve(curve);

      const { data: prodSetup } = await supabase.from('batch_seed_trains').select('*').eq('batch_id', batch.id).eq('stage_type', 'production').maybeSingle();
      if (prodSetup) {
        setSetupData(prodSetup);
        reset({ formulationId: prodSetup.formulation_id || '', numFlasks: 1, seedInoculum: prodSetup.inoculum_source_details || 'seed_1' });
      }

      const { data: fl } = await supabase.from('batch_flasks').select('*').eq('batch_id', batch.id).order('flask_label');
      setFlasks(fl || []);
      
      if (fl && fl.length > 0) {
        const flaskIds = fl.map(x => x.id);
        const { data: r } = await supabase.from('batch_fermentation_readings')
          .select('*')
          .in('flask_id', flaskIds)
          .order('logged_at', { ascending: true });
        setReadings(r || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load production data');
    } finally {
      setLoading(false);
    }
  }, [batch.id, supabase, reset, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveSetup = async (formData) => {
    setSaving(true);
    try {
      const payload = {
        batch_id: batch.id,
        stage_type: 'production',
        formulation_id: formData.formulationId || null,
        status: 'active'
      };
      
      const { error } = setupData?.id 
        ? await supabase.from('batch_seed_trains').update(payload).eq('id', setupData.id)
        : await supabase.from('batch_seed_trains').insert(payload);
        
      if (error) throw error;
      toast.success('Production setup saved.');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSterilise = async () => {
    if (!setupData?.id) return toast.warn('Save setup first.');
    setSaving(true);
    try {
      await supabase.from('batch_seed_trains').update({ is_sterilised: true, sterilised_at: new Date().toISOString() }).eq('id', setupData.id);
      toast.success('Bulk media sterilised!');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInoculateExplosion = async (formData) => {
    if (!setupData?.is_sterilised) return toast.warn('Must sterilise bulk media first!');
    setSaving(true);
    try {
      const num = parseInt(formData.numFlasks) || 1;
      const flaskPayloads = Array.from({ length: num }).map((_, i) => ({
        batch_id: batch.id,
        flask_label: `F${i + 1}`,
        current_stage: 'fermentation',
        status: 'active'
      }));
      
      const { error: fErr } = await supabase.from('batch_flasks').insert(flaskPayloads);
      if (fErr) throw fErr;
      
      await supabase.from('batch_seed_trains').update({ 
        inoculated_at: new Date().toISOString(), 
        inoculum_source_type: 'previous_seed', 
        inoculum_source_details: formData.seedInoculum 
      }).eq('id', setupData.id);
      
      toast.success(`${num} Production Flasks generated & inoculated!`);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitReading = async () => {
    if (!logPh && !logOd && !logAnthroneOd) return;
    setSaving(true);
    try {
      let concentration = null;
      if (logAnthroneOd && activeCurve) {
        // Equation: y = mx + c  =>  x = (y - c) / m
        // Wait, standard curves are usually OD = slope * concentration + intercept
        // Concentration = (OD - intercept) / slope
        const od = parseFloat(logAnthroneOd);
        const m = parseFloat(activeCurve.slope);
        const c = parseFloat(activeCurve.y_intercept);
        if (m !== 0) concentration = (od - c) / m;
      }

      const { error } = await supabase.from('batch_fermentation_readings').insert({
        batch_id: batch.id,
        seed_train_id: setupData.id,
        flask_id: selectedFlaskId,
        ph: logPh ? parseFloat(logPh) : null,
        optical_density: logOd ? parseFloat(logOd) : null,
        anthrone_od: logAnthroneOd ? parseFloat(logAnthroneOd) : null,
        anthrone_concentration: concentration,
        standard_curve_id: activeCurve?.id || null,
        is_blank: logIsBlank,
        logged_at: new Date().toISOString(),
        logged_by: employeeProfile?.id
      });
      if (error) throw error;
      toast.success('Reading logged successfully!');
      setShowLogModal(false);
      setLogPh(''); setLogOd(''); setLogAnthroneOd(''); setLogIsBlank(false);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleHarvest = async (flaskId, currentLabel) => {
    if (!confirm(`Are you sure you want to harvest ${currentLabel} and send it to Downstream?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('advance_flask_stage', {
        p_flask_id: flaskId,
        p_batch_id: batch.id,
        p_to_stage: 'straining',
        p_employee_id: employeeProfile.id
      });
      if (error) throw error;
      toast.success(`${currentLabel} Harvested!`);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 animate-pulse">Loading production phase...</div>;

  const isSterilised = setupData?.is_sterilised;
  const isInoculated = !!setupData?.inoculated_at;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── SECTION A: BULK SETUP ── */}
      {!isInoculated && (
        <div className="card p-6 border-2 border-navy shadow-sm">
          <h2 className="text-lg font-black text-navy uppercase tracking-widest mb-6 flex items-center gap-2">
            <FlaskConical className="w-5 h-5"/> Production Explosion Setup
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Step 1: Media */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2"><Beaker className="w-4 h-4"/> 1. Bulk Media</h3>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Production Formulation</label>
                <select {...register('formulationId')} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Inherit from Batch --</option>
                  {formulations.map(f => <option key={f.id} value={f.id}>{f.name} v{f.version}</option>)}
                </select>
              </div>
              <button onClick={handleSubmit(handleSaveSetup)} disabled={saving} className="w-full py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200">
                Save Formulation
              </button>
            </div>

            {/* Step 2: Sterilise */}
            <div className="space-y-4 border-l pl-8 border-slate-100">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> 2. Sterilisation</h3>
              <div className="h-[68px] flex items-center">
                {isSterilised ? (
                  <p className="text-sm font-bold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> Sterilised at {formatTime(setupData.sterilised_at)}</p>
                ) : (
                  <button onClick={handleSterilise} disabled={saving || !setupData?.id} className="w-full py-3 bg-navy text-white text-sm font-black rounded-xl hover:bg-navy-hover">Mark Bulk Media Sterilised</button>
                )}
              </div>
            </div>

            {/* Step 3: Inoculate Explosion */}
            <div className="lg:col-span-2 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2 mb-4"><Droplets className="w-4 h-4"/> 3. Inoculation Explosion</h3>
              <div className="flex flex-col sm:flex-row items-end gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Inoculum Seed Source</label>
                  <select {...register('seedInoculum')} className="w-full px-3 py-3 border rounded-xl text-sm">
                    <option value="seed_1">Seed 1</option>
                    <option value="seed_2">Seed 2</option>
                    <option value="seed_3">Seed 3</option>
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Total Flasks (N)</label>
                  <input type="number" min="1" {...register('numFlasks')} className="w-full px-3 py-3 border rounded-xl text-sm font-black text-center" />
                </div>
                <button onClick={handleSubmit(handleInoculateExplosion)} disabled={saving || !isSterilised} className="py-3 px-8 bg-emerald-600 text-white text-sm font-black rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                  Inoculate {form.watch('numFlasks')} Flasks <ArrowRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION B: FLASK TRACKING DASHBOARD ── */}
      {isInoculated && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-navy uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-5 h-5"/> Production Flasks Dashboard
            </h2>
            <div className="text-xs font-bold text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
              {flasks.length} Flasks Active
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {flasks.map(f => {
              const flaskReadings = readings.filter(r => r.flask_id === f.id);
              const isHarvested = f.current_stage !== 'fermentation' && f.current_stage !== 'inoculation';
              
              return (
                <div key={f.id} className={`card border-2 p-5 ${isHarvested ? 'border-amber-200 bg-amber-50/30' : 'border-navy/10 hover:border-navy/30'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-800">{f.flask_label}</h3>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {isHarvested ? <span className="text-amber-600">Harvested to Downstream</span> : 'Incubating'}
                      </p>
                    </div>
                    {!isHarvested && (
                       <button onClick={() => handleHarvest(f.id, f.flask_label)} disabled={saving} className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-black rounded hover:bg-amber-200">
                         Harvest
                       </button>
                    )}
                  </div>

                  {/* Readings Mini-Table */}
                  <div className="bg-slate-50 rounded-lg p-2 min-h-[100px]">
                    {flaskReadings.length > 0 ? (
                      <div className="space-y-1">
                        {flaskReadings.map(r => (
                          <div key={r.id} className="flex justify-between text-xs py-1 border-b border-slate-200 last:border-0">
                            <span className="text-slate-500 w-12">{formatTime(r.logged_at)}</span>
                            <span className="font-bold w-12">{r.ph ? `pH ${r.ph}` : ''}</span>
                            <span className="font-bold w-16">{r.optical_density ? `OD ${r.optical_density}` : ''}</span>
                            <span className="font-bold text-navy text-right flex-1 truncate">
                              {r.anthrone_concentration ? `${r.anthrone_concentration.toFixed(2)} ug/ml` : ''}
                              {r.is_blank && <span className="text-amber-600"> (BLANK)</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">No samples logged</div>
                    )}
                  </div>
                  
                  {/* Flask Actions */}
                  {!isHarvested && (
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => { setSelectedFlaskId(f.id); setShowLogModal(true); }} className="flex-1 py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover flex items-center justify-center gap-1">
                        <Plus className="w-3 h-3"/> Sample
                      </button>
                      <button className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-black rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1">
                        <Link className="w-3 h-3"/> Link Plate
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-slate-900 mb-4">
              Log Sample for {flasks.find(f => f.id === selectedFlaskId)?.flask_label}
            </h3>
            
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">pH</label>
                  <input type="number" step="0.01" value={logPh} onChange={e=>setLogPh(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">OD 600nm</label>
                  <input type="number" step="0.01" value={logOd} onChange={e=>setLogOd(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Anthrone OD</label>
                  {activeCurve ? (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Auto-Calc Active</span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">No Std Curve Found</span>
                  )}
                </div>
                <input type="number" step="0.01" value={logAnthroneOd} onChange={e=>setLogAnthroneOd(e.target.value)} placeholder="Optional" className="w-full px-3 py-2 border rounded-lg" />
              </div>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer select-none pt-2">
                <input type="checkbox" checked={logIsBlank} onChange={e=>setLogIsBlank(e.target.checked)} className="w-4 h-4 text-navy rounded border-slate-300" />
                This is a BLANK flask reading
              </label>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => setShowLogModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={submitReading} disabled={saving || (!logPh && !logOd && !logAnthroneOd)} className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold disabled:opacity-50">Save Reading</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
