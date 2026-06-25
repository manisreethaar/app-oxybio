'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import {
  ChevronLeft, CheckCircle2, Circle, FlaskConical, Microscope,
  Thermometer, Droplets, Snowflake, Save, ChevronDown, ChevronUp,
  ExternalLink, BookOpen, Shield, Printer, ChevronRight, AlertTriangle,
} from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import ConfirmModal from '@/components/ui/ConfirmModal';

const STEPS = [
  { key: 'strain_source',   label: 'Strain Source',      icon: Microscope,   desc: 'Confirm strain identity and source documentation' },
  { key: 'broth_culture_1', label: 'Broth Culture #1',   icon: FlaskConical, desc: 'Sub-culture in broth -- check OD at 600nm' },
  { key: 'plating',         label: 'Plate on Agar',      icon: Droplets,     desc: 'Plate on selective agar + incubation' },
  { key: 'colony_pick',     label: 'Colony Pick',        icon: Microscope,   desc: 'Pick single colony from agar plate' },
  { key: 'broth_culture_2', label: 'Broth Culture #2',   icon: FlaskConical, desc: 'Sub-culture picked colony -- verify target OD' },
  { key: 'glycerol_stock',  label: 'Glycerol Stock',     icon: Thermometer,  desc: 'Prepare glycerol stock (15-20% v/v glycerol)' },
  { key: 'vial_storage',    label: 'Vial Registration',  icon: Snowflake,    desc: 'Log vials -- freeze at -20degC or -80degC' },
];

const STABILITY_MONTHS = [3, 6, 12, 24];

const STATUS_COLOR = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'Discarded':   'bg-red-100 text-red-600',
};

const ACTION_COLOR = {
  registered:    'bg-emerald-100 text-emerald-700',
  thawed:        'bg-blue-100 text-blue-700',
  used_in_batch: 'bg-amber-100 text-amber-700',
  returned:      'bg-violet-100 text-violet-700',
  discarded:     'bg-red-100 text-red-600',
  shipped:       'bg-purple-100 text-purple-700',
};

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function isWithin30Days(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d - now) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

