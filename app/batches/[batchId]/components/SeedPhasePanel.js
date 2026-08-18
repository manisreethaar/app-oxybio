'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { Beaker, ShieldCheck, Droplets, Activity, Plus, ArrowRight, CheckCircle2, AlertTriangle, FlaskConical, Calendar } from 'lucide-react';
import dayjs from 'dayjs';

const INOCULUM_TYPES = ['glycerol', 'curd', 'rice_water', 'natural', 'previous_seed'];

export default function SeedPhasePanel({
  batch,
  stageType,
  seedTrains,
  fermentationReadings,
  flasks,
  formulations,
  vials,
  employeeProfile,
  onTransfer,
  onDataChange,
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const data = useMemo(() => seedTrains.find(s => s.stage_type === stageType) || null, [seedTrains, stageType]);
  // Filter flasks that belong to this seed phase
  const stageFlasks = useMemo(() => flasks.filter(f => f.seed_train_id === data?.id), [flasks, data]);
  
  // Local form state for media setup
  const [formulationId, setFormulationId] = useState(data?.formulation_id || '');
  const [mediaVolumeMl, setMediaVolumeMl] = useState(data?.media_volume_ml || '');
  const [mediaNotes, setMediaNotes] = useState(data?.media_recipe_notes || '');
  const [inoculumSourceType, setInoculumSourceType] = useState(data?.inoculum_source_type || 'glycerol');
  const [cellBankVialId, setCellBankVialId] = useState(data?.cell_bank_vial_id || '');
  const [inoculumDetails, setInoculumDetails] = useState(data?.inoculum_source_details || '');

  // Sterilization fields
  const [sterilizerId, setSterilizerId] = useState(data?.sterilizer_equipment_id || '');
  const [sterilizerTemp, setSterilizerTemp] = useState(data?.sterilization_temp_c || 121);
  const [sterilizerDuration, setSterilizerDuration] = useState(data?.sterilization_duration_mins || 20);
  // Bug 4 fix: datetime for sterilization
  const toLocalDatetime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const [sterilizationDateTime, setSterilizationDateTime] = useState(
    data?.sterilised_at ? toLocalDatetime(data.sterilised_at) : toLocalDatetime(new Date().toISOString())
  );
  
  // Inoculation explosion fields
  const [flaskPrefix, setFlaskPrefix] = useState(''); // Bug 5: custom flask label prefix
  const [numFlasks, setNumFlasks] = useState(1);
  const [incubatorId, setIncubatorId] = useState('');
  const [incubationTemp, setIncubationTemp] = useState(37);
  const [incubationRpm, setIncubationRpm] = useState(200);

  // Bug 5: fetch equipment list
  const [equipment, setEquipment] = useState([]);
  useEffect(() => {
    const sb = createClient();
    sb.from('equipment').select('id, name, status').order('name').then(({ data: eq }) => {
      if (eq) setEquipment(eq.filter(e => e.name.toLowerCase().includes('incubat') || e.name.toLowerCase().includes('shaker')));
    });
  }, []);

  // States
  const [saving, setSaving] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedFlaskId, setSelectedFlaskId] = useState(null);
  const [showNextStageModal, setShowNextStageModal] = useState(false);
  
  // Derived
  const isSterilised = data?.is_sterilised ?? false;
  const isInoculated = stageFlasks.length > 0;

  // Log modal fields
  const [logPh, setLogPh] = useState('');
  const [logOd, setLogOd] = useState('');
  const [logIsBlank, setLogIsBlank] = useState(false);
  const [logGramStaining, setLogGramStaining] = useState('');
  const [logMicroscopic, setLogMicroscopic] = useState('');
  const [logDilution, setLogDilution] = useState('');

  const handleSaveSetup = async () => {
    setSaving(true);
    try {
      const payload = {
        batch_id: batch.id,
        stage_type: stageType,
        formulation_id: formulationId || null,
        media_volume_ml: mediaVolumeMl ? parseFloat(mediaVolumeMl) : null,
        media_recipe_notes: mediaNotes || null,
        inoculum_source_type: inoculumSourceType,
        cell_bank_vial_id: inoculumSourceType === 'glycerol' && cellBankVialId ? cellBankVialId : null,
        inoculum_source_details: inoculumDetails || null,
      };

      // Route through server API
      const res = await fetch(`/api/batches/${batch.id}/seed-trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_setup',
          payload: data?.id ? { ...payload, id: data.id } : payload
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to save setup');
      toast.success('Media setup saved.');
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      // Bug 3 fix: always reset saving AFTER notifying parent
      setSaving(false);
    }
  };

  const handleSterilise = async () => {
    if (!data?.id) return toast.warn('Save setup first.');
    if (!sterilizerId || !sterilizerTemp || !sterilizerDuration) {
      return toast.warn('Enter all sterilization equipment parameters.');
    }
    
    setSaving(true);
    try {
      // Bug 4 fix: use user-specified datetime instead of always now()
      const sterilisedAt = sterilizationDateTime
        ? new Date(sterilizationDateTime).toISOString()
        : new Date().toISOString();

      const updates = {
        is_sterilised: true,
        sterilised_at: sterilisedAt,
        sterilizer_equipment_id: sterilizerId,
        sterilization_temp_c: parseFloat(sterilizerTemp),
        sterilization_duration_mins: parseInt(sterilizerDuration)
      };
      // Route through server API
      const res = await fetch(`/api/batches/${batch.id}/seed-trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sterilise',
          id: data.id,
          updates,
          employeeId: employeeProfile.id
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to sterilize');

      if (resData.rpcData?.success) {
        toast.success('Media Sterilised & Inventory Auto-Debited!');
      } else {
        toast.error('Sterilised, but inventory deduction failed: ' + (resData.rpcData?.error || 'Unknown error'));
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
    if (!incubatorId) return toast.warn('Select an Incubator from the list.');
    
    setSaving(true);
    try {
      // Bug 5 fix: use user-defined flask prefix, fallback to stage prefix
      const stagePrefix = stageType === 'seed_1' ? 'S1' : stageType === 'seed_2' ? 'S2' : 'S3';
      const labelBase = flaskPrefix.trim() || stagePrefix;

      const flaskPayloads = Array.from({ length: numFlasks }).map((_, i) => ({
        batch_id: batch.id,
        seed_train_id: data.id,
        flask_label: `${labelBase}-F${i + 1}`,
        current_stage: 'fermentation',
        status: 'active',
        incubator_equipment_id: incubatorId,
        incubation_temp_c: parseFloat(incubationTemp),
        incubation_agitation_rpm: parseInt(incubationRpm),
        inoculated_at: new Date().toISOString()
      }));

      // Route through server API
      const res = await fetch(`/api/batches/${batch.id}/seed-trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inoculate',
          batchId: batch.id,
          id: data.id,
          updates: { inoculated_at: new Date().toISOString() },
          flaskPayloads
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to generate flasks');
      
      toast.success(`${numFlasks} Seed Flask(s) generated & inoculated!`);
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const validateReading = () => {
    if (!employeeProfile?.id) return 'You must be logged in as an employee to log a reading.';
    if (!logPh && !logOd && !logGramStaining && !logMicroscopic) return 'Enter at least one measurement.';
    if (logPh) {
      const ph = parseFloat(logPh);
      if (isNaN(ph) || ph < 0 || ph > 14) return 'pH must be between 0.0 and 14.0.';
    }
    if (logOd) {
      const od = parseFloat(logOd);
      if (isNaN(od) || od < 0 || od > 10) return 'OD 600nm must be between 0.0 and 10.0.';
      if (od > 2.0 && !logDilution) return 'OD > 2.0 detected — dilution factor is required.';
    }
    if (logDilution && parseFloat(logDilution) <= 0) return 'Dilution factor must be a positive number.';
    return null;
  };

  const submitReading = async () => {
    const err = validateReading();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batch.id}/seed-trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_reading',
          readingPayload: {
            batch_id: batch.id,
            seed_train_id: data.id,
            flask_id: selectedFlaskId,
            ph: logPh ? parseFloat(logPh) : null,
            optical_density: logOd ? parseFloat(logOd) : null,
            is_blank: logIsBlank,
            gram_staining: logGramStaining || null,
            microscopic_test: logMicroscopic || null,
            dilution_factor: logDilution ? parseFloat(logDilution) : null,
            logged_by: employeeProfile.id,
            logged_by_name: employeeProfile.full_name || null,
            logged_by_role: employeeProfile.role || null,
          }
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to log reading');
      
      toast.success('Reading logged. ✓ ALOCA++');
      setShowLogModal(false);
      setLogPh(''); setLogOd(''); setLogIsBlank(false);
      setLogGramStaining(''); setLogMicroscopic(''); setLogDilution('');
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const executeStageTransfer = async (targetStage) => {
    if (!confirm(`Proceed to ${targetStage.replace('_', ' ').toUpperCase()}?`)) return;
    setSaving(true);
    try {
      // Route through server API
      const res = await fetch(`/api/batches/${batch.id}/seed-trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer_stage',
          currentStageId: data.id,
          targetStage: targetStage,
          batchId: batch.id
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to transfer stage');
      
      toast.success(`Moved to ${targetStage.toUpperCase()}`);
      onTransfer(targetStage);
      setShowNextStageModal(false);
    } catch (err) {
      toast.error('Transfer failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">

      {/* 1. Setup & Media */}
      {!isInoculated && (
        <div className="card p-6 border-l-4 border-l-slate-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Beaker className="w-4 h-4 text-navy"/> Media Setup
            </h3>
            {data?.inventory_deduction_status && (
              <span className={`text-xs font-black px-2 py-1 rounded ${
                data.inventory_deduction_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                data.inventory_deduction_status === 'failed' ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                Inventory: {data.inventory_deduction_status.toUpperCase()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Formulation (Recipe)</label>
              <select value={formulationId} onChange={e => setFormulationId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">-- Inherit from Batch / None --</option>
                {formulations.map(f => <option key={f.id} value={f.id}>{f.name} v{f.version}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Media Volume (ml) — Auto Debits</label>
              <input type="number" value={mediaVolumeMl} onChange={e => setMediaVolumeMl(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Inoculum Source Type</label>
              <select value={inoculumSourceType} onChange={e => setInoculumSourceType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                {INOCULUM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
              </select>
            </div>
            {inoculumSourceType === 'glycerol' && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Cell Bank Vial</label>
                <select value={cellBankVialId} onChange={e => setCellBankVialId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Select Vial --</option>
                  {vials.map(v => <option key={v.id} value={v.id}>{v.vial_label} {v.is_consumed ? '(Consumed)' : ''}</option>)}
                </select>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-1">Notes / Details</label>
              <input type="text" value={inoculumDetails} onChange={e => setInoculumDetails(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>
            </div>
          </div>
          <button onClick={handleSaveSetup} disabled={saving} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-black rounded-lg hover:bg-slate-200 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Media Setup'}
          </button>
        </div>
      )}

      {/* 2. Sterilization */}
      {!isInoculated && (
        <div className={`card p-6 border ${isSterilised ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'} transition-all duration-300`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isSterilised ? 'text-emerald-600' : 'text-slate-400'}`}/> Bulk Sterilisation
            </h3>
            {isSterilised && <CheckCircle2 className="w-5 h-5 text-emerald-500"/>}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Autoclave / Equipment ID</label>
              <input type="text" value={sterilizerId} onChange={e => setSterilizerId(e.target.value)} disabled={isSterilised} className="w-full px-3 py-2 border rounded-lg text-sm"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Temperature (°C)</label>
              <input type="number" value={sterilizerTemp} onChange={e => setSterilizerTemp(e.target.value)} disabled={isSterilised} className="w-full px-3 py-2 border rounded-lg text-sm"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Cycle Duration (mins)</label>
              <input type="number" value={sterilizerDuration} onChange={e => setSterilizerDuration(e.target.value)} disabled={isSterilised} className="w-full px-3 py-2 border rounded-lg text-sm"/>
            </div>
          </div>

          {/* Sterilization Date/Time — Bug 4 fix */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />Sterilization Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={sterilizationDateTime}
              onChange={e => setSterilizationDateTime(e.target.value)}
              disabled={isSterilised}
              className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
            <p className="text-[10px] text-slate-400 mt-1">Defaults to now. Adjust if recording retroactively.</p>
          </div>

          {!isSterilised && (
             <button onClick={handleSterilise} disabled={saving || !data?.id} className="py-2 px-6 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover disabled:opacity-50">
               {saving ? 'Processing...' : 'Run Sterilization & Deduct Inventory'}
             </button>
          )}
        </div>
      )}

      {/* 3. Inoculation Explosion (Multi-flask) */}
      {!isInoculated && (
        <div className="card p-6 border border-slate-200">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-4">
            <Droplets className="w-4 h-4 text-navy"/> Inoculation Explosion (Generate Flasks)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mb-4">
            {/* Bug 5: custom flask label prefix */}
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-xs font-bold text-slate-500 mb-1">Flask Label Prefix (optional)</label>
              <input
                type="text"
                value={flaskPrefix}
                onChange={e => setFlaskPrefix(e.target.value)}
                placeholder={`e.g. RKU-S1 → generates RKU-S1-F1, RKU-S1-F2…`}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-[10px] text-slate-400 mt-1">Leave blank to use default ({stageType === 'seed_1' ? 'S1' : stageType === 'seed_2' ? 'S2' : 'S3'}-F1, -F2…)</p>
            </div>
            <div className="md:col-span-2">
              {/* Bug 5: equipment dropdown instead of freetext */}
              <label className="block text-xs font-bold text-slate-500 mb-1">Incubator / Shaker</label>
              {equipment.length > 0 ? (
                <select
                  value={incubatorId}
                  onChange={e => setIncubatorId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="">-- Select Equipment --</option>
                  {equipment.map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.name} ({eq.status})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={incubatorId}
                  onChange={e => setIncubatorId(e.target.value)}
                  placeholder="Incubator ID or name"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Temp Setpoint (°C)</label>
              <input type="number" value={incubationTemp} onChange={e => setIncubationTemp(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Agitation (RPM)</label>
              <input type="number" value={incubationRpm} onChange={e => setIncubationRpm(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Total Flasks (N)</label>
              <input type="number" min="1" value={numFlasks} onChange={e => setNumFlasks(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border rounded-lg text-sm font-black"/>
            </div>
          </div>
          <button onClick={handleInoculateExplosion} disabled={saving || !isSterilised} className="w-full py-3 bg-emerald-600 text-white text-sm font-black rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
            Inoculate {numFlasks} Flask(s) & Start Incubation <ArrowRight className="w-4 h-4"/>
          </button>
        </div>
      )}

      {/* 4. Flask Dashboard & Sampling */}
      {isInoculated && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-navy uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-5 h-5"/> {stageType.replace('_', ' ').toUpperCase()} FLASKS
            </h2>
            <div className="text-xs font-bold text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
              {stageFlasks.length} Flasks Active
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {stageFlasks.map(f => {
              const fReadings = fermentationReadings.filter(r => r.flask_id === f.id);
              return (
                <div key={f.id} className="card border-2 p-5 border-slate-100 hover:border-slate-300">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-800">{f.flask_label}</h3>
                      <p className="text-[10px] font-bold text-slate-500 mt-1">
                        Incubator: {equipment.find(eq => eq.id === f.incubator_equipment_id)?.name || f.incubator_equipment_id} • {f.incubation_temp_c}°C • {f.incubation_agitation_rpm} RPM
                      </p>
                    </div>
                    <button onClick={() => { setSelectedFlaskId(f.id); setShowLogModal(true); }} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-black rounded-lg hover:bg-slate-200 flex items-center gap-1">
                      <Plus className="w-3 h-3"/> Sample
                    </button>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-2 min-h-[80px]">
                    {fReadings.length > 0 ? (
                      <div className="space-y-1">
                        {fReadings.map(r => (
                          <div key={r.id} className="flex justify-between text-xs py-1.5 border-b border-slate-200 last:border-0">
                            <span className="text-slate-500 w-16">
                              {dayjs(r.logged_at).format('HH:mm')}
                              <div className="text-[9px] text-slate-400 font-bold">{r.logged_by_name?.split(' ')[0]}</div>
                            </span>
                            <span className="font-bold w-12">{r.ph ? `pH ${r.ph}` : ''}</span>
                            <span className="font-bold w-16">{r.optical_density ? `OD ${r.optical_density}` : ''}</span>
                            <span className="text-slate-600 flex-1 truncate" title={r.microscopic_test}>
                              {r.is_superseded ? <span className="line-through text-red-500">SUPERSEDED</span> : r.gram_staining || (r.microscopic_test ? 'Notes' : '')}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium py-4">No samples logged</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end">
            <button
              onClick={() => setShowNextStageModal(true)}
              className="px-6 py-3 bg-navy text-white text-sm font-black rounded-xl uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-navy-hover transition-all"
            >
              Complete Stage & Proceed <ArrowRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      )}

      {/* Next Stage Modal */}
      {showNextStageModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-black text-slate-900 mb-2">Select Next Stage</h3>
            <p className="text-sm text-slate-500 mb-6">Where should this batch proceed next? (Optional seed stages can be skipped).</p>
            
            <div className="space-y-3">
              {stageType === 'seed_1' && (
                <button onClick={() => executeStageTransfer('seed_2')} className="w-full p-4 border-2 border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 text-left transition-all">
                  <div className="font-black text-navy text-sm uppercase tracking-wider">Proceed to Seed 2</div>
                  <div className="text-xs text-slate-500">Continue volume expansion</div>
                </button>
              )}
              
              {(stageType === 'seed_1' || stageType === 'seed_2') && (
                <button onClick={() => executeStageTransfer('seed_3')} className="w-full p-4 border-2 border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 text-left transition-all">
                  <div className="font-black text-navy text-sm uppercase tracking-wider">Proceed to Seed 3</div>
                  <div className="text-xs text-slate-500">Continue volume expansion</div>
                </button>
              )}
              
              <button onClick={() => executeStageTransfer('production')} className="w-full p-4 border-2 border-emerald-500 bg-emerald-50 rounded-xl hover:bg-emerald-100 text-left transition-all">
                <div className="font-black text-emerald-800 text-sm uppercase tracking-wider">Skip to Production</div>
                <div className="text-xs text-emerald-600">Start bulk production fermentation</div>
              </button>
            </div>
            
            <button onClick={() => setShowNextStageModal(false)} className="w-full mt-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {/* Log Modal (ALOCA++) */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900">Log Sample Reading</h3>
              <span className="text-[10px] font-black tracking-widest bg-slate-100 text-slate-700 px-2 py-1 rounded-full">ALOCA++</span>
            </div>

            <div className="flex items-center gap-2 mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black">
                {employeeProfile?.full_name?.[0] || '?'}
              </div>
              <div>
                <p className="text-xs font-black text-slate-800">{employeeProfile?.full_name || 'Unknown'}</p>
                <p className="text-[10px] text-slate-500 font-semibold">{employeeProfile?.role || 'No role'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">pH</label>
                <input type="number" step="0.01" value={logPh} onChange={e=>setLogPh(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">OD 600nm</label>
                <input type="number" step="0.001" value={logOd} onChange={e=>setLogOd(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Dilution Factor</label>
                <input type="number" step="1" value={logDilution} onChange={e=>setLogDilution(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Gram Staining</label>
                <select value={logGramStaining} onChange={e=>setLogGramStaining(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="">-- Not Done --</option>
                  <option value="Gram Positive">Gram Positive (+)</option>
                  <option value="Gram Negative">Gram Negative (−)</option>
                  <option value="Mixed">Mixed Culture</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Microscopic Observation</label>
                <select value={logMicroscopic} onChange={e=>setLogMicroscopic(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="">-- Select Observation --</option>
                  <option value="Normal morphology">Normal morphology</option>
                  <option value="Contamination suspected">Contamination suspected</option>
                  <option value="Low cell density">Low cell density</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => setShowLogModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={submitReading} disabled={saving || !employeeProfile?.id} className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {saving ? 'Saving...' : 'Save & Lock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
