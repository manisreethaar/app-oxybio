'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Wind, Plus, AlertTriangle, CheckCircle2, X, MapPin, BarChart2, Loader2 } from 'lucide-react';
import CreatorBadge from '@/components/ui/CreatorBadge';

const SAMPLING_METHODS = ['Settle Plate', 'Contact Plate', 'Active Air', 'Personnel', 'Surface Swab'];
const FREQUENCIES = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'];
const AREAS = ['Production Floor', 'LAF Cabinet', 'Media Prep', 'Filling Area', 'Cold Storage', 'Corridor', 'Changing Room', 'Other'];

const RESULT_STYLE = {
  Pass:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Alert:   'bg-amber-50 text-amber-700 border-amber-200',
  Action:  'bg-red-50 text-red-700 border-red-200',
  Pending: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function EnvironmentalMonitoringPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = ['admin', 'ceo', 'cto'].includes(employeeProfile?.role);

  const [tab,           setTab]           = useState('dashboard'); // dashboard | log | locations
  const [samples,       setSamples]       = useState([]);
  const [locations,     setLocations]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showSampleForm, setShowSampleForm] = useState(false);
  const [showLocForm,   setShowLocForm]   = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  // Sample form
  const [sLocationId,  setSLocationId]  = useState('');
  const [sSampledAt,   setSSampledAt]   = useState(new Date().toISOString().slice(0, 16));
  const [sIncubTemp,   setSIncubTemp]   = useState('37');
  const [sIncubHrs,    setSIncubHrs]    = useState('48');
  const [sColonyCount, setSColonyCount] = useState('');
  const [sOrganism,    setSOrg]         = useState('');
  const [sNotes,       setSNotes]       = useState('');

  // Location form
  const [lName,        setLName]        = useState('');
  const [lArea,        setLArea]        = useState(AREAS[0]);
  const [lCode,        setLCode]        = useState('');
  const [lMethod,      setLMethod]      = useState(SAMPLING_METHODS[0]);
  const [lFreq,        setLFreq]        = useState('Weekly');
  const [lAlert,       setLAlert]       = useState('');
  const [lAction,      setLAction]      = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch('/api/environmental-monitoring?view=samples').then(r => r.json()),
        fetch('/api/environmental-monitoring?view=locations').then(r => r.json()),
      ]);
      if (sRes.success) setSamples(sRes.data || []);
      if (lRes.success) setLocations(lRes.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSubmitSample = async (e) => {
    e.preventDefault();
    if (!sLocationId) { toast.warn('Select a sampling location.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/environmental-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sample',
          location_id: sLocationId,
          sampled_at: new Date(sSampledAt).toISOString(),
          incubation_temp_c: sIncubTemp,
          incubation_hours: sIncubHrs,
          colony_count: sColonyCount !== '' ? parseInt(sColonyCount) : null,
          organism_identified: sOrganism || null,
          notes: sNotes || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (json.data?.result === 'Action') toast.error('ACTION LIMIT EXCEEDED — CAPA deviation auto-raised!');
      else if (json.data?.result === 'Alert') toast.warn('Alert limit reached — monitor closely.');
      else toast.success('EMP sample logged.');
      setShowSampleForm(false);
      setSLocationId(''); setSColonyCount(''); setSOrg(''); setSNotes('');
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleSubmitLocation = async (e) => {
    e.preventDefault();
    if (!lName || !lArea || !lMethod) { toast.warn('Name, area and method are required.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/environmental-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'location',
          name: lName, area: lArea, location_code: lCode, sampling_method: lMethod,
          frequency: lFreq, alert_limit_cfu: lAlert || null, action_limit_cfu: lAction || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Sampling location added.');
      setShowLocForm(false); setLName(''); setLCode('');
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  // Dashboard stats
  const last30 = samples.filter(s => new Date(s.sampled_at) > new Date(Date.now() - 30 * 86400000));
  const actionCount = last30.filter(s => s.result === 'Action').length;
  const alertCount  = last30.filter(s => s.result === 'Alert').length;
  const passCount   = last30.filter(s => s.result === 'Pass').length;

  if (authLoading || loading) return <div className="page-container flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>;

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Environmental Monitoring</h1>
          <p className="text-xs text-gray-500 mt-0.5">EMP — Scheduled microbial sampling of production environment</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => { setShowLocForm(v => !v); setShowSampleForm(false); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-xs uppercase tracking-wider transition-all">
              <MapPin className="w-3.5 h-3.5"/>Manage Locations
            </button>
          )}
          <button onClick={() => { setShowSampleForm(v => !v); setShowLocForm(false); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all shadow-sm">
            <Plus className="w-4 h-4"/>Log Sample
          </button>
        </div>
      </div>

      {/* 30-day summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Samples (30d)', value: last30.length, color: 'text-gray-800', bg: 'bg-gray-50' },
          { label: 'Pass',          value: passCount,     color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Alert Limit',   value: alertCount,    color: 'text-amber-700',   bg: 'bg-amber-50' },
          { label: 'Action Limit',  value: actionCount,   color: 'text-red-700',     bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`surface p-4 ${s.bg} text-center`}>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs font-bold text-gray-500 uppercase mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Log Sample Form */}
      {showSampleForm && (
        <div className="surface p-5 border-l-4 border-l-teal-500 space-y-4">
          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><Wind className="w-4 h-4 text-teal-600"/>Log EMP Sample</h3>
          <form onSubmit={handleSubmitSample} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Sampling Location <span className="text-red-500">*</span></label>
                <select value={sLocationId} onChange={e => setSLocationId(e.target.value)} className="field-input bg-white" required>
                  <option value="">Select location...</option>
                  {AREAS.map(area => {
                    const areaSites = locations.filter(l => l.area === area);
                    if (!areaSites.length) return null;
                    return (
                      <optgroup key={area} label={area}>
                        {areaSites.map(l => <option key={l.id} value={l.id}>{l.name} ({l.sampling_method}) {l.location_code ? `[${l.location_code}]` : ''}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="field-label">Sampled At</label>
                <input type="datetime-local" value={sSampledAt} onChange={e => setSSampledAt(e.target.value)} className="field-input"/>
              </div>
              <div>
                <label className="field-label">Incubation Temp (°C)</label>
                <input type="number" step="0.1" value={sIncubTemp} onChange={e => setSIncubTemp(e.target.value)} className="field-input" placeholder="37"/>
              </div>
              <div>
                <label className="field-label">Incubation Duration (hrs)</label>
                <input type="number" value={sIncubHrs} onChange={e => setSIncubHrs(e.target.value)} className="field-input" placeholder="48"/>
              </div>
              <div>
                <label className="field-label">Colony Count (CFU / plate)</label>
                <input type="number" value={sColonyCount} onChange={e => setSColonyCount(e.target.value)} className="field-input" placeholder="Leave blank if still incubating"/>
              </div>
              <div>
                <label className="field-label">Organism Identified (if any)</label>
                <input value={sOrganism} onChange={e => setSOrg(e.target.value)} className="field-input" placeholder="e.g. Bacillus spp."/>
              </div>
            </div>
            {sLocationId && sColonyCount !== '' && (() => {
              const loc = locations.find(l => l.id === sLocationId);
              const count = parseInt(sColonyCount);
              if (!loc) return null;
              if (loc.action_limit_cfu && count >= loc.action_limit_cfu) return <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-black text-red-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/>ACTION LIMIT EXCEEDED ({count} ≥ {loc.action_limit_cfu} CFU) — CAPA will be auto-raised</div>;
              if (loc.alert_limit_cfu && count >= loc.alert_limit_cfu) return <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">⚠ Alert limit reached ({count} ≥ {loc.alert_limit_cfu} CFU) — investigate and increase monitoring frequency</div>;
              return <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/>Within acceptable limits</div>;
            })()}
            <textarea value={sNotes} onChange={e => setSNotes(e.target.value)} rows={2} placeholder="Observations (morphology, colour, contamination notes)..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
                {submitting ? 'Logging...' : 'Save EMP Sample'}
              </button>
              <button type="button" onClick={() => setShowSampleForm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Add Location Form */}
      {showLocForm && isAdmin && (
        <div className="surface p-5 border-l-4 border-l-indigo-500 space-y-4">
          <h3 className="text-sm font-black text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-indigo-600"/>Add Sampling Location</h3>
          <form onSubmit={handleSubmitLocation} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="field-label">Location Name *</label><input value={lName} onChange={e => setLName(e.target.value)} className="field-input" placeholder="e.g. LAF-01 Left Corner" required/></div>
            <div><label className="field-label">Area *</label><select value={lArea} onChange={e => setLArea(e.target.value)} className="field-input bg-white">{AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
            <div><label className="field-label">Location Code</label><input value={lCode} onChange={e => setLCode(e.target.value)} className="field-input" placeholder="e.g. LAF-01"/></div>
            <div><label className="field-label">Sampling Method *</label><select value={lMethod} onChange={e => setLMethod(e.target.value)} className="field-input bg-white">{SAMPLING_METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
            <div><label className="field-label">Frequency</label><select value={lFreq} onChange={e => setLFreq(e.target.value)} className="field-input bg-white">{FREQUENCIES.map(f => <option key={f}>{f}</option>)}</select></div>
            <div><label className="field-label">Alert Limit (CFU)</label><input type="number" value={lAlert} onChange={e => setLAlert(e.target.value)} className="field-input" placeholder="e.g. 50"/></div>
            <div><label className="field-label">Action Limit (CFU)</label><input type="number" value={lAction} onChange={e => setLAction(e.target.value)} className="field-input" placeholder="e.g. 200"/></div>
            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">{submitting ? 'Saving...' : 'Add Location'}</button>
              <button type="button" onClick={() => setShowLocForm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Locations summary */}
      {locations.length > 0 && (
        <div className="surface p-4">
          <h3 className="text-xs font-black text-gray-600 uppercase tracking-wider mb-3">Registered Sampling Locations ({locations.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {locations.map(l => (
              <div key={l.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                <p className="font-black text-gray-900">{l.name} {l.location_code && <span className="text-gray-400 font-mono">[{l.location_code}]</span>}</p>
                <p className="text-gray-500 font-semibold">{l.area} · {l.sampling_method} · {l.frequency}</p>
                {(l.alert_limit_cfu || l.action_limit_cfu) && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Alert: {l.alert_limit_cfu || '—'} · Action: {l.action_limit_cfu || '—'} CFU</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample log */}
      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h3 className="text-sm font-black text-gray-900">Sample Log</h3>
          <span className="text-xs text-gray-400 font-semibold">{samples.length} total records</span>
        </div>
        {samples.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Wind className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="font-semibold text-sm">No EMP samples logged yet.</p>
            <p className="text-xs mt-1">Add sampling locations and log your first environmental sample.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead><tr className="bg-gray-50">
                <th className="px-4 py-2 text-left font-black text-gray-400 uppercase text-[9px]">Location</th>
                <th className="px-4 py-2 text-left font-black text-gray-400 uppercase text-[9px]">Method</th>
                <th className="px-4 py-2 text-left font-black text-gray-400 uppercase text-[9px]">Date</th>
                <th className="px-4 py-2 text-left font-black text-gray-400 uppercase text-[9px]">CFU</th>
                <th className="px-4 py-2 text-left font-black text-gray-400 uppercase text-[9px]">Result</th>
                <th className="px-4 py-2 text-left font-black text-gray-400 uppercase text-[9px]">By</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {samples.map(s => (
                  <tr key={s.id} className={s.result === 'Action' ? 'bg-red-50' : s.result === 'Alert' ? 'bg-amber-50/40' : 'hover:bg-gray-50/30'}>
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{s.emp_sampling_locations?.name || '—'}<br/><span className="text-[10px] text-gray-400">{s.emp_sampling_locations?.area}</span></td>
                    <td className="px-4 py-2.5 text-gray-600">{s.emp_sampling_locations?.sampling_method || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{new Date(s.sampled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    <td className="px-4 py-2.5 font-black text-gray-800">{s.colony_count ?? <span className="text-gray-300 font-semibold">Pending</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase ${RESULT_STYLE[s.result] || RESULT_STYLE.Pending}`}>{s.result}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {s.sampler && <CreatorBadge initials={s.sampler.initials} fullName={s.sampler.full_name} size="sm"/>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
