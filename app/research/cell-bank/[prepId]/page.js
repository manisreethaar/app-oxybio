'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import {
  ChevronLeft, CheckCircle2, Circle, FlaskConical, Microscope,
  Thermometer, Droplets, Snowflake, Save, Plus, Clock, ChevronDown, ChevronUp,
  ExternalLink, Package
} from 'lucide-react';
import Skeleton from '@/components/Skeleton';

const STEPS = [
  { key: 'strain_source',   label: 'Strain Source',      icon: Microscope,   desc: 'Confirm strain identity and source documentation' },
  { key: 'broth_culture_1', label: 'Broth Culture #1',   icon: FlaskConical, desc: 'Sub-culture in broth — check OD at 600nm' },
  { key: 'plating',         label: 'Plate on Agar',      icon: Droplets,     desc: 'Plate on selective agar + incubation' },
  { key: 'colony_pick',     label: 'Colony Pick',        icon: Microscope,   desc: 'Pick single colony from agar plate' },
  { key: 'broth_culture_2', label: 'Broth Culture #2',   icon: FlaskConical, desc: 'Sub-culture picked colony — verify target OD' },
  { key: 'glycerol_stock',  label: 'Glycerol Stock',     icon: Thermometer,  desc: 'Prepare glycerol stock (15–20% v/v glycerol)' },
  { key: 'vial_storage',    label: 'Vial Registration',  icon: Snowflake,    desc: 'Log vials — freeze at −20°C or −80°C' },
];

const STATUS_COLOR = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'Discarded':   'bg-red-100 text-red-600',
};

const ACTION_COLOR = {
  registered:    'bg-emerald-100 text-emerald-700',
  thawed:        'bg-blue-100 text-blue-700',
  used_in_batch: 'bg-amber-100 text-amber-700',
  returned:      'bg-teal-100 text-teal-700',
  discarded:     'bg-red-100 text-red-600',
};

