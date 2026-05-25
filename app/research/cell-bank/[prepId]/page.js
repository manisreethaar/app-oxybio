'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import {
  ChevronLeft, CheckCircle2, Circle, FlaskConical, Microscope,
  Thermometer, Droplets, Package, Snowflake, Edit2, Save, Plus
} from 'lucide-react';
import Skeleton from '@/components/Skeleton';

const STEPS = [
  { key: 'strain_source',   label: 'Strain Source',      icon: Microscope,    desc: 'Confirm strain identity and source documentation' },
  { key: 'broth_culture_1', label: 'Broth Culture #1',   icon: FlaskConical,  desc: 'Sub-culture in broth — check OD at 600nm' },
  { key: 'plating',         label: 'Plate on Agar',      icon: Droplets,      desc: 'Plate on selective agar + incubation' },
  { key: 'colony_pick',     label: 'Colony Pick',        icon: Microscope,    desc: 'Pick single colony from agar plate' },
  { key: 'broth_culture_2', label: 'Broth Culture #2',   icon: FlaskConical,  desc: 'Sub-culture picked colony — verify target OD' },
  { key: 'glycerol_stock',  label: 'Glycerol Stock',     icon: Thermometer,   desc: 'Prepare glycerol stock (15-20% v/v glycerol)' },
  { key: 'vial_storage',    label: 'Vial Registration',  icon: Snowflake,     desc: 'Log vials — freeze at −20°C or −80°C' },
];

const STATUS_COLOR = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'Discarded':   'bg-red-100 text-red-600',
};

