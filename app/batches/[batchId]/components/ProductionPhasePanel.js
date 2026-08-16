'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useForm } from 'react-hook-form';
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
  onTransfer,     // called when all flasks are harvested (batch done)
  onDataChange,   // called after any mutation → triggers server refresh
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  // Extract production seed train from props
  const setupData = useMemo(
    () => seedTrains.find(s => s.stage_type === 'production') || null,
    [seedTrains]
  );

  // Local state
  const [formulationId, setFormulationId] = useState(setupData?.formulation_id || '');
  const [numFlasks, setNumFlasks] = useState(1);
  const [seedInoculum, setSeedInoculum] = useState(setupData?.inoculum_source_details || 'seed_1');

  const [saving, setSaving] = useState(false);
  const [selectedFlaskId, setSelectedFlaskId] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);

  // Optimistic sterilisation state
  const [optimisticSterilised, setOptimisticSterilised] = useState(null);
  const isSterilised = optimisticSterilised ?? setupData?.is_sterilised ?? false;
  const isInoculated = !!setupData?.inoculated_at;

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
    setOptimisticSterilised(true); // instant UI
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_seed_trains')
        .update({ is_sterilised: true, sterilised_at: new Date().toISOString() })
        .eq('id', setupData.id);
      if (error) throw error;
      toast.success('Bulk media sterilised!');
      onDataChange?.();
    } catch (err) {
      setOptimisticSterilised(null);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInoculateExplosion = async () => {
    if (!isSterilised) return toast.warn('Must sterilise bulk media first!');
    setSaving(true);
    try {
      // Create N flasks
      const flaskPayloads = Array.from({ length: numFlasks }).map((_, i) => ({
        batch_id: batch.id,
        flask_label: `F${i + 1}`,
        current_stage: 'fermentation',
        status: 'active',
      }));
      const { error: fErr } = await supabase.from('batch_flasks').insert(flaskPayloads);
      if (fErr) throw fErr;

      await supabase.from('batch_seed_trains').update({
        inoculated_at: new Date().toISOString(),
        inoculum_source_type: 'previous_seed',
        inoculum_source_details: seedInoculum,
      }).eq('id', setupData.id);

      toast.success(`${numFlasks} Production Flask${numFlasks > 1 ? 's' : ''} generated & inoculated!`);
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
        logged_at: new Date().toISOString(),
        logged_by: employeeProfile?.id,
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

  const completedFlasks = flasks.filter(f => f.current_stage !== 'fermentation' && f.current_stage !== 'inoculation');
  const allHarvested = flasks.length > 0 && completedFlasks.length === flasks.length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">

      {/* ── SECTION A: BULK SETUP (only shown before explosion) ── */}
      {!isInoculated && (
        <div className="card p-6 border-2 border-navy shadow-sm">
          <h2 className="text-lg font-black text-navy uppercase tracking-widest mb-6 flex items-center gap-2">
            <FlaskConical className="w-5 h-5"/> Production Explosion Setup
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Step 1: Media */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
                <Beaker className="w-4 h-4"/> 1. Bulk Media
              </h3>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Production Formulation</label>
                <select value={formulationId} onChange={e => setFormulationId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Inherit from Batch --</option>
                  {formulations.map(f => <option key={f.id} value={f.id}>{f.name} v{f.version}</option>)}
                </select>
              </div>
              <button onClick={handleSaveSetup} disabled={saving} className="w-full py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50">
                Save Formulation
              </button>
            </div>

            {/* Step 2: Sterilise */}
            <div className="space-y-4 border-l pl-8 border-slate-100">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
                <ShieldCheck className="w-4 h-4"/> 2. Sterilisation
              </h3>
              <div className="h-[68px] flex items-center">
                {isSterilised ? (
                  <p className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5"/>
                    Sterilised at {setupData?.sterilised_at ? dayjs(setupData.sterilised_at).format('HH:mm') : '--'}
                  </p>
                ) : (
                  <button onClick={handleSterilise} disabled={saving || !setupData?.id} className="w-full py-3 bg-navy text-white text-sm font-black rounded-xl hover:bg-navy-hover disabled:opacity-50">
                    Mark Bulk Media Sterilised
                  </button>
                )}
              </div>
            </div>

            {/* Step 3: Inoculate Explosion */}
            <div className="lg:col-span-2 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2 mb-4">
                <Droplets className="w-4 h-4"/> 3. Inoculation Explosion
              </h3>
              <div className="flex flex-col sm:flex-row items-end gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Inoculum Seed Source</label>
                  <select value={seedInoculum} onChange={e => setSeedInoculum(e.target.value)} className="w-full px-3 py-3 border rounded-xl text-sm">
                    <option value="seed_1">Seed 1</option>
                    <option value="seed_2">Seed 2</option>
                    <option value="seed_3">Seed 3</option>
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Total Flasks (N)</label>
                  <input
                    type="number" min="1" value={numFlasks}
                    onChange={e => setNumFlasks(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-3 border rounded-xl text-sm font-black text-center"
                  />
                </div>
                <button
                  onClick={handleInoculateExplosion}
                  disabled={saving || !isSterilised}
                  className="py-3 px-8 bg-emerald-600 text-white text-sm font-black rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  Inoculate {numFlasks} Flask{numFlasks > 1 ? 's' : ''} <ArrowRight className="w-4 h-4"/>
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
              {completedFlasks.length}/{flasks.length} Harvested
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {flasks.map(f => {
              const flaskReadings = fermentationReadings.filter(r => r.flask_id === f.id);
              const isHarvested = f.current_stage !== 'fermentation' && f.current_stage !== 'inoculation';
              return (
                <div key={f.id} className={`card border-2 p-5 transition-all ${isHarvested ? 'border-amber-200 bg-amber-50/30' : 'border-navy/10 hover:border-navy/30'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-800">{f.flask_label}</h3>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {isHarvested
                          ? <span className="text-amber-600">Harvested → Downstream</span>
                          : <span className="text-emerald-600">Incubating</span>
                        }
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
                          <div key={r.id} className="flex justify-between text-xs py-1 border-b border-slate-200 last:border-0">
                            <span className="text-slate-500 w-12">{dayjs(r.logged_at).format('HH:mm')}</span>
                            <span className="font-bold w-14">{r.ph ? `pH ${r.ph}` : ''}</span>
                            <span className="font-bold w-16">{r.optical_density ? `OD ${r.optical_density}` : ''}</span>
                            <span className="font-bold text-navy text-right flex-1 truncate">
                              {r.anthrone_conc ? `${parseFloat(r.anthrone_conc).toFixed(2)} µg/ml` : ''}
                              {r.is_blank && <span className="text-amber-600"> (BLANK)</span>}
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
                      <button className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-black rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1">
                        <Link className="w-3 h-3"/> Link Plate
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* All harvested — show completion */}
          {allHarvested && (
            <div className="card p-6 border-2 border-emerald-500 bg-emerald-50/40 text-center">
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
