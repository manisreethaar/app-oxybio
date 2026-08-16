'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { Beaker, ShieldCheck, Droplets, Activity, Plus, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';

const NEXT_STAGE_LABEL = {
  seed_1: { id: 'seed_2', label: 'Transfer to Seed 2' },
  seed_2: { id: 'seed_3', label: 'Transfer to Seed 3' },
  seed_3: { id: 'production', label: 'Transfer to Production' },
};

const INOCULUM_TYPES = ['glycerol', 'curd', 'rice_water', 'natural', 'previous_seed'];

export default function SeedPhasePanel({
  batch,
  stageType,
  seedTrains,         // all seed trains for this batch — filter locally
  fermentationReadings, // all readings — filter locally
  formulations,
  vials,
  employeeProfile,
  onTransfer,         // called after successful stage transition
  onDataChange,       // called after saves/readings (triggers background refresh)
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  // Extract THIS stage's data from the pre-loaded props
  const data = useMemo(
    () => seedTrains.find(s => s.stage_type === stageType) || null,
    [seedTrains, stageType]
  );

  const readings = useMemo(
    () => (data ? fermentationReadings.filter(r => r.seed_train_id === data.id) : []),
    [fermentationReadings, data]
  );

  // Local form state — pre-populated from prop data
  const [formulationId, setFormulationId] = useState(data?.formulation_id || '');
  const [mediaVolumeMl, setMediaVolumeMl] = useState(data?.media_volume_ml || '');
  const [mediaNotes, setMediaNotes] = useState(data?.media_recipe_notes || '');
  const [inoculumSourceType, setInoculumSourceType] = useState(data?.inoculum_source_type || 'glycerol');
  const [cellBankVialId, setCellBankVialId] = useState(data?.cell_bank_vial_id || '');
  const [inoculumDetails, setInoculumDetails] = useState(data?.inoculum_source_details || '');

  // Action states
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // Log modal state
  const [showLogModal, setShowLogModal] = useState(false);
  const [logPh, setLogPh] = useState('');
  const [logOd, setLogOd] = useState('');
  const [logIsBlank, setLogIsBlank] = useState(false);
  const [logGramStaining, setLogGramStaining] = useState('');
  const [logMicroscopic, setLogMicroscopic] = useState('');
  const [logDilution, setLogDilution] = useState('');

  // Derived status — use optimistic values if available, else from DB
  const [optimisticSterilised, setOptimisticSterilised] = useState(null);
  const [optimisticInoculated, setOptimisticInoculated] = useState(null);
  const isSterilised = optimisticSterilised ?? data?.is_sterilised ?? false;
  const isInoculated = optimisticInoculated ?? !!data?.inoculated_at;

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

      const { error } = data?.id
        ? await supabase.from('batch_seed_trains').update(payload).eq('id', data.id)
        : await supabase.from('batch_seed_trains').insert(payload);

      if (error) throw error;
      toast.success('Setup saved.');
      onDataChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action) => {
    if (!data?.id) return toast.warn('Save setup first.');
    setSaving(true);

    // Optimistic UI — update instantly
    if (action === 'sterilise') setOptimisticSterilised(true);
    if (action === 'inoculate') setOptimisticInoculated(true);

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
      toast.success(action === 'sterilise' ? 'Marked as Sterilised!' : 'Marked as Inoculated!');
      onDataChange?.();
    } catch (err) {
      // Revert optimistic on failure
      if (action === 'sterilise') setOptimisticSterilised(null);
      if (action === 'inoculate') setOptimisticInoculated(null);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitReading = async () => {
    if (!logPh && !logOd && !logGramStaining && !logMicroscopic) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_fermentation_readings').insert({
        batch_id: batch.id,
        seed_train_id: data.id,
        ph: logPh ? parseFloat(logPh) : null,
        optical_density: logOd ? parseFloat(logOd) : null,
        is_blank: logIsBlank,
        gram_staining: logGramStaining || null,
        microscopic_test: logMicroscopic || null,
        dilution_factor: logDilution ? parseFloat(logDilution) : null,
        logged_at: new Date().toISOString(),
        logged_by: employeeProfile?.id,
      });
      if (error) throw error;
      toast.success('Reading logged.');
      setShowLogModal(false);
      setLogPh(''); setLogOd(''); setLogIsBlank(false);
      setLogGramStaining(''); setLogMicroscopic(''); setLogDilution('');
      onDataChange?.(); // background refresh — table updates without full reload
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Stage transition — only one valid next stage per stage (strict state machine)
  const handleTransfer = async () => {
    const next = NEXT_STAGE_LABEL[stageType];
    if (!next) return;

    if (!confirm(`Transfer to ${next.label.replace('Transfer to ', '')}? This action cannot be undone.`)) return;
    setTransferring(true);
    try {
      // 1. Complete current seed train record
      await supabase.from('batch_seed_trains').update({ status: 'completed' }).eq('id', data.id);
      // 2. Create next stage record (if not production — production has its own setup)
      if (next.id !== 'production') {
        await supabase.from('batch_seed_trains').insert({ batch_id: batch.id, stage_type: next.id, status: 'active' });
      }
      // 3. Advance batch current_stage
      const { error: bErr } = await supabase.from('batches').update({ current_stage: next.id }).eq('id', batch.id);
      if (bErr) throw bErr;

      toast.success(`${next.label} complete!`);
      onTransfer?.(); // tells parent to switch panel (optimistic + server refresh)
    } catch (err) {
      toast.error('Transfer failed: ' + err.message);
    } finally {
      setTransferring(false);
    }
  };

  const nextStage = NEXT_STAGE_LABEL[stageType];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">

      {/* 1. Setup & Media */}
      <div className="card p-6 border-l-4 border-l-navy/40">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Beaker className="w-4 h-4 text-navy"/> Media Setup
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Formulation (Recipe)</label>
            <select value={formulationId} onChange={e => setFormulationId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">-- Inherit from Batch / None --</option>
              {formulations.map(f => <option key={f.id} value={f.id}>{f.name} v{f.version}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Media Volume (ml)</label>
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
                {vials.map(v => <option key={v.id} value={v.id}>{v.vial_label}</option>)}
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">Notes / Details</label>
            <input type="text" value={inoculumDetails} onChange={e => setInoculumDetails(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"/>
          </div>
        </div>
        <button onClick={handleSaveSetup} disabled={saving} className="px-4 py-2 bg-navy/10 text-navy text-xs font-black rounded-lg hover:bg-navy/20 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Setup'}
        </button>
      </div>

      {/* 2. Workflow Gates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`card p-6 border ${isSterilised ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'} transition-all duration-300`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isSterilised ? 'text-emerald-600' : 'text-slate-400'}`}/> Sterilisation
            </h3>
            {isSterilised && <CheckCircle2 className="w-5 h-5 text-emerald-500"/>}
          </div>
          {isSterilised ? (
            <p className="text-xs font-bold text-emerald-700">
              ✓ Sterilised {data?.sterilised_at ? `at ${dayjs(data.sterilised_at).format('DD MMM HH:mm')}` : ''}
            </p>
          ) : (
            <button onClick={() => handleAction('sterilise')} disabled={saving || !data?.id} className="w-full py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover disabled:opacity-50">
              Mark as Sterilised
            </button>
          )}
        </div>

        <div className={`card p-6 border ${isInoculated ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'} transition-all duration-300`}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Droplets className={`w-4 h-4 ${isInoculated ? 'text-emerald-600' : 'text-slate-400'}`}/> Inoculation
            </h3>
            {isInoculated && <CheckCircle2 className="w-5 h-5 text-emerald-500"/>}
          </div>
          {isInoculated ? (
            <p className="text-xs font-bold text-emerald-700">
              ✓ Inoculated {data?.inoculated_at ? `at ${dayjs(data.inoculated_at).format('DD MMM HH:mm')}` : ''}
            </p>
          ) : (
            <button onClick={() => handleAction('inoculate')} disabled={saving || !isSterilised} className="w-full py-2 bg-navy text-white text-xs font-black rounded-lg hover:bg-navy-hover disabled:opacity-50">
              Mark as Inoculated
            </button>
          )}
        </div>
      </div>

      {/* 3. Incubation & Sampling — only visible after inoculation */}
      {isInoculated && (
        <div className="card p-6 border-t-4 border-t-navy/40">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-navy"/> Incubation & Sampling
              </h3>
              <p className="text-xs text-slate-500">Log pH and OD readings until target is reached.</p>
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
                    <th className="px-4 py-3">Dilution</th>
                    <th className="px-4 py-3">Gram / Microscopic</th>
                    <th className="px-4 py-3">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {readings.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-500 font-medium">{dayjs(r.logged_at).format('DD MMM HH:mm')}</td>
                      <td className="px-4 py-3 font-bold">{r.ph ?? '-'}</td>
                      <td className="px-4 py-3 font-bold">{r.optical_density ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.dilution_factor ? `1:${r.dilution_factor}` : '-'}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-slate-700">{r.gram_staining || '-'}</div>
                        <div className="text-xs text-slate-500">{r.microscopic_test || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        {r.is_blank
                          ? <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">BLANK</span>
                          : <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">SAMPLE</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">No samples logged yet.</div>
          )}

          {/* Transfer Action — EXACTLY ONE valid next stage */}
          {nextStage && (
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleTransfer}
                disabled={transferring}
                className="px-6 py-3 bg-navy text-white text-xs font-black rounded-xl uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-navy-hover disabled:opacity-50 transition-all"
              >
                {transferring ? 'Transferring...' : nextStage.label}
                <ArrowRight className="w-4 h-4"/>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Warning if setup not saved yet */}
      {!data?.id && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0"/>
          Save the media setup above before marking sterilisation or inoculation.
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-slate-900 mb-4">Log Sample Reading</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
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
                <input type="text" value={logMicroscopic} onChange={e => setLogMicroscopic(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Clear, normal morphology..."/>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={logIsBlank} onChange={e => setLogIsBlank(e.target.checked)} className="w-4 h-4 text-navy rounded border-slate-300"/>
                This is a BLANK flask reading
              </label>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowLogModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={submitReading} disabled={saving || (!logPh && !logOd && !logGramStaining && !logMicroscopic)} className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Reading'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