function StepCard({ step, data, incubations, onSave, isAdmin }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState(data || {});
  const [saving, setSaving]   = useState(false);
  const toast = useToast();
  const Icon = step.icon;
  const isDone = data?.completed === true;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/research/cell-bank/${form._prepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: step.key, step_data_patch: { ...form, completed: true } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`${step.label} saved.`);
      onSave(json.data);
      setEditing(false);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const renderFields = () => {
    switch (step.key) {
      case 'strain_source':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Culture Condition</label>
              <input value={form.culture_condition||''} onChange={e=>set('culture_condition',e.target.value)} className="field-input" placeholder="e.g. MRS broth 37°C"/></div>
            <div><label className="field-label">Date Revived</label>
              <input type="date" value={form.date_revived||''} onChange={e=>set('date_revived',e.target.value)} className="field-input"/></div>
            <div className="col-span-2"><label className="field-label">Observations / Morphology</label>
              <textarea rows={2} value={form.observations||''} onChange={e=>set('observations',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
          </div>
        );
      case 'broth_culture_1':
      case 'broth_culture_2':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Broth / Media</label>
              <input value={form.media||''} onChange={e=>set('media',e.target.value)} className="field-input" placeholder="MRS broth"/></div>
            <div><label className="field-label">Volume (ml)</label>
              <input type="number" value={form.volume_ml||''} onChange={e=>set('volume_ml',e.target.value)} className="field-input" placeholder="10"/></div>
            <div><label className="field-label">Incubation Temp (°C)</label>
              <input type="number" value={form.incubation_temp||''} onChange={e=>set('incubation_temp',e.target.value)} className="field-input" placeholder="37"/></div>
            <div><label className="field-label">Duration (h)</label>
              <input type="number" value={form.duration_h||''} onChange={e=>set('duration_h',e.target.value)} className="field-input" placeholder="24"/></div>
            <div><label className="field-label">OD 600nm Reading</label>
              <input type="number" step="0.01" value={form.od_600||''} onChange={e=>set('od_600',e.target.value)} className="field-input" placeholder="0.8"/></div>
            <div><label className="field-label">Target OD Reached?</label>
              <select value={form.od_target_reached||''} onChange={e=>set('od_target_reached',e.target.value)} className="field-input bg-white">
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select></div>
            <div className="col-span-2"><label className="field-label">Notes</label>
              <textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
          </div>
        );
      case 'plating':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Agar Media</label>
                <input value={form.agar_media||''} onChange={e=>set('agar_media',e.target.value)} className="field-input" placeholder="MRS agar / LB agar"/></div>
              <div><label className="field-label">Dilution Factor</label>
                <input value={form.dilution||''} onChange={e=>set('dilution',e.target.value)} className="field-input" placeholder="10⁻⁴"/></div>
              <div><label className="field-label">Incubation Temp (°C)</label>
                <input type="number" value={form.incubation_temp||''} onChange={e=>set('incubation_temp',e.target.value)} className="field-input" placeholder="37"/></div>
              <div><label className="field-label">Incubation Hours</label>
                <input type="number" value={form.incubation_hours||''} onChange={e=>set('incubation_hours',e.target.value)} className="field-input" placeholder="48"/></div>
            </div>
            {incubations?.filter(i => i.sample_type === 'Agar Plate').length > 0 && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-1">
                <p className="text-[10px] font-black text-teal-700 uppercase">Incubation Results (from Incubation module)</p>
                {incubations.filter(i => i.sample_type === 'Agar Plate').map(i => (
                  <div key={i.id} className="text-xs text-teal-800 font-semibold flex gap-4 flex-wrap">
                    <span>{i.sample_name}</span>
                    {i.colony_count != null && <span>Colonies: {i.colony_count}</span>}
                    {i.cfu_per_ml != null && <span>CFU/ml: {i.cfu_per_ml}</span>}
                    {i.sterility_status && <span className={i.sterility_status === 'Sterile' ? 'text-emerald-700' : 'text-red-600'}>{i.sterility_status}</span>}
                  </div>
                ))}
              </div>
            )}
            <div><label className="field-label">Colony Observations</label>
              <textarea rows={2} value={form.colony_observations||''} onChange={e=>set('colony_observations',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none" placeholder="Colony morphology, colour, size..."/></div>
          </div>
        );
      case 'colony_pick':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Colony Description</label>
              <input value={form.colony_desc||''} onChange={e=>set('colony_desc',e.target.value)} className="field-input" placeholder="White, convex, smooth"/></div>
            <div><label className="field-label">Pick Date</label>
              <input type="date" value={form.pick_date||''} onChange={e=>set('pick_date',e.target.value)} className="field-input"/></div>
            <div className="col-span-2"><label className="field-label">Notes</label>
              <textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
          </div>
        );
      case 'glycerol_stock':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Glycerol % (v/v)</label>
              <input type="number" step="0.5" value={form.glycerol_pct||''} onChange={e=>set('glycerol_pct',e.target.value)} className="field-input" placeholder="15"/></div>
            <div><label className="field-label">Volume per Vial (ml)</label>
              <input type="number" step="0.1" value={form.volume_per_vial||''} onChange={e=>set('volume_per_vial',e.target.value)} className="field-input" placeholder="1.5"/></div>
            <div><label className="field-label">Number of Vials</label>
              <input type="number" value={form.num_vials||''} onChange={e=>set('num_vials',e.target.value)} className="field-input" placeholder="10"/></div>
            <div><label className="field-label">Prep Date</label>
              <input type="date" value={form.prep_date||''} onChange={e=>set('prep_date',e.target.value)} className="field-input"/></div>
            <div className="col-span-2"><label className="field-label">OD at Harvest</label>
              <input type="number" step="0.01" value={form.od_at_harvest||''} onChange={e=>set('od_at_harvest',e.target.value)} className="field-input" placeholder="OD 600nm"/></div>
            <div className="col-span-2"><label className="field-label">Notes</label>
              <textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
          </div>
        );
      case 'vial_storage':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Storage Temp</label>
              <select value={form.storage_temp||''} onChange={e=>set('storage_temp',e.target.value)} className="field-input bg-white">
                <option value="">Select...</option>
                <option value="-20°C">−20°C</option>
                <option value="-80°C">−80°C</option>
              </select></div>
            <div><label className="field-label">Freezer ID / Location</label>
              <input value={form.freezer_id||''} onChange={e=>set('freezer_id',e.target.value)} className="field-input" placeholder="ULT-01"/></div>
            <div><label className="field-label">Rack</label>
              <input value={form.rack||''} onChange={e=>set('rack',e.target.value)} className="field-input" placeholder="R3"/></div>
            <div><label className="field-label">Box</label>
              <input value={form.box||''} onChange={e=>set('box',e.target.value)} className="field-input" placeholder="B2"/></div>
            <div><label className="field-label">Total Vials Stored</label>
              <input type="number" value={form.total_vials||''} onChange={e=>set('total_vials',e.target.value)} className="field-input"/></div>
            <div><label className="field-label">Date Stored</label>
              <input type="date" value={form.date_stored||''} onChange={e=>set('date_stored',e.target.value)} className="field-input"/></div>
            <div className="col-span-2"><label className="field-label">Vial Codes (comma-separated)</label>
              <input value={form.vial_codes||''} onChange={e=>set('vial_codes',e.target.value)} className="field-input" placeholder="MCB-001-01, MCB-001-02, ..."/></div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`surface p-4 border-l-4 transition-all ${isDone ? 'border-l-emerald-500' : editing ? 'border-l-navy' : 'border-l-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {isDone
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0"/>
            : <Circle className="w-5 h-5 text-gray-300 shrink-0"/>
          }
          <div>
            <p className="text-sm font-black text-gray-900">{step.label}</p>
            <p className="text-xs text-gray-500">{step.desc}</p>
          </div>
        </div>
        {isAdmin && !editing && (
          <button onClick={() => { setForm({ ...(data || {}), _prepId: form._prepId }); setEditing(true); }}
            className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-navy px-2 py-1 rounded-lg hover:bg-gray-50">
            <Edit2 className="w-3.5 h-3.5"/> {isDone ? 'Edit' : 'Enter Data'}
          </button>
        )}
      </div>

      {isDone && !editing && (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(data).filter(([k]) => !['completed','_prepId'].includes(k)).map(([k, v]) => (
            v ? (
              <div key={k} className="p-2 bg-gray-50 rounded-lg">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-0.5">{k.replace(/_/g,' ')}</p>
                <p className="text-xs font-bold text-gray-800 truncate">{String(v)}</p>
              </div>
            ) : null
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-3">
          {renderFields()}
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              <Save className="w-3.5 h-3.5"/> {saving ? 'Saving...' : 'Mark as Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CellBankDetailPage() {
  const { prepId } = useParams();
  const { role }   = useAuth();
  const toast      = useToast();
  const [prep, setPrep]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const fetchPrep = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/research/cell-bank/${prepId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setPrep(json.data);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [prepId, toast]);

  useEffect(() => { fetchPrep(); }, [fetchPrep]);

  const handleStepSaved = async (updatedPrep) => {
    // refresh full data to get incubation links
    fetchPrep();
  };

  const handleMarkCompleted = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/research/cell-bank/${prepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed', vial_count: prep.step_data?.vial_storage?.total_vials || prep.vial_count }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Cell Bank preparation marked as Completed.');
      fetchPrep();
    } catch (err) { toast.error(err.message); }
    finally { setCompleting(false); }
  };

  const completedSteps = prep ? STEPS.filter(s => prep.step_data?.[s.key]?.completed).length : 0;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/research/cell-bank" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronLeft className="w-4 h-4"/>
        </Link>
        <div className="flex-1 min-w-0">
          {loading ? <Skeleton className="h-6 w-48 rounded-lg"/> : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black text-gray-900">{prep?.prep_code}</h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${prep?.type === 'MCB' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{prep?.type}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[prep?.status] || 'bg-gray-100 text-gray-600'}`}>{prep?.status}</span>
              </div>
              <p className="text-xs text-gray-500">{prep?.cell_bank_strains?.name} · {prep?.cell_bank_strains?.source_type} {prep?.cell_bank_strains?.accession_number}</p>
            </>
          )}
        </div>
      </div>

      {!loading && prep && (
        <>
          {/* Progress bar */}
          <div className="surface p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-700">Progress</p>
              <p className="text-xs font-bold text-gray-500">{completedSteps}/{STEPS.length} steps done</p>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(completedSteps / STEPS.length) * 100}%` }}/>
            </div>
            <div className="flex justify-between mt-1">
              {STEPS.map((s, i) => (
                <div key={s.key} className={`w-2 h-2 rounded-full ${prep.step_data?.[s.key]?.completed ? 'bg-emerald-500' : 'bg-gray-200'}`} title={s.label}/>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map(step => (
              <StepCard
                key={step.key}
                step={step}
                data={prep.step_data?.[step.key] ? { ...prep.step_data[step.key], _prepId: prepId } : { _prepId: prepId }}
                incubations={prep.incubations || []}
                onSave={handleStepSaved}
                isAdmin={isAdmin}
              />
            ))}
          </div>

          {/* Vials */}
          {prep.cell_bank_vials?.length > 0 && (
            <div className="surface p-4 space-y-3">
              <p className="text-sm font-black text-gray-900 flex items-center gap-2"><Package className="w-4 h-4"/> Registered Vials ({prep.cell_bank_vials.length})</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {prep.cell_bank_vials.map(v => (
                  <div key={v.id} className={`p-3 rounded-xl border text-xs ${v.status === 'Available' ? 'bg-emerald-50 border-emerald-200' : v.status === 'Used' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="font-black text-gray-900">{v.vial_code}</p>
                    <p className="text-gray-500">{v.storage_temp} · {v.freezer_id}</p>
                    <p className="text-gray-500">Rack {v.rack} / Box {v.box}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${v.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{v.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mark complete */}
          {isAdmin && prep.status === 'In Progress' && completedSteps === STEPS.length && (
            <button onClick={handleMarkCompleted} disabled={completing}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-50">
              {completing ? 'Completing...' : '✓ Mark Preparation as Completed'}
            </button>
          )}

          {prep.completed_at && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1"/>
              <p className="text-sm font-black text-emerald-800">Preparation Completed</p>
              <p className="text-xs text-emerald-600">{new Date(prep.completed_at).toLocaleString('en-IN')}</p>
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="space-y-3">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl"/>)}</div>
      )}
    </div>
  );
}