function isExpired(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

// ---- Ship Vial Modal -------------------------------------------------------
function ShipVialModal({ vial, onClose, onShipped }) {
  const toast = useToast();
  const [destination,    setDestination]    = useState('');
  const [notes,          setNotes]          = useState('');
  const [saving,         setSaving]         = useState(false);
  const [carrier,        setCarrier]        = useState('');
  const [transitTempC,   setTransitTempC]   = useState('');
  const [transitDays,    setTransitDays]    = useState('1');

  const handleShip = async () => {
    if (!destination.trim()) { toast.error('Destination is required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/research/cell-bank/vials/${vial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ship', destination: destination.trim(), notes: notes.trim() || null, carrier: carrier || null, transit_temp_c: transitTempC ? parseFloat(transitTempC) : null, transit_days: transitDays ? parseInt(transitDays) : null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(`Vial ${vial.vial_code} marked as Shipped.`);
      onShipped();
      onClose();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <p className="text-sm font-black text-gray-900">Ship Vial to External Lab</p>
        <p className="text-xs text-gray-500">Vial: <span className="font-mono font-bold">{vial.vial_code}</span></p>
        <div>
          <label className="field-label">Destination Lab / Organization <span className="text-red-500">*</span></label>
          <input value={destination} onChange={e => setDestination(e.target.value)} className="field-input" placeholder="e.g. CSIR-CFTRI, Mysore"/>
        </div>
        <div>
          <label className="field-label">Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="field-input" placeholder="Optional shipping notes"/>
        </div>
        {/* A-51: Cold chain shipment record */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
          <p className="text-xs font-black text-blue-900">Cold Chain Details</p>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="field-label text-xs">Carrier</label><input value={carrier} onChange={e=>setCarrier(e.target.value)} className="field-input text-xs" placeholder="e.g. FedEx"/></div>
            <div><label className="field-label text-xs">Transit Temp (°C)</label><input type="number" step="0.1" value={transitTempC} onChange={e=>setTransitTempC(e.target.value)} className="field-input text-xs" placeholder="2–8"/></div>
            <div><label className="field-label text-xs">Transit Days</label><input type="number" value={transitDays} onChange={e=>setTransitDays(e.target.value)} className="field-input text-xs" placeholder="1"/></div>
          </div>
          {transitTempC && (parseFloat(transitTempC) > 8 || parseFloat(transitTempC) < -100) && (
            <p className="text-[10px] text-amber-700 font-bold">⚠ Temp outside typical cell bank range (−80°C dry ice or 2–8°C). Verify cold chain.</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600">Cancel</button>
          <button onClick={handleShip} disabled={saving} className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">{saving ? 'Shipping...' : 'Confirm Ship'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- Vial Row with movement log -------------------------------------------
function VialRow({ vial, isAdmin, onAction, availableCount = 0 }) {
  const [expanded, setExpanded]       = useState(false);
  const [logs, setLogs]               = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [acting, setActing]           = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [recoveryPct,    setRecoveryPct]    = useState('');
  const [thawTempC,      setThawTempC]      = useState('37');
  const [thawDurationMin, setThawDurationMin] = useState('2');
  const [thawMedia,      setThawMedia]      = useState('MRS broth');
  const [showShipModal, setShowShipModal] = useState(false);
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

  const handleActionClick = (action) => {
    // A-35: Reserve vial policy — warn when using/discarding the last available vial
    if ((action === 'use' || action === 'discard') && availableCount <= 1 && vial.status === 'Available') {
      const proceed = window.confirm(
        `⚠ RESERVE VIAL POLICY\n\nThis is the LAST available vial in this preparation.\n\nUsing or discarding it will leave zero available vials — no future production batches can use this strain from this bank.\n\nProceed only if you have admin authorisation and a new preparation is planned.\n\nContinue?`
      );
      if (!proceed) return;
    }
    setConfirmAction(action);
    setRecoveryPct('');
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    setActing(true);
    const payload = { action: confirmAction };
    if ((confirmAction === 'thaw' || confirmAction === 'use') && recoveryPct !== '') {
      payload.recovery_pct = parseFloat(recoveryPct);
    }
    if (confirmAction === 'thaw') {
      payload.thaw_temp_c = thawTempC ? parseFloat(thawTempC) : null;
      payload.thaw_duration_min = thawDurationMin ? parseFloat(thawDurationMin) : null;
      payload.thaw_media = thawMedia || null;
    }
    const res = await fetch(`/api/research/cell-bank/vials/${vial.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.success) { toast.success(`Vial ${vial.vial_code} updated.`); setLogs(null); onAction(); }
    else toast.error(json.error);
    setActing(false);
    setConfirmAction(null);
  };

  const statusBg = vial.status === 'Available'
    ? 'bg-emerald-50 border-emerald-200'
    : vial.status === 'Used'
    ? 'bg-amber-50 border-amber-200'
    : vial.status === 'Shipped'
    ? 'bg-purple-50 border-purple-200'
    : 'bg-gray-50 border-gray-200';

  const expiryWarning = isExpired(vial.expires_at)
    ? 'expired'
    : isWithin30Days(vial.expires_at)
    ? 'soon'
    : null;

  return (
    <div className={`rounded-xl border text-xs ${statusBg} overflow-hidden`}>
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-black text-gray-900 font-mono">{vial.vial_code}</p>
          <p className="text-gray-500 mt-0.5">{vial.storage_temp} | {[vial.freezer_id, vial.rack && `Rack ${vial.rack}`, vial.box && `Box ${vial.box}`].filter(Boolean).join(' / ') || 'No location'}</p>
          {vial.expires_at && (
            <p className={`text-[10px] font-semibold mt-0.5 ${expiryWarning === 'expired' ? 'text-red-600' : expiryWarning === 'soon' ? 'text-amber-600' : 'text-gray-400'}`}>
              Expires: {new Date(vial.expires_at).toLocaleDateString('en-IN')}
              {expiryWarning === 'expired' && ' -- EXPIRED'}
              {expiryWarning === 'soon' && ' -- expiring soon'}
            </p>
          )}
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            vial.status === 'Available' ? 'bg-emerald-100 text-emerald-700' :
            vial.status === 'Used' ? 'bg-amber-100 text-amber-700' :
            vial.status === 'Shipped' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-200 text-gray-600'
          }`}>
            {vial.status}
          </span>
          {vial.used_in_batch_id && <p className="text-[10px] text-amber-700 font-semibold mt-0.5">Used in: <Link href={`/batches/${vial.used_in_batch_id}`} className="hover:underline text-navy font-bold">{vial.batches?.batch_id || 'Batch'}</Link></p>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isAdmin && vial.status === 'Available' && (
            <div className="flex gap-1 flex-wrap justify-end">
              <button onClick={() => handleActionClick('thaw')} disabled={acting} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold hover:bg-blue-200 disabled:opacity-50">Thaw</button>
              <button onClick={() => setShowShipModal(true)} disabled={acting} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold hover:bg-purple-200 disabled:opacity-50">Ship</button>
              <button onClick={() => handleActionClick('discard')} disabled={acting} className="px-2 py-1 bg-red-100 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-200 disabled:opacity-50">Discard</button>
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
              {l.destination && <span className="text-[10px] text-purple-700 font-semibold">{l.destination}</span>}
              {l.recovery_pct != null && <span className="text-[10px] text-violet-700 font-semibold">{l.recovery_pct}% recovery</span>}
              <span className="text-[10px] text-gray-400 ml-auto">{new Date(l.created_at).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Thaw/use confirm with recovery_pct */}
      {confirmAction && (confirmAction === 'thaw' || confirmAction === 'use') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="text-sm font-black text-gray-900">{confirmAction === 'thaw' ? 'Log Thaw' : 'Mark Vial Used'}</p>
            <p className="text-xs text-gray-500">Vial: <span className="font-mono font-bold">{vial.vial_code}</span></p>
            <div>
              <label className="field-label">Recovery / Viability (%) <span className="text-gray-400 font-normal">optional</span></label>
              <input type="number" min="0" max="100" step="0.1" value={recoveryPct} onChange={e => setRecoveryPct(e.target.value)} className="field-input" placeholder="e.g. 85"/>
            </div>
            {confirmAction === 'thaw' && (
              <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-black text-blue-900">Thaw Protocol (A-50)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="field-label text-xs">Thaw Temp (°C)</label><input type="number" step="0.1" value={thawTempC} onChange={e=>setThawTempC(e.target.value)} className="field-input text-xs" placeholder="37"/></div>
                  <div><label className="field-label text-xs">Duration (min)</label><input type="number" step="0.5" value={thawDurationMin} onChange={e=>setThawDurationMin(e.target.value)} className="field-input text-xs" placeholder="2"/></div>
                </div>
                <div><label className="field-label text-xs">Recovery Media</label><input value={thawMedia} onChange={e=>setThawMedia(e.target.value)} className="field-input text-xs" placeholder="e.g. MRS broth"/></div>
                <p className="text-[9px] text-blue-600 font-semibold">Standard: 37°C water bath, 2 min, transfer to MRS broth immediately</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600">Cancel</button>
              <button onClick={executeAction} disabled={acting} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">{acting ? 'Saving...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Discard confirm */}
      <ConfirmModal
        isOpen={confirmAction === 'discard'}
        onClose={() => setConfirmAction(null)}
        onConfirm={executeAction}
        title="Discard Vial"
        message={`Are you sure you want to discard vial ${vial.vial_code}? This cannot be undone.`}
        confirmText="Discard"
        variant="danger"
      />

      {showShipModal && (
        <ShipVialModal
          vial={vial}
          onClose={() => setShowShipModal(false)}
          onShipped={() => { setLogs(null); onAction(); }}
        />
      )}
    </div>
  );
}

// ---- Vial Registration panel -----------------------------------------------
function VialRegistrationPanel({ prepId, prep, onRegistered }) {
  const toast = useToast();
  const [count,       setCount]       = useState('');
  const [storageTemp, setStorageTemp] = useState('-20degC');
  const [freezerId,   setFreezerId]   = useState('');
  const [rack,        setRack]        = useState('');
  const [box,         setBox]         = useState('');
  const [expiresAt,   setExpiresAt]   = useState('');
  const [registering, setRegistering] = useState(false);

  const year  = String(new Date().getFullYear()).slice(-2);
  const short = (prep?.cell_bank_strains?.strain_short_code || 'XX').toUpperCase();
  const baseCode = `${prep?.type}-${year}-${short}`;

  const handleRegister = async () => {
    if (!count || parseInt(count) < 1) { toast.warn('Enter number of vials.'); return; }
    setRegistering(true);
    const res = await fetch(`/api/research/cell-bank/${prepId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register_vials',
        count: parseInt(count),
        storage_temp: storageTemp,
        freezer_id: freezerId || null,
        rack: rack || null,
        box: box || null,
        expires_at: expiresAt || null,
      }),
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
        <p className="font-mono text-indigo-700 mt-0.5">{baseCode}-001, {baseCode}-002, ...</p>
        {!prep?.cell_bank_strains?.strain_short_code && (
          <p className="text-amber-700 font-semibold mt-1">Strain short code not set -- codes will use XX. Edit the strain record to set it.</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="field-label">Number of Vials to Register <span className="text-red-500">*</span></label>
          <input type="number" min="1" max="200" value={count} onChange={e => setCount(e.target.value)} className="field-input" placeholder="e.g. 10"/>
        </div>
        <div>
          <label className="field-label">Storage Temp</label>
          <select value={storageTemp} onChange={e => setStorageTemp(e.target.value)} className="field-input bg-white">
            <option value="-20degC">-20 degC</option>
            <option value="-80degC">-80 degC</option>
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
        <div className="col-span-2">
          <label className="field-label">Expiry Date <span className="text-gray-400 font-normal">(optional -- applies to all vials in this batch)</span></label>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="field-input"/>
        </div>
      </div>
      <button onClick={handleRegister} disabled={registering || !count}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-sm disabled:opacity-50">
        {registering ? 'Registering...' : `Generate & Register ${count || 'N'} Vials`}
      </button>
    </div>
  );
}

// ---- Stability Testing section ---------------------------------------------
function StabilitySection({ prep, prepId, isAdmin, onSaved }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tests, setTests] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prep?.step_data?.stability_tests) {
      setTests(prep.step_data.stability_tests);
    } else if (prep?.created_at) {
      // Initialise from schedule
      const initial = STABILITY_MONTHS.map(m => ({
        months: m,
        scheduled_date: addMonths(prep.created_at, m).toISOString().slice(0, 10),
        status: 'Not Due Yet',
        cfu_per_ml: '',
        notes: '',
      }));
      setTests(initial);
    }
  }, [prep]);

  const today = new Date();

  const computeStatus = (scheduledDate, existingStatus) => {
    if (!scheduledDate) return 'Not Due Yet';
    if (['Pass', 'Fail'].includes(existingStatus)) return existingStatus;
    if (new Date(scheduledDate) <= today) return 'Pending';
    return 'Not Due Yet';
  };

  const updateTest = (idx, field, val) => {
    setTests(prev => prev.map((t, i) => i === idx ? { ...t, [field]: val } : t));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/research/cell-bank/${prepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_data: { stability_tests: tests } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Stability tests saved.');
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!tests) return null;

  return (
    <div className="surface p-5 space-y-3">
      <button onClick={() => setOpen(v => !v)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-violet-600"/>
          <p className="text-sm font-black text-gray-900">Stability Testing Schedule</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400"/> : <ChevronDown className="w-4 h-4 text-gray-400"/>}
      </button>

      {open && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-2 pr-3 font-black text-gray-500">Checkpoint</th>
                  <th className="pb-2 pr-3 font-black text-gray-500">Scheduled Date</th>
                  <th className="pb-2 pr-3 font-black text-gray-500">Status</th>
                  <th className="pb-2 pr-3 font-black text-gray-500">CFU/mL</th>
                  <th className="pb-2 font-black text-gray-500">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tests.map((t, i) => {
                  const statusDisplay = computeStatus(t.scheduled_date, t.status);
                  const statusColor = statusDisplay === 'Pass' ? 'text-emerald-700' : statusDisplay === 'Fail' ? 'text-red-600' : statusDisplay === 'Pending' ? 'text-amber-700' : 'text-gray-400';
                  return (
                    <tr key={t.months} className="align-top">
                      <td className="py-2 pr-3 font-bold text-gray-700">{t.months}m</td>
                      <td className="py-2 pr-3 text-gray-500">{t.scheduled_date ? new Date(t.scheduled_date).toLocaleDateString('en-IN') : '--'}</td>
                      <td className="py-2 pr-3">
                        {isAdmin ? (
                          <select
                            value={t.status || ''}
                            onChange={e => updateTest(i, 'status', e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white"
                          >
                            <option value="Not Due Yet">Not Due Yet</option>
                            <option value="Pending">Pending</option>
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                          </select>
                        ) : (
                          <span className={`font-bold ${statusColor}`}>{statusDisplay}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {isAdmin ? (
                          <input
                            value={t.cfu_per_ml || ''}
                            onChange={e => updateTest(i, 'cfu_per_ml', e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-0.5 w-24"
                            placeholder="e.g. 1e8"
                          />
                        ) : (
                          <span className="text-gray-700">{t.cfu_per_ml || '--'}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {isAdmin ? (
                          <input
                            value={t.notes || ''}
                            onChange={e => updateTest(i, 'notes', e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-0.5 w-full"
                            placeholder="Notes..."
                          />
                        ) : (
                          <span className="text-gray-500">{t.notes || '--'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Stability Tests'}
              </button>
              {/* A-22: Update next stability test date */}
              <div className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
                <span>Next test:</span>
                <input type="date" defaultValue={prep?.next_stability_test_date || ''}
                  onChange={async (e) => {
                    const res = await fetch(`/api/research/cell-bank/${prepId}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ next_stability_test_date: e.target.value, last_stability_test_date: prep?.last_stability_test_date }),
                    });
                    const json = await res.json();
                    if (json.success) onSaved();
                  }}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-violet-400"/>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- CoA Print Modal -------------------------------------------------------
function CoaModal({ prep, onClose }) {
  const printRef = useRef(null);
  const strain = prep?.cell_bank_strains;
  const char = strain?.characterization || {};
  const stabilityTests = prep?.step_data?.stability_tests || [];
  const passageNum = (prep?.passage_number != null && prep.passage_number > 0) ? prep.passage_number : 1;

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Modal controls (hidden on print) */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 print:hidden">
          <p className="text-sm font-black text-gray-900">Certificate of Analysis Preview</p>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 bg-navy text-white rounded-xl text-xs font-bold">
              <Printer className="w-3.5 h-3.5"/> Print / Save PDF
            </button>
            <button onClick={onClose} className="px-3 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-600">Close</button>
          </div>
        </div>

        {/* CoA content */}
        <div ref={printRef} className="p-8 space-y-6 coa-print-area text-sm">
          <style>{`
            @media print {
              body > * { display: none !important; }
              .coa-print-area { display: block !important; }
              .print\\:hidden { display: none !important; }
            }
          `}</style>

          <div className="text-center border-b-2 border-gray-800 pb-4">
            <p className="text-xl font-black text-gray-900 uppercase tracking-widest">Certificate of Analysis</p>
            <p className="text-xs text-gray-500 mt-1">Cell Bank Preparation</p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Prep Code</span><p className="font-bold font-mono">{prep?.prep_code}</p></div>
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Type</span><p className="font-bold">{prep?.type}</p></div>
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Strain</span><p className="font-bold">{strain?.name}</p></div>
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Passage</span><p className="font-bold">P{passageNum}</p></div>
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Created</span><p className="font-bold">{prep?.created_at ? new Date(prep.created_at).toLocaleDateString('en-IN') : '--'}</p></div>
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Completed</span><p className="font-bold">{prep?.completed_at ? new Date(prep.completed_at).toLocaleDateString('en-IN') : 'In Progress'}</p></div>
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Vial Count</span><p className="font-bold">{prep?.vial_count ?? '--'}</p></div>
            <div><span className="font-black text-gray-500 uppercase text-[10px]">Storage Temp</span><p className="font-bold">{prep?.cell_bank_vials?.[0]?.storage_temp || '--'}</p></div>
            {/* A-22: Stability schedule */}
            {prep?.next_stability_test_date && (
              <div className={`col-span-2 p-2 rounded-lg border text-xs ${new Date(prep.next_stability_test_date) < new Date() ? 'bg-red-50 border-red-300' : new Date(prep.next_stability_test_date) < new Date(Date.now()+30*86400000) ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                <span className="font-black uppercase text-[10px]">Next Stability Test</span>
                <p className={`font-bold ${new Date(prep.next_stability_test_date) < new Date() ? 'text-red-700' : 'text-amber-700'}`}>
                  {new Date(prep.next_stability_test_date).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}
                  {new Date(prep.next_stability_test_date) < new Date() ? ' — OVERDUE' : ''}
                </p>
              </div>
            )}
          </div>

          {/* QC Release */}
          <div className={`p-3 rounded-xl border text-xs ${prep?.qc_released ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-200'}`}>
            <p className="font-black text-gray-700 uppercase text-[10px]">QC Release Status</p>
            {prep?.qc_released ? (
              <>
                <p className="font-bold text-emerald-700 mt-0.5">RELEASED</p>
                {prep?.qc_released_at && <p className="text-gray-500">Date: {new Date(prep.qc_released_at).toLocaleDateString('en-IN')}</p>}
                {prep?.qc_released_employee?.full_name && <p className="text-gray-500">Authorized by: {prep.qc_released_employee.full_name}</p>}
              </>
            ) : (
              <p className="font-bold text-amber-700 mt-0.5">PENDING QC RELEASE</p>
            )}
          </div>

          {/* Strain characterization */}
          {Object.keys(char).some(k => char[k]) && (
            <div>
              <p className="font-black text-gray-700 uppercase text-[10px] mb-1.5">Strain Characterization</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { k: 'gram_stain', l: 'Gram Stain' },
                  { k: 'cell_shape', l: 'Cell Shape' },
                  { k: 'motility', l: 'Motility' },
                  { k: 'catalase', l: 'Catalase' },
                  { k: 'oxidase', l: 'Oxidase' },
                  { k: 'rna_16s_accession', l: '16S rRNA Accession' },
                ].filter(f => char[f.k]).map(f => (
                  <div key={f.k} className="p-1.5 bg-gray-50 rounded">
                    <p className="text-[9px] font-black text-gray-400 uppercase">{f.l}</p>
                    <p className="font-bold text-gray-700">{char[f.k]}</p>
                  </div>
                ))}
              </div>
              {char.biochemical_notes && <div className="mt-1.5 p-1.5 bg-gray-50 rounded"><p className="text-[9px] font-black text-gray-400 uppercase">Biochemical Notes</p><p className="text-xs text-gray-700">{char.biochemical_notes}</p></div>}
              {char.genome_notes && <div className="mt-1 p-1.5 bg-gray-50 rounded"><p className="text-[9px] font-black text-gray-400 uppercase">Genome / Plasmid Notes</p><p className="text-xs text-gray-700">{char.genome_notes}</p></div>}
            </div>
          )}

          {/* Stability tests */}
          {stabilityTests.length > 0 && (
            <div>
              <p className="font-black text-gray-700 uppercase text-[10px] mb-1.5">Stability Test Results</p>
              <table className="w-full text-xs border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-2 py-1 text-left font-black">Checkpoint</th>
                    <th className="border border-gray-200 px-2 py-1 text-left font-black">Date</th>
                    <th className="border border-gray-200 px-2 py-1 text-left font-black">Status</th>
                    <th className="border border-gray-200 px-2 py-1 text-left font-black">CFU/mL</th>
                    <th className="border border-gray-200 px-2 py-1 text-left font-black">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {stabilityTests.map(t => (
                    <tr key={t.months}>
                      <td className="border border-gray-200 px-2 py-1">{t.months}m</td>
                      <td className="border border-gray-200 px-2 py-1">{t.scheduled_date ? new Date(t.scheduled_date).toLocaleDateString('en-IN') : '--'}</td>
                      <td className="border border-gray-200 px-2 py-1">{t.status || '--'}</td>
                      <td className="border border-gray-200 px-2 py-1">{t.cfu_per_ml || '--'}</td>
                      <td className="border border-gray-200 px-2 py-1">{t.notes || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 text-[10px] text-gray-400 text-center">
            Generated by OxyBio Cell Bank Management System
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Step Card ------------------------------------------------------------
function StepCard({ step, data, incubations, prepId, onSave, isAdmin, labMediaFormulations }) {
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Culture Condition</label>
              <input value={form.culture_condition||''} onChange={e=>set('culture_condition',e.target.value)} className="field-input" placeholder="MRS broth 37degC"/></div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="field-label">Broth / Media Recipe</label>
                {labMediaFormulations?.length > 0 ? (
                  <select value={form.media_formulation_id||''} onChange={e => {
                    const f = labMediaFormulations.find(f => f.id === e.target.value);
                    set('media_formulation_id', e.target.value);
                    set('media', f?.name || '');
                  }} className="field-input bg-white">
                    <option value="">Select from Recipe module...</option>
                    {labMediaFormulations.map(f => <option key={f.id} value={f.id}>{f.name} (v{f.version})</option>)}
                    <option value="custom">Other (enter manually)</option>
                  </select>
                ) : (
                  <input value={form.media||''} onChange={e=>set('media',e.target.value)} className="field-input" placeholder="MRS broth"/>
                )}
                {(form.media_formulation_id === 'custom' || !labMediaFormulations?.length) && labMediaFormulations?.length > 0 && (
                  <input value={form.media||''} onChange={e=>set('media',e.target.value)} className="field-input mt-1" placeholder="Enter media name"/>
                )}
              </div>
              <div><label className="field-label">Volume (ml)</label>
                <input type="number" value={form.volume_ml||''} onChange={e=>set('volume_ml',e.target.value)} className="field-input" placeholder="10"/></div>
              <div><label className="field-label">Sterilization Method</label>
                <select value={form.sterilization_method||''} onChange={e=>set('sterilization_method',e.target.value)} className="field-input bg-white">
                  <option value="">Select...</option>
                  <option value="Autoclave">Autoclave</option>
                  <option value="Filter (0.22um)">Filter (0.22um)</option>
                  <option value="Filter (0.45um)">Filter (0.45um)</option>
                  <option value="Not required">Not required</option>
                </select></div>
              <div><label className="field-label">Sterilization Temp (degC)</label>
                <input type="number" value={form.sterilization_temp||''} onChange={e=>set('sterilization_temp',e.target.value)} className="field-input" placeholder="121"/></div>
              <div><label className="field-label">Sterilization Time (min)</label>
                <input type="number" value={form.sterilization_min||''} onChange={e=>set('sterilization_min',e.target.value)} className="field-input" placeholder="15"/></div>
              <div><label className="field-label">pH After Prep</label>
                <input type="number" step="0.01" value={form.media_ph_after||''} onChange={e=>set('media_ph_after',e.target.value)} className="field-input" placeholder="6.5"/></div>
              <div className="col-span-2"><label className="field-label">Media Lot / Batch Notes</label>
                <input value={form.media_lot_notes||''} onChange={e=>set('media_lot_notes',e.target.value)} className="field-input" placeholder="MRS powder lot #XYZ, expiry MM/YYYY"/></div>
            </div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider pt-1">Incubation and OD Check</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="field-label">Incubation Temp (degC)</label>
                <input type="number" value={form.incubation_temp||''} onChange={e=>set('incubation_temp',e.target.value)} className="field-input" placeholder="37"/></div>
              <div><label className="field-label">Duration (h)</label>
                <input type="number" value={form.duration_h||''} onChange={e=>set('duration_h',e.target.value)} className="field-input" placeholder="24"/></div>
              <div><label className="field-label">OD 600nm Reading</label>
                <input type="number" step="0.01" value={form.od_600||''} onChange={e=>set('od_600',e.target.value)} className="field-input" placeholder="0.8"/></div>
              <div><label className="field-label">Target OD Reached?</label>
                <select value={form.od_target_reached||''} onChange={e=>set('od_target_reached',e.target.value)} className="field-input bg-white">
                  <option value="">--</option>
                  <option value="yes">Yes</option>
                  <option value="no">No -- repeat required</option>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="field-label">Agar Media Recipe</label>
                {labMediaFormulations?.length > 0 ? (
                  <select value={form.agar_formulation_id||''} onChange={e => {
                    const f = labMediaFormulations.find(f => f.id === e.target.value);
                    set('agar_formulation_id', e.target.value);
                    set('agar_media', f?.name || '');
                  }} className="field-input bg-white">
                    <option value="">Select from Recipe module...</option>
                    {labMediaFormulations.map(f => <option key={f.id} value={f.id}>{f.name} (v{f.version})</option>)}
                    <option value="custom">Other (enter manually)</option>
                  </select>
                ) : (
                  <input value={form.agar_media||''} onChange={e=>set('agar_media',e.target.value)} className="field-input" placeholder="MRS agar / LB agar"/>
                )}
                {(form.agar_formulation_id === 'custom' || !labMediaFormulations?.length) && labMediaFormulations?.length > 0 && (
                  <input value={form.agar_media||''} onChange={e=>set('agar_media',e.target.value)} className="field-input mt-1" placeholder="Enter agar name"/>
                )}
              </div>
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
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider pt-1">Plating and Incubation</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="field-label">Dilution Factor</label>
                <select value={form.dilution||''} onChange={e=>set('dilution',e.target.value)} className="field-input bg-white">
                  <option value="">Select...</option>
                  <option value="Direct (No dilution)">Direct (No dilution)</option>
                  <option value="10^-1">10^-1</option>
                  <option value="10^-2">10^-2</option>
                  <option value="10^-3">10^-3</option>
                  <option value="10^-4">10^-4</option>
                  <option value="10^-5">10^-5</option>
                  <option value="10^-6">10^-6</option>
                  <option value="10^-7">10^-7</option>
                  <option value="10^-8">10^-8</option>
                  <option value="10^-9">10^-9</option>
                  <option value="10^-10">10^-10</option>
                </select></div>
              <div><label className="field-label">Incubation Temp (degC)</label>
                <input type="number" value={form.incubation_temp||''} onChange={e=>set('incubation_temp',e.target.value)} className="field-input" placeholder="37"/></div>
              <div><label className="field-label">Incubation Hours</label>
                <input type="number" value={form.incubation_hours||''} onChange={e=>set('incubation_hours',e.target.value)} className="field-input" placeholder="48"/></div>
            </div>
            {incubations?.filter(i => i.sample_type === 'Agar Plate').length > 0 && (
              <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl space-y-1">
                <p className="text-[10px] font-black text-violet-700 uppercase">Incubation Results (from Incubation module)</p>
                {incubations.filter(i => i.sample_type === 'Agar Plate').map(i => (
                  <div key={i.id} className="text-xs text-violet-800 font-semibold flex gap-4 flex-wrap">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

// ---- Main Page ------------------------------------------------------------
export default function CellBankDetailPage() {
  const { prepId } = useParams();
  const { role }   = useAuth();
  const toast      = useToast();
  const [prep, setPrep]         = useState(null);
  const [vials, setVials]       = useState([]);
  const [labMedia, setLabMedia] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [completing, setCompleting] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releasing, setReleasing]           = useState(false);
  const [showCoa, setShowCoa]               = useState(false);
  const isAdmin = ['admin', 'ceo', 'cto', 'research_fellow'].includes(role);

  const fetchPrep = useCallback(async () => {
    setLoading(true);
    try {
      const [prepRes, vialsRes, mediaRes] = await Promise.all([
        fetch(`/api/research/cell-bank/${prepId}`),
        fetch(`/api/research/cell-bank/vials?preparation_id=${prepId}`),
        fetch('/api/formulations?category=Lab%20Media'),
      ]);
      const [prepJson, vialsJson, mediaJson] = await Promise.all([prepRes.json(), vialsRes.json(), mediaRes.json()]);
      if (!prepJson.success) throw new Error(prepJson.error);
      setPrep(prepJson.data);
      if (vialsJson.success) setVials(vialsJson.data || []);
      if (Array.isArray(mediaJson)) setLabMedia(mediaJson.filter(f => f.status === 'Approved'));
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

  const handleQcRelease = async () => {
    setReleasing(true);
    try {
      const res = await fetch(`/api/research/cell-bank/${prepId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qc_release' }),
      });
      const json = await res.json();
      if (!json.data && !json.success) throw new Error(json.error || 'Release failed');
      toast.success('Preparation QC released.');
      fetchPrep();
    } catch (err) { toast.error(err.message); }
    finally { setReleasing(false); setConfirmRelease(false); }
  };

  const completedSteps = prep ? STEPS.filter(s => {
    if (s.key === 'vial_storage') return vials.length > 0;
    return prep.step_data?.[s.key]?.completed;
  }).length : 0;
  const nonVialSteps = STEPS.filter(s => s.key !== 'vial_storage');

  const passageNum = (prep?.passage_number != null && prep.passage_number > 0) ? prep.passage_number : 1;

  // Expiry warnings from vials
  const expiringVials = vials.filter(v => v.status === 'Available' && v.expires_at && isWithin30Days(v.expires_at));
  const expiredVials  = vials.filter(v => v.status === 'Available' && v.expires_at && isExpired(v.expires_at));

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
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">P{passageNum}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[prep?.status] || 'bg-gray-100 text-gray-600'}`}>{prep?.status}</span>
              </div>
              <p className="text-xs text-gray-500">{prep?.cell_bank_strains?.name} | {prep?.cell_bank_strains?.source_type} {prep?.cell_bank_strains?.accession_number}</p>
              {(prep?.linked_formulation || prep?.cell_bank_strains?.linked_formulation) && (
                <Link
                  href={`/formulations?highlight=${prep?.linked_formulation?.id || prep?.cell_bank_strains?.linked_formulation?.id}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-navy hover:underline mt-1"
                >
                  <ExternalLink className="w-3 h-3"/>
                  {prep?.linked_formulation?.code || prep?.cell_bank_strains?.linked_formulation?.code} - {prep?.linked_formulation?.name || prep?.cell_bank_strains?.linked_formulation?.name}
                </Link>
              )}
              {prep?.lnb_entry_id && (
                <Link
                  href={`/lab-notebook/${prep.lnb_entry_id}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:underline mt-1 ml-3"
                >
                  <BookOpen className="w-3 h-3"/>
                  View Linked LNB
                </Link>
              )}
            </>
          )}
        </div>
        {!loading && prep && (
          <button onClick={() => setShowCoa(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm shrink-0">
            <Printer className="w-3.5 h-3.5"/> Generate CoA
          </button>
        )}
      </div>

      {!loading && prep && (
        <>
          {/* QC Release banner / button */}
          {prep.qc_released ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-600 shrink-0"/>
              <div className="flex-1">
                <p className="text-sm font-black text-emerald-800">QC Released</p>
                <p className="text-xs text-emerald-600">
                  {prep.qc_released_employee?.full_name && `By ${prep.qc_released_employee.full_name}`}
                  {prep.qc_released_at && ` on ${new Date(prep.qc_released_at).toLocaleDateString('en-IN')}`}
                </p>
              </div>
            </div>
          ) : isAdmin ? (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0"/>
              <div className="flex-1">
                <p className="text-sm font-black text-orange-800">Awaiting QC Release</p>
                <p className="text-xs text-orange-600">This preparation has not been QC released for production use.</p>
              </div>
              <button onClick={() => setConfirmRelease(true)}
                className="px-3 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 shrink-0">
                QC Release
              </button>
            </div>
          ) : null}

          {/* Vial expiry warnings */}
          {(expiredVials.length > 0 || expiringVials.length > 0) && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5"/>
              <div className="text-xs">
                {expiredVials.length > 0 && <p className="font-bold text-red-800">{expiredVials.length} vial{expiredVials.length > 1 ? 's' : ''} expired</p>}
                {expiringVials.length > 0 && <p className="font-bold text-amber-800">{expiringVials.length} vial{expiringVials.length > 1 ? 's' : ''} expiring within 30 days</p>}
              </div>
            </div>
          )}

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
                labMediaFormulations={labMedia}
              />
            ))}
          </div>

          {/* Vial Registration -- dedicated section */}
          <div className="surface p-5 space-y-4 border-l-4 border-l-indigo-400">
            <div className="flex items-center gap-3">
              <Snowflake className="w-5 h-5 text-indigo-600"/>
              <div>
                <p className="text-sm font-black text-gray-900">Vial Registration and Storage</p>
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
                  {(() => {
                    const availableCount = vials.filter(v => v.status === 'Available').length;
                    return [...vials].sort((a, b) => {
                      if (a.status !== b.status) return a.status === 'Available' ? -1 : 1;
                      return (a.vial_code || '').localeCompare(b.vial_code || '');
                    }).map(v => (
                      <VialRow key={v.id} vial={v} isAdmin={isAdmin} onAction={fetchPrep} availableCount={availableCount}/>
                    ));
                  })()}
                </div>
                {isAdmin && (
                  <VialRegistrationPanel prepId={prepId} prep={prep} onRegistered={fetchPrep}/>
                )}
              </>
            )}
          </div>

          {/* Stability Testing */}
          <StabilitySection prep={prep} prepId={prepId} isAdmin={isAdmin} onSaved={fetchPrep}/>

          {/* Mark complete */}
          {isAdmin && prep.status === 'In Progress' && completedSteps >= nonVialSteps.length && vials.length > 0 && (
            <button onClick={handleMarkCompleted} disabled={completing}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-50">
              {completing ? 'Completing...' : 'Mark Preparation as Completed'}
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

      {/* QC Release confirmation */}
      <ConfirmModal
        isOpen={confirmRelease}
        onClose={() => setConfirmRelease(false)}
        onConfirm={handleQcRelease}
        title="QC Release Preparation"
        message="Mark this preparation as QC released? This confirms it is approved for production use. Your name and timestamp will be recorded."
        confirmText={releasing ? 'Releasing...' : 'Confirm Release'}
        variant="primary"
      />

      {/* CoA modal */}
      {showCoa && prep && (
        <CoaModal prep={prep} onClose={() => setShowCoa(false)}/>
      )}
    </div>
  );
}