// ── Vial Row with movement log ─────────────────────────────────────────────
function VialRow({ vial, isAdmin, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs]         = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [acting, setActing]     = useState(false);
  const toast = useToast();

  const loadLogs = async () => {
    if (logs) { setExpanded(v => !v); return; }
    setLoadingLogs(true);
    setExpanded(true);
    const res = await fetch(`/api/research/cell-bank/vials/${vial.id}`);
    const json = await res.json();
    if (json.success) setLogs(json.data.logs || []);
    setLoadingLogs(false);
  };

  const handleAction = async (action) => {
    if (!confirm(`${action === 'discard' ? 'Discard' : action === 'thaw' ? 'Log thaw for' : 'Mark as used'} vial ${vial.vial_code}?`)) return;
    setActing(true);
    const res = await fetch(`/api/research/cell-bank/vials/${vial.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (json.success) { toast.success(`Vial ${vial.vial_code} updated.`); setLogs(null); onAction(); }
    else toast.error(json.error);
    setActing(false);
  };

  const statusBg = vial.status === 'Available' ? 'bg-emerald-50 border-emerald-200' : vial.status === 'Used' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200';

  return (
    <div className={`rounded-xl border text-xs ${statusBg} overflow-hidden`}>
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 font-mono">{vial.vial_code}</p>
          <p className="text-gray-500 mt-0.5">{vial.storage_temp} · {[vial.freezer_id, vial.rack && `Rack ${vial.rack}`, vial.box && `Box ${vial.box}`].filter(Boolean).join(' / ') || 'No location'}</p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${vial.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : vial.status === 'Used' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>
            {vial.status}
          </span>
          {vial.used_in_batch_id && <p className="text-[10px] text-amber-700 font-semibold mt-0.5">Used in batch</p>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isAdmin && vial.status === 'Available' && (
            <div className="flex gap-1">
              <button onClick={() => handleAction('thaw')} disabled={acting} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold hover:bg-blue-200 disabled:opacity-50">Thaw</button>
              <button onClick={() => handleAction('discard')} disabled={acting} className="px-2 py-1 bg-red-100 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-200 disabled:opacity-50">Discard</button>
            </div>
          )}
          <button onClick={loadLogs} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 font-semibold">
            {expanded ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>} Log
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-dashed px-3 py-2 bg-white/60 space-y-1">
          {loadingLogs ? <p className="text-[10px] text-gray-400">Loading...</p> :
           !logs?.length ? <p className="text-[10px] text-gray-400">No log entries.</p> :
           logs.map(l => (
            <div key={l.id} className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${ACTION_COLOR[l.action] || 'bg-gray-100 text-gray-500'}`}>{l.action.replace(/_/g,' ')}</span>
              {l.batches?.batch_id && <Link href={`/batches/${l.batch_id}`} className="text-[10px] text-navy font-semibold hover:underline flex items-center gap-0.5">{l.batches.batch_id}<ExternalLink className="w-2.5 h-2.5"/></Link>}
              <span className="text-[10px] text-gray-400 ml-auto">{new Date(l.created_at).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vial Registration panel ────────────────────────────────────────────────
function VialRegistrationPanel({ prepId, prep, onRegistered }) {
  const toast = useToast();
  const [count,       setCount]       = useState('');
  const [storageTemp, setStorageTemp] = useState('-20°C');
  const [freezerId,   setFreezerId]   = useState('');
  const [rack,        setRack]        = useState('');
  const [box,         setBox]         = useState('');
  const [registering, setRegistering] = useState(false);

  // Preview the code pattern
  const year  = String(new Date().getFullYear()).slice(-2);
  const short = (prep?.cell_bank_strains?.strain_short_code || 'XX').toUpperCase();
  const baseCode = `${prep?.type}-${year}-${short}`;

  const handleRegister = async () => {
    if (!count || parseInt(count) < 1) { toast.warn('Enter number of vials.'); return; }
    setRegistering(true);
    const res = await fetch(`/api/research/cell-bank/${prepId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register_vials', count: parseInt(count), storage_temp: storageTemp, freezer_id: freezerId || null, rack: rack || null, box: box || null }),
    });
    const json = await res.json();
    if (json.success) { toast.success(`${count} vials registered.`); onRegistered(); }
    else toast.error(json.error);
    setRegistering(false);
  };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs">
        <p className="font-black text-indigo-800">Vial Code Preview</p>
        <p className="font-mono text-indigo-700 mt-0.5">{baseCode}-001, {baseCode}-002, …</p>
        {!prep?.cell_bank_strains?.strain_short_code && (
          <p className="text-amber-700 font-semibold mt-1">⚠ Strain short code not set — codes will use XX. Edit the strain record to set it.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="field-label">Number of Vials to Register <span className="text-red-500">*</span></label>
          <input type="number" min="1" max="200" value={count} onChange={e => setCount(e.target.value)} className="field-input" placeholder="e.g. 10"/>
        </div>
        <div>
          <label className="field-label">Storage Temp</label>
          <select value={storageTemp} onChange={e => setStorageTemp(e.target.value)} className="field-input bg-white">
            <option value="-20°C">−20°C</option>
            <option value="-80°C">−80°C</option>
          </select>
        </div>
        <div>
          <label className="field-label">Freezer ID</label>
          <input value={freezerId} onChange={e => setFreezerId(e.target.value)} className="field-input" placeholder="ULT-01"/>
        </div>
        <div>
          <label className="field-label">Rack</label>
          <input value={rack} onChange={e => setRack(e.target.value)} className="field-input" placeholder="R3"/>
        </div>
        <div>
          <label className="field-label">Box</label>
          <input value={box} onChange={e => setBox(e.target.value)} className="field-input" placeholder="B2"/>
        </div>
      </div>
      <button onClick={handleRegister} disabled={registering || !count}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-sm disabled:opacity-50">
        {registering ? 'Registering...' : `Generate & Register ${count || 'N'} Vials`}
      </button>
    </div>
  );
}

// ── Step Card ──────────────────────────────────────────────────────────────
function StepCard({ step, data, incubations, prepId, onSave, isAdmin }) {
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
      const res = await fetch(`/api/research/cell-bank/${prepId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: step.key, step_data_patch: { ...form, completed: true } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`${step.label} saved.`);
      onSave();
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
              <input value={form.culture_condition||''} onChange={e=>set('culture_condition',e.target.value)} className="field-input" placeholder="MRS broth 37°C"/></div>
            <div><label className="field-label">Date Revived</label>
              <input type="date" value={form.date_revived||''} onChange={e=>set('date_revived',e.target.value)} className="field-input"/></div>
            <div className="col-span-2"><label className="field-label">Observations / Morphology</label>
              <textarea rows={2} value={form.observations||''} onChange={e=>set('observations',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
          </div>
        );

      case 'broth_culture_1':
      case 'broth_culture_2':
        return (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Media Preparation</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Broth / Media</label>
                <input value={form.media||''} onChange={e=>set('media',e.target.value)} className="field-input" placeholder="MRS broth"/></div>
              <div><label className="field-label">Volume (ml)</label>
                <input type="number" value={form.volume_ml||''} onChange={e=>set('volume_ml',e.target.value)} className="field-input" placeholder="10"/></div>
              <div><label className="field-label">Sterilization Method</label>
                <select value={form.sterilization_method||''} onChange={e=>set('sterilization_method',e.target.value)} className="field-input bg-white">
                  <option value="">Select...</option>
                  <option value="Autoclave">Autoclave</option>
                  <option value="Filter (0.22µm)">Filter (0.22µm)</option>
                  <option value="Filter (0.45µm)">Filter (0.45µm)</option>
                  <option value="Not required">Not required</option>
                </select></div>
              <div><label className="field-label">Sterilization Temp (°C)</label>
                <input type="number" value={form.sterilization_temp||''} onChange={e=>set('sterilization_temp',e.target.value)} className="field-input" placeholder="121"/></div>
              <div><label className="field-label">Sterilization Time (min)</label>
                <input type="number" value={form.sterilization_min||''} onChange={e=>set('sterilization_min',e.target.value)} className="field-input" placeholder="15"/></div>
              <div><label className="field-label">pH After Prep</label>
                <input type="number" step="0.01" value={form.media_ph_after||''} onChange={e=>set('media_ph_after',e.target.value)} className="field-input" placeholder="6.5"/></div>
              <div className="col-span-2"><label className="field-label">Media Lot / Batch Notes</label>
                <input value={form.media_lot_notes||''} onChange={e=>set('media_lot_notes',e.target.value)} className="field-input" placeholder="MRS powder lot #XYZ, expiry MM/YYYY"/></div>
            </div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider pt-1">Incubation & OD Check</p>
            <div className="grid grid-cols-2 gap-3">
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
                  <option value="no">No — repeat required</option>
                </select></div>
              <div className="col-span-2"><label className="field-label">Notes</label>
                <textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
            </div>
          </div>
        );

      case 'plating':
        return (
          <div className="space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Agar Preparation</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Agar Media</label>
                <input value={form.agar_media||''} onChange={e=>set('agar_media',e.target.value)} className="field-input" placeholder="MRS agar / LB agar"/></div>
              <div><label className="field-label">Plates Poured</label>
                <input type="number" value={form.plates_poured||''} onChange={e=>set('plates_poured',e.target.value)} className="field-input" placeholder="5"/></div>
              <div><label className="field-label">Sterilization Method</label>
                <select value={form.agar_sterilization_method||''} onChange={e=>set('agar_sterilization_method',e.target.value)} className="field-input bg-white">
                  <option value="">Select...</option>
                  <option value="Autoclave">Autoclave</option>
                  <option value="Pre-made (commercial)">Pre-made (commercial)</option>
                </select></div>
              <div><label className="field-label">Agar Batch / Lot Notes</label>
                <input value={form.agar_batch_notes||''} onChange={e=>set('agar_batch_notes',e.target.value)} className="field-input" placeholder="Lot #, expiry..."/></div>
            </div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider pt-1">Plating & Incubation</p>
            <div className="grid grid-cols-2 gap-3">
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
            <div><label className="field-label">OD at Harvest</label>
              <input type="number" step="0.01" value={form.od_at_harvest||''} onChange={e=>set('od_at_harvest',e.target.value)} className="field-input" placeholder="OD 600nm"/></div>
            <div><label className="field-label">Prep Date</label>
              <input type="date" value={form.prep_date||''} onChange={e=>set('prep_date',e.target.value)} className="field-input"/></div>
            <div className="col-span-2"><label className="field-label">Notes</label>
              <textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold outline-none resize-none"/></div>
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
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-navy px-2 py-1 rounded-lg hover:bg-gray-50">
            <Save className="w-3.5 h-3.5"/> {isDone ? 'Edit' : 'Enter Data'}
          </button>
        )}
      </div>

      {isDone && !editing && (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(data).filter(([k]) => !['completed'].includes(k) && data[k]).map(([k, v]) => (
            <div key={k} className="p-2 bg-gray-50 rounded-lg">
              <p className="text-[9px] font-black text-gray-400 uppercase mb-0.5">{k.replace(/_/g,' ')}</p>
              <p className="text-xs font-bold text-gray-800 truncate">{String(v)}</p>
            </div>
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
              <CheckCircle2 className="w-3.5 h-3.5"/> {saving ? 'Saving...' : 'Mark as Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function CellBankDetailPage() {
  const { prepId } = useParams();
  const { role }   = useAuth();
  const toast      = useToast();
  const [prep, setPrep]       = useState(null);
  const [vials, setVials]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const fetchPrep = useCallback(async () => {
    setLoading(true);
    try {
      const [prepRes, vialsRes] = await Promise.all([
        fetch(`/api/research/cell-bank/${prepId}`),
        fetch(`/api/research/cell-bank/vials?preparation_id=${prepId}`),
      ]);
      const [prepJson, vialsJson] = await Promise.all([prepRes.json(), vialsRes.json()]);
      if (!prepJson.success) throw new Error(prepJson.error);
      setPrep(prepJson.data);
      if (vialsJson.success) setVials(vialsJson.data || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [prepId, toast]);

  useEffect(() => { fetchPrep(); }, [fetchPrep]);

  const handleMarkCompleted = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/research/cell-bank/${prepId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed', vial_count: vials.length }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Preparation marked as Completed.');
      fetchPrep();
    } catch (err) { toast.error(err.message); }
    finally { setCompleting(false); }
  };

  const completedSteps = prep ? STEPS.filter(s => prep.step_data?.[s.key]?.completed).length : 0;
  const nonVialSteps   = STEPS.filter(s => s.key !== 'vial_storage');

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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${prep?.type === 'MCB' ? 'bg-emerald-100 text-emerald-700' : prep?.type === 'RCB' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{prep?.type}</span>
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
          </div>

          {/* Steps (all except vial_storage) */}
          <div className="space-y-3">
            {nonVialSteps.map(step => (
              <StepCard
                key={step.key}
                step={step}
                data={prep.step_data?.[step.key] ? { ...prep.step_data[step.key] } : null}
                incubations={prep.incubations || []}
                prepId={prepId}
                onSave={fetchPrep}
                isAdmin={isAdmin}
              />
            ))}
          </div>

          {/* Vial Registration — dedicated section */}
          <div className="surface p-5 space-y-4 border-l-4 border-l-indigo-400">
            <div className="flex items-center gap-3">
              <Snowflake className="w-5 h-5 text-indigo-600"/>
              <div>
                <p className="text-sm font-black text-gray-900">Vial Registration & Storage</p>
                <p className="text-xs text-gray-500">Register cryovials, assign codes, and track movement.</p>
              </div>
            </div>

            {vials.length === 0 ? (
              isAdmin ? (
                <VialRegistrationPanel prepId={prepId} prep={prep} onRegistered={fetchPrep}/>
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">No vials registered yet.</p>
              )
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-700">{vials.length} vials registered</p>
                  {isAdmin && (
                    <button onClick={() => {}} className="text-[10px] text-navy font-bold hover:underline">+ Register more</button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {vials.map(v => (
                    <VialRow key={v.id} vial={v} isAdmin={isAdmin} onAction={fetchPrep}/>
                  ))}
                </div>
                {isAdmin && (
                  <VialRegistrationPanel prepId={prepId} prep={prep} onRegistered={fetchPrep}/>
                )}
              </>
            )}
          </div>

          {/* Mark complete */}
          {isAdmin && prep.status === 'In Progress' && completedSteps >= nonVialSteps.length && vials.length > 0 && (
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
