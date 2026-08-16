'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import {
  Beaker, ShieldCheck, Droplets, Activity, Plus, ArrowRight,
  CheckCircle2, FlaskConical, Link
} from 'lucide-react';
import dayjs from 'dayjs';

export default function ProductionPhasePanel({
  batch,
  seedTrains,
  fermentationReadings,
  flasks,
  formulations,
  employees,
  employeeProfile,
  standardCurve,
  onTransfer,
  onDataChange,
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const setupData = useMemo(() => seedTrains.find(s => s.stage_type === 'production') || null, [seedTrains]);
  const stageFlasks = useMemo(() => flasks.filter(f => f.seed_train_id === setupData?.id), [flasks, setupData]);

  // Local state
  const [formulationId, setFormulationId] = useState(setupData?.formulation_id || '');
  const [mediaVolumeMl, setMediaVolumeMl] = useState(setupData?.media_volume_ml || '');
  const [numFlasks, setNumFlasks] = useState(1);
  const [seedInoculum, setSeedInoculum] = useState(setupData?.inoculum_source_details || 'seed_1');

  // Sterilization fields
  const [sterilizerId, setSterilizerId] = useState(setupData?.sterilizer_equipment_id || '');
  const [sterilizerTemp, setSterilizerTemp] = useState(setupData?.sterilization_temp_c || 121);
  const [sterilizerDuration, setSterilizerDuration] = useState(setupData?.sterilization_duration_mins || 20);

  // Incubation fields
  const [incubatorId, setIncubatorId] = useState('');
  const [incubationTemp, setIncubationTemp] = useState(37);
  const [incubationRpm, setIncubationRpm] = useState(200);

  const [saving, setSaving] = useState(false);
  const [selectedFlaskId, setSelectedFlaskId] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);

  // Derived
  const isSterilised = setupData?.is_sterilised ?? false;
  const isInoculated = stageFlasks.length > 0;

  // Log modal state
  const [logPh, setLogPh] = useState('');
  const [logOd, setLogOd] = useState('');
  const [logAnthroneOd, setLogAnthroneOd] = useState('');
  const [logIsBlank, setLogIsBlank] = useState(false);
  const [logGramStaining, setLogGramStaining] = useState('');
  const [logMicroscopic, setLogMicroscopic] = useState('');
  const [logDilution, setLogDilution] = useState('');

  const handleSaveSetup = async () => {
    setSaving(true);
    try {
      const payload = {
        batch_id: batch.id,
        stage_type: 'production',
        formulation_id: formulationId || null,
        media_volume_ml: mediaVolumeMl ? parseFloat(mediaVolumeMl) : null,
        status: 'active',
      };
      const { error } = setupData?.id
        ? await supabase.from('batch_seed_trains').update(payload).eq('id', setupData.id)
        : await supabase.from('batch_seed_trains').insert(payload);
      if (error) throw error;
      toast.success('Production setup saved.');
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSterilise = async () => {
    if (!setupData?.id) return toast.warn('Save setup first.');
    if (!sterilizerId || !sterilizerTemp || !sterilizerDuration) {
      return toast.warn('Enter all sterilization equipment parameters.');
    }

    setSaving(true);
    try {
      const updates = {
        is_sterilised: true,
        sterilised_at: new Date().toISOString(),
        sterilizer_equipment_id: sterilizerId,
        sterilization_temp_c: parseFloat(sterilizerTemp),
        sterilization_duration_mins: parseInt(sterilizerDuration)
      };

      const { error } = await supabase.from('batch_seed_trains').update(updates).eq('id', setupData.id);
      if (error) throw error;

      // Auto-debit
      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_auto_debit_media_inventory', {
        p_seed_train_id: setupData.id,
        p_employee_id: employeeProfile.id
      });
      
      if (rpcErr) throw rpcErr;
      if (rpcData?.success) {
        toast.success('Media Sterilised & Inventory Auto-Debited!');
      } else {
        toast.error('Sterilised, but inventory deduction failed: ' + (rpcData?.error || 'Unknown error'));
      }

      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInoculateExplosion = async () => {
    if (!isSterilised) return toast.warn('Must sterilise bulk media first!');
    if (!incubatorId) return toast.warn('Enter Incubator Equipment ID.');

    setSaving(true);
    try {
      const flaskPayloads = Array.from({ length: numFlasks }).map((_, i) => ({
        batch_id: batch.id,
        seed_train_id: setupData.id,
        flask_label: `Prod-F${i + 1}`,
        current_stage: 'fermentation',
        status: 'active',
        incubator_equipment_id: incubatorId,
        incubation_temp_c: parseFloat(incubationTemp),
        incubation_agitation_rpm: parseInt(incubationRpm),
        inoculated_at: new Date().toISOString()
      }));
      const { error: fErr } = await supabase.from('batch_flasks').insert(flaskPayloads);
      if (fErr) throw fErr;

      await supabase.from('batch_seed_trains').update({
        inoculated_at: new Date().toISOString(),
        inoculum_source_type: 'previous_seed',
        inoculum_source_details: seedInoculum,
      }).eq('id', setupData.id);

      toast.success(`${numFlasks} Production Flask(s) generated & inoculated!`);
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitReading = async () => {
    if (!logPh && !logOd && !logAnthroneOd && !logGramStaining && !logMicroscopic) return;
    setSaving(true);
    try {
      let anthroneConc = null;
      if (logAnthroneOd && standardCurve) {
        const od = parseFloat(logAnthroneOd);
        const m = parseFloat(standardCurve.slope);
        const c = parseFloat(standardCurve.y_intercept);
        if (m !== 0) anthroneConc = (od - c) / m;
      }

      const { error } = await supabase.from('batch_fermentation_readings').insert({
        batch_id: batch.id,
        seed_train_id: setupData.id,
        flask_id: selectedFlaskId,
        ph: logPh ? parseFloat(logPh) : null,
        optical_density: logOd ? parseFloat(logOd) : null,
        is_blank: logIsBlank,
        anthrone_od: logAnthroneOd ? parseFloat(logAnthroneOd) : null,
        anthrone_conc: anthroneConc,
        standard_curve_id: standardCurve?.id || null,
        gram_staining: logGramStaining || null,
        microscopic_test: logMicroscopic || null,
        dilution_factor: logDilution ? parseFloat(logDilution) : null,
        logged_by: employeeProfile?.id,
        logged_by_name: employeeProfile?.full_name || null,
        logged_by_role: employeeProfile?.role || null,
      });
      if (error) throw error;
      toast.success('Reading logged!');
      setShowLogModal(false);
      setLogPh(''); setLogOd(''); setLogAnthroneOd(''); setLogIsBlank(false);
      setLogGramStaining(''); setLogMicroscopic(''); setLogDilution('');
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleHarvest = async (flaskId, flaskLabel) => {
    if (!confirm(`Harvest ${flaskLabel} and send to Downstream? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const { data: rpcData, error } = await supabase.rpc('advance_flask_stage', {
        p_flask_id: flaskId,
        p_batch_id: batch.id,
        p_to_stage: 'straining',
        p_employee_id: employeeProfile?.id,
      });
      if (error) throw error;
      if (rpcData?.success === false) throw new Error(rpcData.error);
      toast.success(`${flaskLabel} harvested!`);
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const completedFlasks = stageFlasks.filter(f => f.current_stage !== 'fermentation' && f.current_stage !== 'inoculation');
  const allHarvested = stageFlasks.length > 0 && completedFlasks.length === stageFlasks.length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* ── SECTION A: BULK SETUP ── */}
      {!isInoculated && (
        <div className="card p-6 border-2 border-navy shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-navy uppercase tracking-widest flex items-center gap-2">
              <FlaskConical className="w-5 h-5"/> Production Explosion Setup
            </h2>
            {setupData?.inventory_deduction_status && (
              <span className={`text-xs font-black px-2 py-1 rounded ${
                setupData.inventory_deduction_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                setupData.inventory_deduction_status === 'failed' ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                Inventory: {setupData.inventory_deduction_status.toUpperCase()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Step 1: Media */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
                <Beaker className="w-4 h-4"/> 1. Bulk Media
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Production Formulation</label>
                  <select value={formulationId} onChange={e => setFormulationId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- Inherit from Batch --</option>
                    {formulations.map(f => <option key={f.id} value={f.id}>{f.name} v{f.version}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Total Volume (ml)</label>
                  <input type="number" value={mediaVolumeMl} onChange={e => setMediaVolumeMl(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. 50000"/>
                </div>
              </div>
              <button onClick={handleSaveSetup} disabled={saving} className="w-full py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50">
                Save Formulation & Volume
              </button>
            </div>

            {/* Step 2: Sterilise */}
            <div className="space-y-4 border-l pl-8 border-slate-100">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
                <ShieldCheck className="w-4 h-4"/> 2. Sterilisation
              </h3>
              
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Autoclave ID</label>
                  <input type="text" value={sterilizerId} onChange={e => setSterilizerId(e.target.value)} disabled={isSterilised} className="w-full px-2 py-1.5 border rounded-lg text-xs"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Temp (°C)</label>
                  <input type="number" value={sterilizerTemp} onChange={e => setSterilizerTemp(e.target.value)} disabled={isSterilised} className="w-full px-2 py-1.5 border rounded-lg text-xs"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Mins</label>
                  <input type="number" value={sterilizerDuration} onChange={e => setSterilizerDuration(e.target.value)} disabled={isSterilised} className="w-full px-2 py-1.5 border rounded-lg text-xs"/>
                </div>
              </div>

              <div className="h-10 flex items-center">
                {isSterilised ? (
                  <p className="text-xs font-bold text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4"/> Sterilised {setupData?.sterilised_at ? dayjs(setupData.sterilised_at).format('HH:mm') : ''}
                  </p>
                ) : (
                  <button onClick={handleSterilise} disabled={saving || !setupData?.id} className="w-full py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover disabled:opacity-50">
                    Sterilise & Debit Inventory
                  </button>
                )}
              </div>
            </div>

            {/* Step 3: Inoculate Explosion */}
            <div className="lg:col-span-2 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2 mb-4">
                <Droplets className="w-4 h-4"/> 3. Inoculation Explosion
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Inoculum Seed Source</label>
                  <select value={seedInoculum} onChange={e => setSeedInoculum(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="seed_1">Seed 1</option>
                    <option value="seed_2">Seed 2</option>
                    <option value="seed_3">Seed 3</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Incubator ID</label>
                  <input type="text" value={incubatorId} onChange={e => setIncubatorId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Temp / RPM</label>
                  <div className="flex gap-1">
                    <input type="number" value={incubationTemp} onChange={e => setIncubationTemp(e.target.value)} className="w-full px-2 py-2 border rounded-lg text-xs" title="Temp"/>
                    <input type="number" value={incubationRpm} onChange={e => setIncubationRpm(e.target.value)} className="w-full px-2 py-2 border rounded-lg text-xs" title="RPM"/>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Total Flasks (N)</label>
                  <input type="number" min="1" value={numFlasks} onChange={e => setNumFlasks(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border rounded-lg text-sm font-black text-center"/>
                </div>
              </div>
              
              <button
                onClick={handleInoculateExplosion}
                disabled={saving || !isSterilised}
                className="w-full mt-4 py-3 bg-emerald-600 text-white text-sm font-black rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                Inoculate {numFlasks} Flask(s) & Start Incubation <ArrowRight className="w-4 h-4"/>
              </button>
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
              {completedFlasks.length}/{stageFlasks.length} Harvested
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {stageFlasks.map(f => {
              const flaskReadings = fermentationReadings.filter(r => r.flask_id === f.id);
              const isHarvested = f.current_stage !== 'fermentation' && f.current_stage !== 'inoculation';
              return (
                <div key={f.id} className={`card border-2 p-5 transition-all ${isHarvested ? 'border-amber-200 bg-amber-50' : 'border-slate-100 hover:border-slate-300'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-800">{f.flask_label}</h3>
                      <p className="text-[10px] font-bold text-slate-500 mt-1">
                        Incubator: {f.incubator_equipment_id} • {f.incubation_temp_c}°C • {f.incubation_agitation_rpm} RPM
                      </p>
                    </div>
                    {!isHarvested && (
                      <button onClick={() => handleHarvest(f.id, f.flask_label)} disabled={saving} className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-black rounded hover:bg-amber-200 disabled:opacity-50">
                        Harvest
                      </button>
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-lg p-2 min-h-[80px]">
                    {flaskReadings.length > 0 ? (
                      <div className="space-y-1">
                        {flaskReadings.map(r => (
                          <div key={r.id} className="flex justify-between text-xs py-1.5 border-b border-slate-200 last:border-0">
                            <span className="text-slate-500 w-12">{dayjs(r.logged_at).format('HH:mm')}</span>
                            <span className="font-bold w-12">{r.ph ? `pH ${r.ph}` : ''}</span>
                            <span className="font-bold w-14">{r.optical_density ? `OD ${r.optical_density}` : ''}</span>
                            <span className="font-bold text-navy text-right flex-1 truncate">
                              {r.anthrone_conc ? `${parseFloat(r.anthrone_conc).toFixed(2)} µg/ml` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium py-4">No samples logged</div>
                    )}
                  </div>

                  {!isHarvested && (
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => { setSelectedFlaskId(f.id); setShowLogModal(true); }} className="flex-1 py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover flex items-center justify-center gap-1">
                        <Plus className="w-3 h-3"/> Sample
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {allHarvested && (
            <div className="card p-6 border-2 border-emerald-500 bg-emerald-50 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3"/>
              <h3 className="text-lg font-black text-emerald-800 mb-1">All Flasks Harvested!</h3>
              <p className="text-sm text-emerald-700">This batch has been fully transferred to Downstream processing.</p>
            </div>
          )}
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-slate-900 mb-4">
              Log Sample — {flasks.find(f => f.id === selectedFlaskId)?.flask_label}
            </h3>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">pH</label>
                  <input type="number" step="0.01" value={logPh} onChange={e => setLogPh(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">OD 600nm</label>
                  <input type="number" step="0.01" value={logOd} onChange={e => setLogOd(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Dilution Factor</label>
                  <input type="number" step="1" value={logDilution} onChange={e => setLogDilution(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Gram Staining</label>
                  <select value={logGramStaining} onChange={e => setLogGramStaining(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                    <option value="">-- Optional --</option>
                    <option value="Gram Positive">Gram Positive</option>
                    <option value="Gram Negative">Gram Negative</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Microscopic Notes</label>
                  <input type="text" value={logMicroscopic} onChange={e => setLogMicroscopic(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Normal morphology..."/>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Anthrone OD</label>
                  {standardCurve
                    ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Auto-Calc Active</span>
                    : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">No Std Curve</span>
                  }
                </div>
                <input type="number" step="0.01" value={logAnthroneOd} onChange={e => setLogAnthroneOd(e.target.value)} placeholder="Optional" className="w-full px-3 py-2 border rounded-lg"/>
              </div>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer select-none pt-2">
                <input type="checkbox" checked={logIsBlank} onChange={e => setLogIsBlank(e.target.checked)} className="w-4 h-4 text-navy rounded border-slate-300"/>
                This is a BLANK flask reading
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowLogModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">Cancel</button>
              <button
                onClick={submitReading}
                disabled={saving || (!logPh && !logOd && !logAnthroneOd && !logGramStaining && !logMicroscopic)}
                className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Reading'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
