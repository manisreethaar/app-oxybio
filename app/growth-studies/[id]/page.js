'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/utils/supabase/client';
import {
  Clock, AlertCircle, Play, Square, BarChart2,
  FlaskConical, Microscope, X, FileText, Loader2,
  Package, TestTube2, Pencil, Trash2, Info
} from 'lucide-react';
import EditRequestButton from '@/components/ui/EditRequestButton';
import CreatorBadge from '@/components/ui/CreatorBadge';

const GrowthCurveChart = dynamic(() => import('@/components/charts/GrowthCurveChart'), { ssr: false });

const VESSEL_TYPES = ['test_tube','flask_50ml','flask_125ml','flask_250ml','flask_500ml','flask_1000ml','bioreactor_1L','bioreactor_5L','bioreactor_10L'];
const TURBIDITY_OPTIONS = ['clear', 'slightly_turbid', 'turbid', 'very_turbid'];
const PLATE_MEDIA_OPTIONS = ['TSA', 'LB Agar', 'MRS Agar', 'PDA', 'Nutrient Agar', 'R2A', 'Other'];
const DILUTION_OPTIONS = ['undiluted', '10⁻¹', '10⁻²', '10⁻³', '10⁻⁴', '10⁻⁵', '10⁻⁶'];

// Convert an ISO string → value suitable for <input type="datetime-local">
function toDatetimeLocal(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Get a datetime-local string for "right now" (local time)
function nowDatetimeLocal() {
  return toDatetimeLocal(new Date().toISOString());
}

function elapsedHours(inocTime) {
  if (!inocTime) return 0;
  return (Date.now() - new Date(inocTime).getTime()) / 3600000;
}

function StatusBadge({ status }) {
  const map = {
    setup: 'bg-slate-100 text-slate-600 border-slate-200',
    active: 'bg-teal-50 text-teal-700 border-teal-200',
    completed: 'bg-blue-50 text-blue-700 border-blue-200',
    analysed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${map[status] || map.setup}`}>{status}</span>;
}

export default function GrowthStudyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { role, employeeProfile } = useAuth();
  const [pendingIds, setPendingIds] = useState(new Set());

  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);
  const canEdit = ['admin', 'ceo', 'cto', 'research_fellow', 'scientist'].includes(role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Edit modal
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [editMeta, setEditMeta] = useState({ strains: [], preps: [], formulations: [], vials: [] });
  const [editMetaLoading, setEditMetaLoading] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  // Modal state
  const [modal, setModal] = useState(null); // null | { type: 'measurement' | 'plate' | 'combined', tp }
  const [modalTab, setModalTab] = useState('measurement'); // 'measurement' | 'plate'
  const [mForm, setMForm] = useState({});
  const [pForm, setPForm] = useState({});
  const [modalErr, setModalErr] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Chart config
  const [showLines, setShowLines] = useState(['od', 'ph']);
  const [logScale, setLogScale] = useState(false);

  // Start Study confirmation modal
  const [startModal, setStartModal] = useState(false);
  const [startInfo, setStartInfo] = useState(null);
  const [startInfoLoading, setStartInfoLoading] = useState(false);
  const [lotSelections, setLotSelections] = useState({});
  const [startErr, setStartErr] = useState('');
  const [actualInocTime, setActualInocTime] = useState('');

  const load = useCallback(() => {
    fetch(`/api/growth-studies/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const fetchPendingIds = async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  };

  useEffect(() => { load(); fetchPendingIds(); }, [load]);

  useEffect(() => {
    if (!data?.study?.inoculation_time) return;
    const itv = setInterval(() => setElapsed(elapsedHours(data.study.inoculation_time)), 60000);
    setElapsed(elapsedHours(data.study.inoculation_time));
    return () => clearInterval(itv);
  }, [data?.study?.inoculation_time]);

  const handleStatusChange = async (newStatus) => {
    setActionLoading(true);
    await fetch(`/api/growth-studies/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setActionLoading(false);
    load();
  };

  const openStartModal = async () => {
    setStartModal(true);
    setStartInfo(null);
    setLotSelections({});
    setStartErr('');
    setActualInocTime(nowDatetimeLocal()); // default to now, user can correct
    setStartInfoLoading(true);
    const res = await fetch(`/api/growth-studies/${id}/start-info`);
    const json = await res.json();
    setStartInfoLoading(false);
    if (!res.ok) { setStartErr(json.error); return; }
    setStartInfo(json);
    // Default lot selection to first available lot per ingredient
    const defaults = {};
    (json.ingredients || []).forEach((ing, i) => {
      if (ing.available_lots?.[0]) defaults[i] = { stock_id: ing.available_lots[0].id, quantity_used: ing.quantity_needed, item_name: ing.name };
    });
    setLotSelections(defaults);
  };

  const confirmStart = async () => {
    setActionLoading(true);
    setStartErr('');
    const selections = Object.values(lotSelections).filter(s => s.stock_id && s.quantity_used > 0);
    // Convert local datetime-input value to ISO; fall back to now if blank
    const inocISO = actualInocTime
      ? new Date(actualInocTime).toISOString()
      : new Date().toISOString();
    const res = await fetch(`/api/growth-studies/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', lot_selections: selections, inoculation_time: inocISO }),
    });
    const json = await res.json();
    setActionLoading(false);
    if (!res.ok) { setStartErr(json.error); return; }
    setStartModal(false);
    load();
  };

  const openEditModal = async (study) => {
    const src = study.cell_bank_strain_id ? 'strain' : (study.cell_bank_preparation_id ? 'prep' : 'strain');
    setEditForm({
      name: study.name || '',
      study_type: study.study_type || 'growth_curve',
      objective: study.objective || '',
      notes: study.notes || '',
      isolate_source: src,
      cell_bank_strain_id: study.cell_bank_strain_id || '',
      cell_bank_preparation_id: study.cell_bank_preparation_id || '',
      vial_id: study.vial_id || '',
      formulation_id: study.formulation_id || '',
      media_name: study.media_name || '',
      vessel_type: study.vessel_type || '',
      volume_ml: study.volume_ml ?? '',
      temperature_c: study.temperature_c ?? '',
      agitation_rpm: study.agitation_rpm ?? '',
      inoculum_percentage: study.inoculum_percentage ?? '',
      inoculum_volume_ml: study.inoculum_volume_ml ?? '',
      od_wavelength: study.od_wavelength ?? 600,
      expected_duration_hours: study.expected_duration_hours ?? '',
    });
    setEditErr('');
    setEditModal(true);
    setEditMetaLoading(true);
    const sb = createClient();
    const [strRes, prRes, fmRes] = await Promise.all([
      sb.from('cell_bank_strains').select('id, name, accession_number').order('name'),
      sb.from('cell_bank_preparations').select('id, prep_code, type, passage_number').order('created_at', { ascending: false }),
      sb.from('formulations').select('id, name, code').eq('status', 'Approved').order('name'),
    ]);
    let vials = [];
    if (study.cell_bank_preparation_id) {
      const { data: v } = await sb
        .from('cell_bank_vials')
        .select('id, vial_code, storage_temp, freezer_id, rack, position, status')
        .eq('preparation_id', study.cell_bank_preparation_id)
        .in('status', ['Available', 'Used'])
        .order('vial_code');
      vials = v || [];
    }
    setEditMeta({ strains: strRes.data || [], preps: prRes.data || [], formulations: fmRes.data || [], vials });
    setEditMetaLoading(false);
  };

  const loadEditVials = async (prepId) => {
    if (!prepId) { setEditMeta(m => ({ ...m, vials: [] })); return; }
    const sb = createClient();
    const { data } = await sb
      .from('cell_bank_vials')
      .select('id, vial_code, storage_temp, freezer_id, rack, position, status')
      .eq('preparation_id', prepId)
      .in('status', ['Available', 'Used'])
      .order('vial_code');
    setEditMeta(m => ({ ...m, vials: data || [] }));
  };

  const saveEdit = async () => {
    setEditSaving(true);
    setEditErr('');
    const f = editForm;
    const payload = {
      name: f.name || null,
      study_type: f.study_type || null,
      objective: f.objective || null,
      notes: f.notes || null,
      cell_bank_strain_id: f.isolate_source === 'strain' && f.cell_bank_strain_id ? f.cell_bank_strain_id : null,
      cell_bank_preparation_id: f.isolate_source === 'prep' && f.cell_bank_preparation_id ? f.cell_bank_preparation_id : null,
      vial_id: f.isolate_source === 'prep' && f.vial_id ? f.vial_id : null,
      formulation_id: f.formulation_id || null,
      media_name: !f.formulation_id ? (f.media_name || null) : null,
      vessel_type: f.vessel_type || null,
      volume_ml: f.volume_ml !== '' ? parseFloat(f.volume_ml) : null,
      temperature_c: f.temperature_c !== '' ? parseFloat(f.temperature_c) : null,
      agitation_rpm: f.agitation_rpm !== '' ? parseFloat(f.agitation_rpm) : null,
      inoculum_percentage: f.inoculum_percentage !== '' ? parseFloat(f.inoculum_percentage) : null,
      inoculum_volume_ml: f.inoculum_volume_ml !== '' ? parseFloat(f.inoculum_volume_ml) : null,
      od_wavelength: f.od_wavelength ? parseInt(f.od_wavelength) : 600,
      expected_duration_hours: f.expected_duration_hours !== '' ? parseInt(f.expected_duration_hours) : null,
    };
    const res = await fetch(`/api/growth-studies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setEditSaving(false);
    if (!res.ok) { setEditErr(json.error); return; }
    setEditModal(false);
    load();
  };

  const deleteStudy = async () => {
    setDeleteLoading(true);
    setDeleteErr('');
    const res = await fetch(`/api/growth-studies/${id}`, { method: 'DELETE' });
    const json = await res.json();
    setDeleteLoading(false);
    if (!res.ok) { setDeleteErr(json.error); return; }
    router.push('/growth-studies');
  };

  const openMeasurementModal = (tp) => {
    setMForm({ actual_hour: tp ? tp.planned_hour : parseFloat(elapsed.toFixed(2)), time_point_id: tp?.id || '' });
    setPForm({ time_point_hours: tp ? tp.planned_hour : parseFloat(elapsed.toFixed(2)), time_point_id: tp?.id || '', observation_type: 'colony_count', result: 'pending', incubation_temp_c: data?.study?.temperature_c || '', plate_count: 1 });
    setModal({ type: 'combined', tp });
    setModalTab('measurement');
    setModalErr('');
  };

  const openPlateModal = (tp) => {
    setMForm({ actual_hour: tp ? tp.planned_hour : parseFloat(elapsed.toFixed(2)), time_point_id: tp?.id || '' });
    setPForm({ time_point_hours: tp ? tp.planned_hour : parseFloat(elapsed.toFixed(2)), time_point_id: tp?.id || '', observation_type: 'colony_count', result: 'pending', incubation_temp_c: data?.study?.temperature_c || '', plate_count: 1 });
    setModal({ type: 'combined', tp });
    setModalTab('plate');
    setModalErr('');
  };

  const saveMeasurement = async () => {
    setModalSaving(true);
    setModalErr('');
    const payload = { ...mForm };
    Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);
    const res = await fetch(`/api/growth-studies/${id}/measurements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setModalSaving(false);
    if (!res.ok) { setModalErr(json.error); return; }
    setModal(null);
    load();
  };

  const savePlate = async () => {
    setModalSaving(true);
    setModalErr('');
    const payload = { ...pForm };
    Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k]);
    const res = await fetch(`/api/growth-studies/${id}/plate-obs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setModalSaving(false);
    if (!res.ok) { setModalErr(json.error); return; }
    setModal(null);
    load();
  };

  const InputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';
  const LabelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1';

  if (loading) return <div className="p-8 text-center text-slate-500">Loading study…</div>;
  if (!data?.study) return <div className="p-8 text-center text-red-500">Study not found.</div>;

  const { study, time_points, measurements, plate_observations, inventory_usage } = data;
  const isFermentation = study.study_type === 'fermentation';
  const isActive = study.status === 'active';

  const isolateName = study.cell_bank_strains?.name || study.cell_bank_preparations?.prep_code || '—';
  const mediaName = study.formulations?.name || study.media_name || '—';

  const tpDone = time_points.filter(t => t.status === 'completed').length;
  const tpPending = time_points.filter(t => t.status === 'pending').sort((a, b) => a.planned_hour - b.planned_hour);
  const nextTp = tpPending.find(tp => tp.planned_hour >= elapsed) || tpPending[0];
  const overdueTps = isActive ? tpPending.filter(tp => tp.planned_hour < elapsed - 0.25) : [];

  const availableLines = [
    { key: 'od', label: `OD${study.od_wavelength || 600}` },
    { key: 'ph', label: 'pH' },
    { key: 'glucose', label: 'Glucose' },
    { key: 'protein', label: 'Protein' },
    ...(isFermentation ? [{ key: 'do2', label: 'DO%' }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge status={study.status} />
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${isFermentation ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
              {isFermentation ? 'Fermentation' : 'Growth Curve'}
            </span>
            {study.study_code && (
              <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 font-mono">
                {study.study_code}
              </span>
            )}
            {isActive && (
              <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-full border border-teal-100">
                T + {elapsed.toFixed(1)}h elapsed
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black text-slate-800">{study.name}</h1>
          <p className="text-slate-500 mt-1 font-medium">{isolateName} · {mediaName}</p>
          {study.objective && <p className="text-sm text-slate-500 mt-1 italic max-w-xl">{study.objective}</p>}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {study.status === 'setup' && (
            <button onClick={openStartModal} disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-xl text-sm disabled:opacity-50"
            >
              <Play className="w-4 h-4" /> Start Study
            </button>
          )}
          {study.status === 'active' && (
            <button onClick={() => handleStatusChange('completed')} disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-black rounded-xl text-sm disabled:opacity-50"
            >
              <Square className="w-4 h-4" /> Mark Complete
            </button>
          )}
          {['completed', 'analysed'].includes(study.status) && (
            <Link href={`/growth-studies/${id}/report`}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-700 hover:bg-violet-800 text-white font-black rounded-xl text-sm"
            >
              <FileText className="w-4 h-4" /> View Report
            </Link>
          )}
          {isActive && (
            <button onClick={() => openMeasurementModal(nextTp)}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl text-sm"
            >
              <FlaskConical className="w-4 h-4" /> Record Sample
            </button>
          )}
          {canEdit && (
            <button onClick={() => openEditModal(study)}
              className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 hover:border-slate-400 text-slate-600 font-bold rounded-xl text-sm"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { setDeleteConfirm(true); setDeleteErr(''); }}
              className="flex items-center gap-2 px-3 py-2.5 bg-white border border-red-200 hover:border-red-400 text-red-500 font-bold rounded-xl text-sm"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Study Details card */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" /> Study Details
          </h3>
          {canEdit && (
            <button onClick={() => openEditModal(study)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-teal-700 border border-slate-200 hover:border-teal-400 rounded-xl transition-colors"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-xs">
          {[
            { label: 'Study Code',    value: study.study_code || '—', mono: true },
            { label: 'Type',          value: isFermentation ? 'Fermentation' : 'Growth Curve' },
            { label: 'Status',        value: study.status?.charAt(0).toUpperCase() + study.status?.slice(1) },
            { label: 'Isolate',       value: isolateName },
            { label: 'Media',         value: mediaName },
            { label: 'Vessel',        value: study.vessel_type?.replace(/_/g, ' ') || '—' },
            { label: 'Volume',        value: study.volume_ml ? `${study.volume_ml} mL` : '—' },
            { label: 'Temperature',   value: study.temperature_c ? `${study.temperature_c}°C` : '—' },
            { label: 'Agitation',     value: study.agitation_rpm ? `${study.agitation_rpm} rpm` : '—' },
            { label: 'Inoculum',      value: study.inoculum_percentage ? `${study.inoculum_percentage}%` : '—' },
            { label: `OD Wavelength`, value: study.od_wavelength ? `${study.od_wavelength} nm` : '—' },
            { label: 'Planned Duration', value: study.expected_duration_hours ? `${study.expected_duration_hours}h` : '—' },
            { label: 'Created By',    value: study.employees?.full_name || '—' },
            { label: 'Created',       value: study.created_at ? new Date(study.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
            ...(study.inoculation_time ? [{ label: 'Inoculated', value: new Date(study.inoculation_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }] : []),
            ...(study.completed_at ? [{ label: 'Completed', value: new Date(study.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }] : []),
          ].map(({ label, value, mono }) => (
            <div key={label}>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
              <p className={`font-bold text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
            </div>
          ))}
        </div>
        {study.objective && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Objective</p>
            <p className="text-xs font-medium text-slate-600 italic">{study.objective}</p>
          </div>
        )}
        {study.notes && (
          <div className="mt-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-xs font-medium text-slate-600">{study.notes}</p>
          </div>
        )}
      </div>

      {/* Overdue alerts */}
      {overdueTps.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-red-700 text-sm">Overdue Samples</p>
            <p className="text-xs text-red-600 mt-0.5">
              {overdueTps.map(t => `T+${t.planned_hour}h`).join(', ')} — please record now.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Timeline */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" /> Sampling Timeline
              <span className="ml-auto text-slate-400 font-bold text-xs">{tpDone}/{time_points.length}</span>
            </h3>
            <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full" style={{ width: `${time_points.length ? (tpDone / time_points.length) * 100 : 0}%` }} />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {time_points.map(tp => {
                const isDone = tp.status === 'completed';
                const isMissed = tp.status === 'missed';
                const isNext = nextTp?.id === tp.id;
                const isOverdue = isActive && tp.status === 'pending' && tp.planned_hour < elapsed - 0.25;

                return (
                  <div key={tp.id} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${isNext ? 'bg-teal-50 border border-teal-200' : isOverdue ? 'bg-red-50 border border-red-100' : 'bg-white/50 border border-white'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs ${isDone ? 'bg-teal-500' : isMissed ? 'bg-slate-300' : isOverdue ? 'bg-red-400' : isNext ? 'bg-teal-200' : 'bg-slate-100'}`}>
                      {isDone ? '✓' : isMissed ? '—' : tp.planned_hour}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-xs font-black ${isDone ? 'text-teal-700' : isMissed ? 'text-slate-400' : isOverdue ? 'text-red-700' : 'text-slate-700'}`}>
                          T + {tp.planned_hour}h
                        </p>
                        {/* 2A: Inline overdue badge */}
                        {isOverdue && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">OVERDUE</span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 font-medium truncate">
                        {tp.sample_types.map(t => t.replace(/_/g, ' ')).join(' · ')}
                      </p>
                    </div>
                    {isActive && !isDone && !isMissed && (
                      <button
                        onClick={() => {
                          if (tp.sample_types.includes('od_ph') || tp.sample_types.includes('biochemistry')) openMeasurementModal(tp);
                          else openPlateModal(tp);
                        }}
                        className="text-[10px] font-black text-teal-600 hover:text-teal-800 shrink-0"
                      >
                        Record
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Plate observations list */}
          {plate_observations.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Microscope className="w-4 h-4 text-violet-600" /> Plate Observations
              </h3>
              <div className="space-y-2">
                {plate_observations.map(obs => (
                  <div key={obs.id} className="bg-white/60 border border-white rounded-xl p-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black text-slate-700">T+{obs.time_point_hours}h — {obs.observation_type === 'sterility' ? 'Sterility' : 'Colony Count'}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${obs.result === 'sterile' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : obs.result === 'contaminated' ? 'bg-red-50 text-red-600 border-red-200' : obs.result === 'normal_growth' ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                        {obs.result || 'pending'}
                      </span>
                    </div>
                    {obs.plate_media && <p className="text-[10px] text-slate-400 mt-0.5">{obs.plate_media} {obs.dilution ? `· ${obs.dilution}` : ''}</p>}
                    {obs.colony_count !== null && obs.colony_count !== undefined && (
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">{obs.colony_count} CFU</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isActive && (
            <button onClick={() => openPlateModal(null)}
              className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-teal-400 text-slate-500 hover:text-teal-600 text-xs font-black rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              <Microscope className="w-3.5 h-3.5" /> Add Plate Observation
            </button>
          )}

          {/* Vial used */}
          {study.cell_bank_vials && (
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                <TestTube2 className="w-4 h-4 text-violet-600" /> Vial Used
              </h3>
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-1">
                <p className="text-sm font-black text-violet-800 font-mono">{study.cell_bank_vials.vial_code}</p>
                {study.cell_bank_vials.storage_temp && <p className="text-xs text-violet-600 font-medium">{study.cell_bank_vials.storage_temp}</p>}
                {study.cell_bank_vials.freezer_id && (
                  <p className="text-xs text-violet-500 font-medium">
                    {study.cell_bank_vials.freezer_id}{study.cell_bank_vials.rack ? ` · Rack ${study.cell_bank_vials.rack}` : ''}{study.cell_bank_vials.position ? ` · Pos ${study.cell_bank_vials.position}` : ''}
                  </p>
                )}
                <span className="inline-block text-[9px] font-black px-1.5 py-0.5 rounded border bg-rose-50 text-rose-600 border-rose-200">Used</span>
              </div>
            </div>
          )}

          {/* Inventory usage */}
          {inventory_usage?.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" /> Materials Used
              </h3>
              <div className="space-y-1.5">
                {inventory_usage.map(u => (
                  <div key={u.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <span className="font-bold text-slate-700">{u.inventory_stock?.inventory_items?.name || '—'}</span>
                    <span className="font-black text-amber-700">{u.quantity_used} {u.inventory_stock?.inventory_items?.unit || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Chart + Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chart */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-teal-600" /> Growth Curve
              </h3>
              <div className="flex gap-2 flex-wrap">
                {availableLines.map(l => (
                  <button key={l.key} onClick={() => setShowLines(prev => prev.includes(l.key) ? prev.filter(k => k !== l.key) : [...prev, l.key])}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${showLines.includes(l.key) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}
                  >{l.label}</button>
                ))}
                <button onClick={() => setLogScale(p => !p)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${logScale ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-200'}`}
                >log₁₀</button>
              </div>
            </div>
            <div style={{ height: 280 }}>
              <GrowthCurveChart data={measurements} wavelength={study.od_wavelength || 600} showLines={showLines} logScale={logScale} />
            </div>
          </div>

          {/* Measurements table */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-black text-slate-800 text-sm mb-4">Measurement Log</h3>
            {measurements.length === 0 ? (
              <p className="text-slate-400 text-sm font-medium text-center py-6">No measurements recorded yet.</p>
            ) : (
              <>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs font-medium">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Hour', `OD${study.od_wavelength || 600}`, 'pH', 'Temp (°C)', 'Glucose (g/L)', 'Protein (mg/mL)', ...(isFermentation ? ['DO%'] : []), 'Turbidity', 'Notes', ''].map(h => (
                        <th key={h} className="pb-2 pr-4 text-left font-black text-slate-400 uppercase tracking-wider text-[9px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map(m => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 pr-4 font-black text-teal-700">T+{m.actual_hour}h</td>
                        <td className="py-2 pr-4">{m.od_value ?? '—'}</td>
                        <td className="py-2 pr-4">{m.ph_value ?? '—'}</td>
                        <td className="py-2 pr-4">{m.temperature_actual_c ?? '—'}</td>
                        <td className="py-2 pr-4">{m.glucose_g_l ?? '—'}</td>
                        <td className="py-2 pr-4">{m.protein_mg_ml ?? '—'}</td>
                        {isFermentation && <td className="py-2 pr-4">{m.dissolved_oxygen_pct ?? '—'}</td>}
                        <td className="py-2 pr-4">{m.culture_turbidity ? m.culture_turbidity.replace(/_/g, ' ') : '—'}</td>
                        <td className="py-2 pr-4 max-w-[120px] truncate text-slate-400">{m.notes || '—'}</td>
                        <td className="py-2 pl-1 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {m.recorder && <CreatorBadge initials={m.recorder.initials} fullName={m.recorder.full_name} size="sm"/>}
                            {!isAdmin && m.recorded_by === employeeProfile?.id && (
                              <EditRequestButton
                                tableName="growth_measurements"
                                recordId={m.id}
                                moduleLabel="Growth Measurement"
                                fields={[
                                  { key: 'od_value', label: `OD${study.od_wavelength || 600}`, type: 'number' },
                                  { key: 'ph_value', label: 'pH', type: 'number' },
                                  { key: 'temperature_actual_c', label: 'Temp (°C)', type: 'number' },
                                  { key: 'actual_hour', label: 'Hour (T+)', type: 'number' },
                                  { key: 'notes', label: 'Notes', type: 'textarea' },
                                ]}
                                currentData={m}
                                hasPending={pendingIds.has(m.id)}
                                allowDelete
                                onSuccess={() => { load(); fetchPendingIds(); }}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile card list */}
              <div className="sm:hidden space-y-2">
                {measurements.map((m, i) => (
                  <div key={m.id || i} className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-500">T+{m.actual_hour}h</span>
                      <span className="text-[10px] text-slate-400">{m.logged_at ? new Date(m.logged_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[10px] text-slate-400 font-bold">OD</p><p className="text-sm font-bold text-slate-700">{m.od_value ?? '—'}</p></div>
                      <div><p className="text-[10px] text-slate-400 font-bold">pH</p><p className="text-sm font-bold text-slate-700">{m.ph_value ?? '—'}</p></div>
                      <div><p className="text-[10px] text-slate-400 font-bold">Temp</p><p className="text-sm font-bold text-slate-700">{m.temperature_actual_c ? `${m.temperature_actual_c}°C` : '—'}</p></div>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2A: Combined tabbed measurement+plate modal */}
      {modal?.type === 'combined' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[92vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">Record Sample Data</h3>
                {modal.tp && <p className="text-xs text-slate-500 mt-0.5">T+{modal.tp.planned_hour}h · {modal.tp.sample_types.join(', ')}</p>}
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            {/* Tab strip */}
            <div className="flex border-b border-slate-100">
              {[['measurement','Measurements'],['plate','Plate Obs']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setModalTab(key); setModalErr(''); }}
                  className={`flex-1 py-3 text-xs font-black transition-colors border-b-2 ${
                    modalTab === key ? 'border-teal-600 text-teal-700 bg-teal-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {/* Measurements tab */}
              {modalTab === 'measurement' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={LabelCls}>Actual Hour *</label>
                      <input className={InputCls} type="number" step="0.1" value={mForm.actual_hour || ''} onChange={e => setMForm(f => ({ ...f, actual_hour: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>OD@{study.od_wavelength || 600}nm</label>
                      <input className={InputCls} type="number" step="0.001" value={mForm.od_value || ''} onChange={e => setMForm(f => ({ ...f, od_value: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>pH</label>
                      <input className={InputCls} type="number" step="0.01" value={mForm.ph_value || ''} onChange={e => setMForm(f => ({ ...f, ph_value: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Temperature (°C)</label>
                      <input className={InputCls} type="number" step="0.1" value={mForm.temperature_actual_c || ''} onChange={e => setMForm(f => ({ ...f, temperature_actual_c: e.target.value }))} />
                    </div>
                  </div>
                  <details className="group">
                    <summary className="text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-teal-600 transition-colors list-none flex items-center gap-1">
                      <span className="group-open:hidden">▶</span><span className="hidden group-open:inline">▼</span> More fields
                    </summary>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={LabelCls}>Glucose (g/L) — DNS</label>
                        <input className={InputCls} type="number" step="0.001" value={mForm.glucose_g_l || ''} onChange={e => setMForm(f => ({ ...f, glucose_g_l: e.target.value }))} />
                      </div>
                      <div>
                        <label className={LabelCls}>Protein (mg/mL)</label>
                        <input className={InputCls} type="number" step="0.001" value={mForm.protein_mg_ml || ''} onChange={e => setMForm(f => ({ ...f, protein_mg_ml: e.target.value }))} />
                      </div>
                      {isFermentation && (
                        <div>
                          <label className={LabelCls}>Dissolved O₂ (%)</label>
                          <input className={InputCls} type="number" step="0.1" value={mForm.dissolved_oxygen_pct || ''} onChange={e => setMForm(f => ({ ...f, dissolved_oxygen_pct: e.target.value }))} />
                        </div>
                      )}
                      <div>
                        <label className={LabelCls}>Culture Turbidity</label>
                        <select className={InputCls} value={mForm.culture_turbidity || ''} onChange={e => setMForm(f => ({ ...f, culture_turbidity: e.target.value }))}>
                          <option value="">Select…</option>
                          {TURBIDITY_OPTIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={LabelCls}>Culture Color</label>
                        <input className={InputCls} type="text" placeholder="e.g. pale yellow" value={mForm.culture_color || ''} onChange={e => setMForm(f => ({ ...f, culture_color: e.target.value }))} />
                      </div>
                    </div>
                  </details>
                  <div>
                    <label className={LabelCls}>Notes</label>
                    <textarea className={InputCls} rows={2} value={mForm.notes || ''} onChange={e => setMForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* Plate Obs tab */}
              {modalTab === 'plate' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={LabelCls}>Time Point (hr) *</label>
                      <input className={InputCls} type="number" step="0.1" value={pForm.time_point_hours || ''} onChange={e => setPForm(f => ({ ...f, time_point_hours: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Observation Type</label>
                      <select className={InputCls} value={pForm.observation_type || ''} onChange={e => setPForm(f => ({ ...f, observation_type: e.target.value }))}>
                        <option value="colony_count">Colony Count</option>
                        <option value="sterility">Sterility</option>
                      </select>
                    </div>
                    <div>
                      <label className={LabelCls}>Plate Media</label>
                      <select className={InputCls} value={pForm.plate_media || ''} onChange={e => setPForm(f => ({ ...f, plate_media: e.target.value }))}>
                        <option value="">Select…</option>
                        {PLATE_MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LabelCls}>Dilution</label>
                      <select className={InputCls} value={pForm.dilution || ''} onChange={e => setPForm(f => ({ ...f, dilution: e.target.value }))}>
                        <option value="">Select…</option>
                        {DILUTION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LabelCls}>Result</label>
                      <select className={InputCls} value={pForm.result || ''} onChange={e => setPForm(f => ({ ...f, result: e.target.value }))}>
                        <option value="pending">Pending</option>
                        <option value="sterile">Sterile</option>
                        <option value="contaminated">Contaminated</option>
                        <option value="normal_growth">Normal Growth</option>
                        <option value="abnormal_growth">Abnormal Growth</option>
                      </select>
                    </div>
                    <div>
                      <label className={LabelCls}>Colony Count</label>
                      <input className={InputCls} type="number" value={pForm.colony_count || ''} onChange={e => setPForm(f => ({ ...f, colony_count: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Plate Count</label>
                      <input className={InputCls} type="number" min="1" value={pForm.plate_count || ''} onChange={e => setPForm(f => ({ ...f, plate_count: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Incubation Temp (°C)</label>
                      <input className={InputCls} type="number" step="0.1" value={pForm.incubation_temp_c || ''} onChange={e => setPForm(f => ({ ...f, incubation_temp_c: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className={LabelCls}>Notes</label>
                    <textarea className={InputCls} rows={2} value={pForm.notes || ''} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
              )}

              {modalErr && <p className="text-xs text-red-600 font-bold">{modalErr}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModal(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-50">Cancel</button>
                <button
                  onClick={() => modalTab === 'measurement' ? saveMeasurement() : savePlate()}
                  disabled={modalSaving || (modalTab === 'measurement' && !mForm.actual_hour) || (modalTab === 'plate' && !pForm.time_point_hours)}
                  className="flex-1 py-3 bg-teal-700 text-white font-black rounded-2xl text-sm hover:bg-teal-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {modalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legacy: keep individual modals for old type='measurement'|'plate' paths (safety fallback) */}
      {startModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="flex flex-col bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto h-[100dvh] sm:h-auto sm:max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">Confirm Study Start</h3>
                <p className="text-xs text-slate-500 mt-0.5">Review vial & materials before inoculation.</p>
              </div>
              <button onClick={() => setStartModal(false)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {startInfoLoading ? (
                <div className="flex items-center justify-center py-8 gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading study info…
                </div>
              ) : (
                <>
                  {/* Study identity */}
                  <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-teal-500 uppercase tracking-wider mb-1">Study</p>
                    <p className="font-black text-slate-800">{study.name}</p>
                    {study.study_code && <p className="text-xs font-mono text-slate-500 mt-0.5">{study.study_code}</p>}
                  </div>

                  {/* Vial section */}
                  {startInfo?.has_vial && startInfo?.vial ? (
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Vial to be used</p>
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center gap-3">
                        <TestTube2 className="w-4 h-4 text-violet-600 shrink-0" />
                        <div>
                          <p className="text-sm font-black text-violet-800 font-mono">{startInfo.vial.vial_code}</p>
                          <p className="text-xs text-violet-500">{startInfo.vial.storage_temp || ''}{startInfo.vial.freezer_id ? ` · ${startInfo.vial.freezer_id}` : ''}</p>
                        </div>
                        <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-200">→ Will be marked Used</span>
                      </div>
                    </div>
                  ) : startInfo?.has_vial && !startInfo?.vial ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-bold text-amber-700">
                      No vial linked to this study. Vial can only be selected during study creation.
                    </div>
                  ) : null}

                  {/* Ingredients / lot selection */}
                  {startInfo?.has_formulation && startInfo?.ingredients?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                        Media ingredients — scaled to {study.volume_ml} mL
                      </p>
                      <div className="space-y-3">
                        {startInfo.ingredients.map((ing, i) => (
                          <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-slate-700">{ing.name}</span>
                              <span className="text-xs font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {ing.quantity_needed} {ing.unit}
                              </span>
                            </div>
                            {ing.available_lots.length === 0 ? (
                              <p className="text-[10px] text-red-600 font-bold">No available lots — proceed without deduction or restock first.</p>
                            ) : (
                              <select
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white"
                                value={lotSelections[i]?.stock_id || ''}
                                onChange={e => {
                                  const lot = ing.available_lots.find(l => l.id === e.target.value);
                                  setLotSelections(prev => ({
                                    ...prev,
                                    [i]: lot ? { stock_id: lot.id, quantity_used: ing.quantity_needed, item_name: ing.name } : undefined,
                                  }));
                                }}
                              >
                                <option value="">Skip deduction</option>
                                {ing.available_lots.map(l => (
                                  <option key={l.id} value={l.id}>
                                    Lot {l.supplier_batch_number} · {l.current_quantity} {ing.unit} avail{l.expiry_date ? ` · Exp ${l.expiry_date}` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-2">Skipped ingredients will not be deducted from inventory.</p>
                    </div>
                  )}

                  {startInfo?.has_formulation === false && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-500">
                      No linked formulation — inventory deduction skipped.
                    </div>
                  )}

                  {/* Actual inoculation time — defaults to now, editable */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                      Actual Inoculation Time
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={actualInocTime}
                      max={nowDatetimeLocal()}
                      onChange={e => setActualInocTime(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">
                      Defaults to now. Correct this if you inoculated earlier and are entering data retroactively.
                    </p>
                  </div>

                  {startErr && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{startErr}</p>}

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setStartModal(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-50">
                      Cancel
                    </button>
                    <button onClick={confirmStart} disabled={actionLoading}
                      className="flex-1 py-3 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-2xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" /> Confirm & Start</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Plate Observation Modal ── */}
      {modal?.type === 'plate' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="flex flex-col bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto h-[100dvh] sm:h-auto sm:max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">Plate Observation</h3>
                {modal.tp && <p className="text-xs text-slate-500 mt-0.5">T+{modal.tp.planned_hour}h time point</p>}
              </div>
              <button onClick={() => setModal(null)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LabelCls}>Time Point (h) *</label>
                  <input className={InputCls} type="number" step="0.1" value={pForm.time_point_hours || ''} onChange={e => setPForm(f => ({ ...f, time_point_hours: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>Observation Type</label>
                  <select className={InputCls} value={pForm.observation_type || 'colony_count'} onChange={e => setPForm(f => ({ ...f, observation_type: e.target.value }))}>
                    <option value="colony_count">Colony Count</option>
                    <option value="sterility">Sterility Check</option>
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Plate Media</label>
                  <select className={InputCls} value={pForm.plate_media || ''} onChange={e => setPForm(f => ({ ...f, plate_media: e.target.value }))}>
                    <option value="">Select…</option>
                    {PLATE_MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Dilution</label>
                  <select className={InputCls} value={pForm.dilution || ''} onChange={e => setPForm(f => ({ ...f, dilution: e.target.value }))}>
                    <option value="">Select…</option>
                    {DILUTION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LabelCls}>Incubation Temp (°C)</label>
                  <input className={InputCls} type="number" step="0.5" value={pForm.incubation_temp_c || ''} onChange={e => setPForm(f => ({ ...f, incubation_temp_c: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>Incubation Time (h)</label>
                  <input className={InputCls} type="number" value={pForm.incubation_hours || ''} onChange={e => setPForm(f => ({ ...f, incubation_hours: e.target.value }))} />
                </div>
                <div>
                  <label className={LabelCls}>No. of Plates</label>
                  <input className={InputCls} type="number" min="1" max="20" value={pForm.plate_count || 1} onChange={e => setPForm(f => ({ ...f, plate_count: e.target.value }))} />
                </div>
                {pForm.observation_type !== 'sterility' ? (
                  <>
                    <div>
                      <label className={LabelCls}>Colony Count (CFU)</label>
                      <input className={InputCls} type="number" value={pForm.colony_count || ''} onChange={e => setPForm(f => ({ ...f, colony_count: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Colony Color</label>
                      <input className={InputCls} type="text" value={pForm.colony_color || ''} onChange={e => setPForm(f => ({ ...f, colony_color: e.target.value }))} placeholder="e.g. cream white" />
                    </div>
                  </>
                ) : null}
                <div className="col-span-2">
                  <label className={LabelCls}>Result</label>
                  <div className="flex gap-2">
                    {(pForm.observation_type === 'sterility'
                      ? ['sterile', 'contaminated']
                      : ['normal_growth', 'contaminated', 'pending']
                    ).map(r => (
                      <button key={r} type="button" onClick={() => setPForm(f => ({ ...f, result: r }))}
                        className={`flex-1 py-2 rounded-xl border text-xs font-black transition-colors ${pForm.result === r ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                      >{r.replace(/_/g, ' ')}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className={LabelCls}>Colony Morphology</label>
                <textarea className={InputCls} rows={2} value={pForm.colony_morphology || ''} onChange={e => setPForm(f => ({ ...f, colony_morphology: e.target.value }))} placeholder="Shape, margin, elevation, surface texture…" />
              </div>
              <div>
                <label className={LabelCls}>Notes</label>
                <textarea className={InputCls} rows={1} value={pForm.notes || ''} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              {modalErr && <p className="text-xs text-red-600 font-bold">{modalErr}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModal(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-50">Cancel</button>
                <button onClick={savePlate} disabled={modalSaving || !pForm.time_point_hours}
                  className="flex-1 py-3 bg-violet-700 text-white font-black rounded-2xl text-sm hover:bg-violet-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {modalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Observation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Study Modal ── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-xl overflow-y-auto max-h-[92vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-black text-slate-800">Edit Study</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{study.study_code}</p>
              </div>
              <button onClick={() => setEditModal(false)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {editMetaLoading ? (
              <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="p-6 space-y-5">

                {/* ── Identity ── */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Identity</p>
                  <div>
                    <label className={LabelCls}>Study Name *</label>
                    <input className={InputCls} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className={LabelCls}>Study Type</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[['growth_curve','Growth Curve'],['fermentation','Fermentation']].map(([v,l]) => (
                        <button key={v} type="button" onClick={() => setEditForm(f => ({ ...f, study_type: v }))}
                          className={`py-2.5 rounded-xl border-2 text-xs font-black transition-all ${editForm.study_type === v ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-500'}`}
                        >{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={LabelCls}>Objective</label>
                    <textarea className={InputCls} rows={2} value={editForm.objective} onChange={e => setEditForm(f => ({ ...f, objective: e.target.value }))} placeholder="What are you trying to characterise?" />
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* ── Isolate ── */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Isolate Source</p>
                  <div className="flex gap-3">
                    {[['strain','Cell Bank Strain'],['prep','Preparation / Vial']].map(([v,l]) => (
                      <button key={v} type="button"
                        onClick={() => setEditForm(f => ({ ...f, isolate_source: v, cell_bank_strain_id: '', cell_bank_preparation_id: '', vial_id: '' }))}
                        className={`flex-1 py-2 rounded-xl border text-xs font-black transition-colors ${editForm.isolate_source === v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                      >{l}</button>
                    ))}
                  </div>
                  {editForm.isolate_source === 'strain' ? (
                    <select className={InputCls} value={editForm.cell_bank_strain_id} onChange={e => setEditForm(f => ({ ...f, cell_bank_strain_id: e.target.value }))}>
                      <option value="">Select strain…</option>
                      {editMeta.strains.map(s => <option key={s.id} value={s.id}>{s.name}{s.accession_number ? ` (${s.accession_number})` : ''}</option>)}
                    </select>
                  ) : (
                    <>
                      <select className={InputCls} value={editForm.cell_bank_preparation_id}
                        onChange={e => { setEditForm(f => ({ ...f, cell_bank_preparation_id: e.target.value, vial_id: '' })); loadEditVials(e.target.value); }}
                      >
                        <option value="">Select preparation…</option>
                        {editMeta.preps.map(p => <option key={p.id} value={p.id}>{p.prep_code} — {p.type}{p.passage_number ? ` P${p.passage_number}` : ''}</option>)}
                      </select>
                      {editForm.cell_bank_preparation_id && (
                        <div>
                          <label className={LabelCls}>Vial <span className="text-teal-600 normal-case font-medium">(link or change)</span></label>
                          <select className={InputCls} value={editForm.vial_id} onChange={e => setEditForm(f => ({ ...f, vial_id: e.target.value }))}>
                            <option value="">No vial linked</option>
                            {editMeta.vials.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.vial_code}{v.status === 'Used' ? ' (Currently Used)' : ' (Available)'}{v.storage_temp ? ` · ${v.storage_temp}` : ''}{v.freezer_id ? ` · ${v.freezer_id}` : ''}
                              </option>
                            ))}
                          </select>
                          <p className="text-[10px] text-slate-400 mt-1">Changing vial restores the previous one to Available.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <hr className="border-slate-100" />

                {/* ── Media ── */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Growth Media</p>
                  <select className={InputCls} value={editForm.formulation_id} onChange={e => setEditForm(f => ({ ...f, formulation_id: e.target.value, media_name: '' }))}>
                    <option value="">Select from Formulation Library…</option>
                    {editMeta.formulations.map(fm => <option key={fm.id} value={fm.id}>{fm.name} ({fm.code})</option>)}
                  </select>
                  {!editForm.formulation_id && (
                    <input className={InputCls} value={editForm.media_name} onChange={e => setEditForm(f => ({ ...f, media_name: e.target.value }))} placeholder="Or type media name manually (e.g. MRS Broth)" />
                  )}
                </div>

                <hr className="border-slate-100" />

                {/* ── Conditions ── */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Incubation Conditions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={LabelCls}>Vessel Type</label>
                      <select className={InputCls} value={editForm.vessel_type} onChange={e => setEditForm(f => ({ ...f, vessel_type: e.target.value }))}>
                        <option value="">Select…</option>
                        {VESSEL_TYPES.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LabelCls}>Volume (mL)</label>
                      <input className={InputCls} type="number" value={editForm.volume_ml} onChange={e => setEditForm(f => ({ ...f, volume_ml: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Temperature (°C)</label>
                      <input className={InputCls} type="number" step="0.5" value={editForm.temperature_c} onChange={e => setEditForm(f => ({ ...f, temperature_c: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Agitation (rpm)</label>
                      <input className={InputCls} type="number" value={editForm.agitation_rpm} onChange={e => setEditForm(f => ({ ...f, agitation_rpm: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Inoculum (%v/v)</label>
                      <input className={InputCls} type="number" step="0.1" value={editForm.inoculum_percentage} onChange={e => setEditForm(f => ({ ...f, inoculum_percentage: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Inoculum Volume (mL)</label>
                      <input className={InputCls} type="number" step="0.1" value={editForm.inoculum_volume_ml} onChange={e => setEditForm(f => ({ ...f, inoculum_volume_ml: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>OD Wavelength (nm)</label>
                      <input className={InputCls} type="number" value={editForm.od_wavelength} onChange={e => setEditForm(f => ({ ...f, od_wavelength: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LabelCls}>Planned Duration (h)</label>
                      <input className={InputCls} type="number" value={editForm.expected_duration_hours} onChange={e => setEditForm(f => ({ ...f, expected_duration_hours: e.target.value }))} />
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div>
                  <label className={LabelCls}>Notes</label>
                  <textarea className={InputCls} rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                {editErr && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{editErr}</p>}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditModal(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-50">Cancel</button>
                  <button onClick={saveEdit} disabled={editSaving || !editForm.name?.trim()}
                    className="flex-1 py-3 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-2xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-800">Delete Study?</h3>
                <p className="text-xs text-slate-500 mt-0.5">This will permanently delete all measurements, time points, and plate observations.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-black text-red-700">{study.study_code} — {study.name}</p>
              {study.cell_bank_vials && <p className="text-[10px] text-red-500 mt-0.5">Vial {study.cell_bank_vials.vial_code} will be restored to Available.</p>}
            </div>
            {deleteErr && <p className="text-xs text-red-600 font-bold">{deleteErr}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={deleteStudy} disabled={deleteLoading}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
