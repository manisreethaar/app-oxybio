'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Activity, Plus, AlertTriangle, CheckCircle2, Clock, Pencil, Trash2, X } from 'lucide-react';

const FLASK_COLORS = ['#1e3a5f', '#d97706', '#7c3aed', '#059669'];
const FOAM_OPTS = ['None','Slight','Moderate','Heavy'];
const APPEARANCE_OPTS = ['Normal','Colour change','Turbidity change','Separation observed'];

function PhChart({ readings }) {
  if (!readings.length) return (
    <div className="h-28 flex items-center justify-center text-xs text-gray-300 border border-dashed border-gray-200 rounded-xl">No readings yet — chart will appear here</div>
  );
  const valid = readings.filter(r => r.ph != null && r.elapsed_hours != null);
  if (!valid.length) return null;
  const W = 400, H = 140, PAD = { t: 12, r: 16, b: 24, l: 32 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const maxH = Math.max(...valid.map(r => r.elapsed_hours), 1);
  const allPh = valid.map(r => r.ph);
  const minPh = Math.max(3.0, Math.min(...allPh) - 0.3);
  const maxPh = Math.min(7.0, Math.max(...allPh) + 0.3);
  const xS = h  => PAD.l + (h / maxH) * cW;
  const yS = ph => PAD.t + cH - ((ph - minPh) / (maxPh - minPh)) * cH;
  const byFlask = {};
  valid.forEach(r => {
    const k = r.flask_label || 'All';
    (byFlask[k] = byFlask[k] || []).push(r);
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <rect x={PAD.l} y={yS(4.5)} width={cW} height={yS(4.2)-yS(4.5)} fill="#10b981" fillOpacity={0.07}/>
      <line x1={PAD.l} x2={W-PAD.r} y1={yS(4.2)} y2={yS(4.2)} stroke="#10b981" strokeWidth={0.5} strokeDasharray="2,2"/>
      <line x1={PAD.l} x2={W-PAD.r} y1={yS(4.5)} y2={yS(4.5)} stroke="#10b981" strokeWidth={0.5} strokeDasharray="2,2"/>
      {[3.5,4.0,4.5,5.0,5.5].map(ph => (
        <line key={ph} x1={PAD.l} x2={W-PAD.r} y1={yS(ph)} y2={yS(ph)} stroke="#f3f4f6" strokeWidth={0.8}/>
      ))}
      {Object.entries(byFlask).map(([label, pts], i) => {
        const sorted = [...pts].sort((a,b) => a.elapsed_hours - b.elapsed_hours);
        const d = sorted.map((p,j) => `${j===0?'M':'L'}${xS(p.elapsed_hours).toFixed(1)},${yS(p.ph).toFixed(1)}`).join(' ');
        const col = FLASK_COLORS[i % FLASK_COLORS.length];
        return (
          <g key={label}>
            <path d={d} stroke={col} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            {sorted.map((p,j) => (
              <circle key={j} cx={xS(p.elapsed_hours)} cy={yS(p.ph)} r={3}
                fill={p.is_ph_alarm?'#ef4444':col} stroke="white" strokeWidth={1.2}/>
            ))}
          </g>
        );
      })}
      {[3.5,4.0,4.5,5.0,5.5].filter(ph => ph>=minPh&&ph<=maxPh).map(ph => (
        <text key={ph} x={PAD.l-4} y={yS(ph)} textAnchor="end" dominantBaseline="middle" fontSize={8} fill="#9ca3af">{ph.toFixed(1)}</text>
      ))}
      {[0, Math.round(maxH/2), Math.round(maxH)].map(h => (
        <text key={h} x={xS(h)} y={H-4} textAnchor="middle" fontSize={8} fill="#9ca3af">T+{h}h</text>
      ))}
      {Object.keys(byFlask).map((label, i) => (
        <g key={label} transform={`translate(${PAD.l + i*40}, ${PAD.t})`}>
          <rect x={0} y={0} width={10} height={3} fill={FLASK_COLORS[i%FLASK_COLORS.length]} rx={1}/>
          <text x={13} y={4} fontSize={8} fill="#6b7280">{label}</text>
        </g>
      ))}
      <text x={W-PAD.r} y={yS(4.35)} textAnchor="end" fontSize={7} fill="#10b981">Target 4.2–4.5</text>
    </svg>
  );
}

export default function FermentationPanel({ batch, flasks, activeFlask, employees, employeeProfile, role, canDo, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading }) {
  const toast = useToast();
  const [readings,  setReadings]  = useState([]);
  const [inocu,     setInocu]     = useState(null);
  const [endpoint,  setEndpoint]  = useState(null);
  const [saving,    setSaving]    = useState(false);

  // Reading form
  const [pH,         setPH]         = useState('');
  const [temp,       setTemp]       = useState('');
  const [brix,       setBrix]       = useState('');
  const [od,         setOd]         = useState('');
  const [platingStatus, setPlatingStatus] = useState('Pending');
  const [cfuCount,   setCfuCount]   = useState('');
  const [foam,       setFoam]       = useState('None');
  const [appearance, setAppearance] = useState('Normal');
  const [notes,      setNotes]      = useState('');
  const [supervisedBy, setSupervisedBy] = useState('');
  const [isRetro,    setIsRetro]    = useState(false);
  const [retroReason, setRetroReason] = useState('');
  const [loggedAt,   setLoggedAt]   = useState('');

  // Endpoint form
  const [showEndpoint, setShowEndpoint] = useState(false);
  const [epPh,       setEpPh]       = useState('');
  const [aroma,      setAroma]      = useState('Tangy and clean');
  const [texture,    setTexture]    = useState('Normal slurry');
  const [sensory,    setSensory]    = useState('PASS');
  const [gramStain,  setGramStain]  = useState('Not done');
  const [colourDesc, setColourDesc] = useState('');
  const [epNotes,    setEpNotes]    = useState('');
  const [savingEp,   setSavingEp]   = useState(false);
  const [pendingOOROverride, setPendingOOROverride] = useState(false);
  const [endpointTime, setEndpointTime] = useState('');

  // Admin edit/delete state
  const [editingReading,  setEditingReading]  = useState(null);
  const [editFields,      setEditFields]      = useState({});
  const [editReason,      setEditReason]      = useState('');
  const [savingEdit,      setSavingEdit]      = useState(false);
  const [deletingReading, setDeletingReading] = useState(null);
  const [deleteReason,    setDeleteReason]    = useState('');
  const [savingDelete,    setSavingDelete]    = useState(false);

  const isAdmin  = ['admin','ceo','cto'].includes(role);
  const isIntern = ['intern','research_intern'].includes(role);

  const fetchData = useCallback(async () => {
    if (!activeFlask) return;
    const [rRes, iRes, epRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('*').eq('batch_id', batch.id).order('logged_at'),
      supabase.from('batch_flask_inoculations').select('*').eq('flask_id', activeFlask.id).single(),
      supabase.from('batch_flask_endpoints').select('*').eq('flask_id', activeFlask.id).single(),
    ]);
    if (rRes.data) setReadings(rRes.data);
    if (iRes.data) setInocu(iRes.data);
    setEndpoint(epRes.data ?? null);
  }, [batch.id, activeFlask, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    // Clear endpoint form whenever the active flask changes
    setEpPh('');
    setAroma('Tangy and clean');
    setTexture('Normal slurry');
    setSensory('PASS');
    setGramStain('Not done');
    setColourDesc('');
    setEpNotes('');
    setShowEndpoint(false);
    setPendingOOROverride(false);
    setEndpointTime('');
  }, [activeFlask?.id]);

  // Elapsed hours from T=0 specific to THIS flask
  const tZero     = inocu?.t_zero_time ? new Date(inocu.t_zero_time) : null;
  const elapsedHr = tZero ? ((new Date() - tZero) / 3600000) : null;
  const maxExceeded = elapsedHr != null && elapsedHr > (inocu?.planned_fermentation_hrs || 24);
  const latestAlarm = readings.filter(r => r.flask_id === activeFlask?.id).some(r => r.is_ph_alarm || r.is_temp_alarm);

  const handleLogReading = async (e) => {
    e.preventDefault();
    if (!pH || saving || !activeFlask) return;
    if (isIntern && !supervisedBy) { toast.warn('Select a supervisor before submitting.'); return; }
    const elapsed = tZero ? (new Date(isRetro && loggedAt ? loggedAt : new Date()) - tZero) / 3600000 : null;
    
    setSaving(true);
    try {
      const phVal = parseFloat(pH);
      const isAlarm = phVal < 3.8 || phVal > 5.5;
      
      const { error } = await supabase.from('batch_fermentation_readings').insert({
        batch_id: batch.id, flask_id: activeFlask.id, flask_label: activeFlask.flask_label,
        ph: phVal, incubator_temp_c: temp ? parseFloat(temp) : null,
        brix: brix ? parseFloat(brix) : null, optical_density: od ? parseFloat(od) : null,
        plating_result: `${platingStatus}${cfuCount ? ` — ${cfuCount}` : ''}`,
        foam_level: foam, visual_appearance: appearance,
        elapsed_hours: elapsed ? parseFloat(elapsed.toFixed(2)) : null,
        logged_at: isRetro && loggedAt ? loggedAt : new Date().toISOString(),
        is_ph_alarm: isAlarm,
        is_retrospective: isRetro, retro_reason: isRetro ? retroReason : null,
        supervised_by: supervisedBy || null, notes: notes || null,
        logged_by: employeeProfile?.id
      });
      if (error) throw error;
      toast.success('Reading logged.');
      setPH(''); setTemp(''); setBrix(''); setOd(''); setPlatingStatus('Pending'); setCfuCount(''); setNotes(''); setIsRetro(false); setRetroReason(''); setLoggedAt('');
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleEndpoint = async (e) => {
    e.preventDefault();
    if (!epPh || savingEp) return;
    const finalPh = parseFloat(epPh);
    const phOOR = finalPh < 4.2 || finalPh > 4.5;
    if (phOOR) {
      setPendingOOROverride(true);
      return;
    }
    await executeEndpoint();
  };

  const confirmOOROverride = async () => {
    setPendingOOROverride(false);
    await executeEndpoint();
  };

  const executeEndpoint = async () => {
    const finalPh = parseFloat(epPh);
    setSavingEp(true);
    try {
      const epData = {
        flask_id: activeFlask.id, batch_id: batch.id,
        total_hours: tZero ? parseFloat(((( endpointTime ? new Date(endpointTime) : new Date()) - tZero) / 3600000).toFixed(2)) : null,
        final_ph: finalPh, aroma, colour_desc: colourDesc,
        texture, sensory_overall: sensory, gram_stain: gramStain, 
        notes: epNotes, declared_by: employeeProfile?.id,
      };
      const { error: epErr } = await supabase.from('batch_flask_endpoints').upsert(epData, { onConflict: 'flask_id' });
      if (epErr) throw epErr;
      
      toast.success(`Endpoint declared for ${activeFlask.flask_label}.`);
      setEndpointTime('');
      fetchData(); onDataSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSavingEp(false); }
  };

  const openEdit = (r) => {
    setEditingReading(r);
    const platingParts = r.plating_result?.split(' — ') || [];
    setEditFields({
      ph: r.ph ?? '', incubator_temp_c: r.incubator_temp_c ?? '',
      brix: r.brix ?? '', optical_density: r.optical_density ?? '',
      foam_level: r.foam_level ?? 'None', visual_appearance: r.visual_appearance ?? 'Normal',
      plating_status: platingParts[0] || 'Pending', cfu_count: platingParts[1] || '',
      notes: r.notes ?? '', logged_at: r.logged_at ? r.logged_at.slice(0,16) : '',
      is_retrospective: r.is_retrospective ?? false, retro_reason: r.retro_reason ?? '',
    });
    setEditReason('');
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editReason.trim()) { toast.warn('A reason for the edit is required.'); return; }
    setSavingEdit(true);
    try {
      let newElapsedHours = undefined;
      if (editFields.logged_at && tZero) {
        newElapsedHours = parseFloat(((new Date(editFields.logged_at) - tZero) / 3600000).toFixed(2));
      }
      const updates = {
        ph: editFields.ph !== '' ? parseFloat(editFields.ph) : undefined,
        incubator_temp_c: editFields.incubator_temp_c !== '' ? parseFloat(editFields.incubator_temp_c) : undefined,
        brix: editFields.brix !== '' ? parseFloat(editFields.brix) : undefined,
        optical_density: editFields.optical_density !== '' ? parseFloat(editFields.optical_density) : undefined,
        foam_level: editFields.foam_level || undefined,
        visual_appearance: editFields.visual_appearance || undefined,
        plating_result: editFields.plating_status
          ? `${editFields.plating_status}${editFields.cfu_count ? ` — ${editFields.cfu_count}` : ''}` : undefined,
        notes: editFields.notes || undefined,
        logged_at: editFields.logged_at ? new Date(editFields.logged_at).toISOString() : undefined,
        elapsed_hours: newElapsedHours !== undefined ? newElapsedHours : undefined,
        is_retrospective: editFields.is_retrospective,
        retro_reason: editFields.retro_reason || undefined,
      };
      Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
      const { error } = await supabase.rpc('update_fermentation_reading', {
        p_reading_id: editingReading.id, p_updates: updates, p_reason: editReason,
      });
      if (error) throw error;
      toast.success('Reading updated.');
      setEditingReading(null);
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSavingEdit(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteReason.trim()) { toast.warn('A reason for deletion is required.'); return; }
    setSavingDelete(true);
    try {
      const { error } = await supabase.rpc('delete_fermentation_reading', {
        p_reading_id: deletingReading.id, p_reason: deleteReason,
      });
      if (error) throw error;
      toast.success('Reading deleted.');
      setDeletingReading(null); setDeleteReason('');
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSavingDelete(false); }
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Fermentation details.</div>;

  return (
    <div className="space-y-5">
      {/* Header + alarms */}
      <div className="surface p-5 border-l-4 border-l-navy">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-navy"/>
            <h2 className="text-base font-bold text-gray-900">Fermentation: <span className="text-navy">{activeFlask.flask_label}</span></h2>
            {tZero && <span className="px-2 py-0.5 bg-navy/5 border border-navy/20 rounded text-[10px] font-black text-navy">{elapsedHr?.toFixed(1)}hr Elapsed</span>}
          </div>
          {!endpoint && tZero && (
            <button onClick={() => { setShowEndpoint(s => !s); if (showEndpoint) setEndpointTime(''); }} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${showEndpoint ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-navy'}`}>
              {showEndpoint ? 'Cancel Endpoint' : 'Declare Endpoint'}
            </button>
          )}
        </div>
        {!tZero && <p className="text-xs text-red-500 font-bold mt-2">Error: T=0 has not been set for this trial!</p>}
        {endpoint && <div className="flex items-center gap-2 mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg"><CheckCircle2 className="w-4 h-4 text-emerald-600"/><span className="text-xs font-bold text-emerald-800">Endpoint declared — Final pH: {endpoint.final_ph} · {endpoint.total_hours?.toFixed(1)}hr total</span></div>}
        {latestAlarm && <div className="flex items-start gap-2 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/><span className="text-xs font-bold text-red-800">⚠ Active alarm — a recent reading for this flask is out of bounds.</span></div>}
        {maxExceeded && !endpoint && <div className="flex items-start gap-2 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"><Clock className="w-4 h-4 text-amber-600 shrink-0"/><span className="text-xs font-bold text-amber-800">Planned fermentation duration exceeded. Time to declare endpoint?</span></div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Reading Log Form ── */}
        {!endpoint && tZero && (
          <div className="surface overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Log Reading for {activeFlask.flask_label}</h3>
            </div>
            <form onSubmit={handleLogReading} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">pH Value <span className="text-red-500">★ CCP</span></label>
                <input type="number" step="0.01" min="0" max="14" required value={pH} onChange={e=>setPH(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-3xl font-black font-mono tracking-tighter text-gray-800 focus:border-navy outline-none text-center" placeholder="0.00"/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Temp (°C)</label>
                  <input type="number" step="0.1" value={temp} onChange={e=>setTemp(e.target.value)} placeholder="37.0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Brix (°Bx)</label>
                  <input type="number" step="0.1" value={brix} onChange={e=>setBrix(e.target.value)} placeholder="10.5" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">OD (600nm)</label>
                  <input type="number" step="0.001" value={od} onChange={e=>setOd(e.target.value)} placeholder="0.500" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Foam</label>
                  <select value={foam} onChange={e=>setFoam(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {FOAM_OPTS.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Plating Status</label>
                  <select value={platingStatus} onChange={e=>setPlatingStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {['Pending', 'Clear', 'Contaminated', 'Not Done'].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">CFU Count</label>
                  <input type="text" value={cfuCount} onChange={e=>setCfuCount(e.target.value)} placeholder="e.g. 1.2 x 10^6" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Visual Appearance</label>
                <select value={appearance} onChange={e=>setAppearance(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                  {APPEARANCE_OPTS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="retro" checked={isRetro} onChange={e=>setIsRetro(e.target.checked)} className="w-4 h-4 rounded border-gray-300"/>
                <label htmlFor="retro" className="text-xs font-semibold text-gray-600">Retrospective entry</label>
              </div>
              {isRetro && (
                <div className="space-y-2 pl-6">
                  <input type="datetime-local" value={loggedAt} onChange={e=>setLoggedAt(e.target.value)} className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs font-semibold outline-none"/>
                  <input placeholder="Reason for retrospective entry (required)" value={retroReason} onChange={e=>setRetroReason(e.target.value)} className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs font-semibold outline-none"/>
                </div>
              )}
              {isIntern && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-red-500 mb-1">Supervised By <span className="text-red-500">*Required</span></label>
                  <select value={supervisedBy} onChange={e=>setSupervisedBy(e.target.value)} required className="w-full px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-red-400">
                    <option value="">Select supervising scientist...</option>
                    {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
              )}
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none"/>
              <button type="submit" disabled={saving||!pH} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5"/>{saving ? 'Logging...' : 'Commit Reading'}
              </button>
            </form>
          </div>
        )}

        {/* ── Chart + Reading Table (Shows All Flasks' graph context) ── */}
        <div className="surface overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Trial Trends</h3>
          </div>
          <div className="p-4">
            <PhChart readings={readings}/>
          </div>
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="min-w-full divide-y divide-gray-100">
              <thead><tr className="bg-gray-50/50">
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Flask</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">T+hr</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">pH</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Temp</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Brix</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">OD</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Plating</th>
                {isAdmin && <th className="px-4 py-2 text-left text-[9px] font-bold text-gray-400 uppercase">Actions</th>}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[...readings].filter(r => r.flask_id === activeFlask.id).reverse().map(r => (
                  <tr key={r.id} className={r.is_ph_alarm ? 'bg-red-50' : 'hover:bg-gray-50/30'}>
                    <td className="px-4 py-2 text-xs font-black text-navy whitespace-nowrap">
                      {r.flask_label}
                      {r.is_retrospective && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-bold">RETRO</span>}
                      {r.edit_reason && <span className="ml-1 px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] font-bold" title={`Edited: ${r.edit_reason}`}>EDITED</span>}
                    </td>
                    <td className="px-4 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">T+{r.elapsed_hours?.toFixed(1)}h</td>
                    <td className={`px-4 py-2 text-sm font-black tabular-nums whitespace-nowrap ${r.is_ph_alarm?'text-red-600':'text-gray-900'}`}>{r.ph}</td>
                    <td className={`px-4 py-2 text-xs font-semibold whitespace-nowrap ${r.is_temp_alarm?'text-amber-600':'text-gray-600'}`}>{r.incubator_temp_c ? `${r.incubator_temp_c}°C` : '—'}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">{r.brix ? `${r.brix}` : '—'}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">{r.optical_density ? `${r.optical_density}` : '—'}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-gray-600 truncate max-w-[120px]" title={r.plating_result || ''}>{r.plating_result || '—'}</td>
                    {isAdmin && (
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(r)} title="Edit reading"
                            className="p-1 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors">
                            <Pencil className="w-3 h-3"/>
                          </button>
                          <button onClick={() => { setDeletingReading(r); setDeleteReason(''); }} title="Delete reading"
                            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-3 h-3"/>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {readings.filter(r => r.flask_id === activeFlask.id).length===0 && <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-6 text-center text-xs text-gray-400">No readings yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Endpoint Declaration ── */}
      {!endpoint && showEndpoint && (
        <div className="surface overflow-hidden border-2 border-navy/20">
          <div className="px-5 py-4 border-b border-gray-100 bg-navy/5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-navy"/>
            <h3 className="text-sm font-bold text-gray-900">Declare Endpoint for {activeFlask.flask_label}</h3>
          </div>
          <form onSubmit={handleEndpoint} className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Final pH</label>
                <input type="number" step="0.01" required value={epPh} onChange={e=>setEpPh(e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-xl text-2xl font-black font-mono text-center outline-none ${parseFloat(epPh)<4.2||parseFloat(epPh)>4.5?'border-red-400 text-red-600':'border-gray-200 text-gray-800 focus:border-navy'}`} placeholder="4.30"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Fermentation End Time</label>
                <input
                  type="datetime-local"
                  value={endpointTime}
                  max={new Date().toISOString().slice(0,16)}
                  onChange={e => setEndpointTime(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-navy"
                />
                {tZero && (() => {
                  const t = endpointTime ? new Date(endpointTime) : new Date();
                  const hrs = (t - tZero) / 3600000;
                  return (
                    <p className="text-[10px] mt-1 font-black text-navy text-center">
                      Total: {hrs.toFixed(1)} hr  {!endpointTime && <span className="text-amber-500">(using now — set end time for retrospective batches)</span>}
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Aroma</label>
                <select value={aroma} onChange={e=>setAroma(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Tangy and clean','Mild','Off-odour detected'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Texture</label>
                <select value={texture} onChange={e=>setTexture(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Normal slurry','Over-separated','Clumped'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Colour Description</label>
                <input value={colourDesc} onChange={e=>setColourDesc(e.target.value)} placeholder="e.g. Reddish-purple" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none"/>
              </div>
              <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Gram Stain</label>
                <select value={gramStain} onChange={e=>setGramStain(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Gram-positive rods dominant','Mixed','Gram-negative dominant','Not done'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[{label:'Sensory Overall',val:sensory,set:setSensory,opts:['PASS','FAIL']}].map(f=>(
                <div key={f.label}><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">{f.label}</label>
                  <div className="flex gap-2">
                    {f.opts.map(o=><button type="button" key={o} onClick={()=>f.set(o)} className={`flex-1 py-2 text-xs font-black rounded-lg border transition-all ${f.val===o?(o==='PASS'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>{o}</button>)}
                  </div>
                </div>
              ))}
            </div>
            <textarea value={epNotes} onChange={e=>setEpNotes(e.target.value)} rows={2} placeholder="Endpoint notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
            <div className="grid grid-cols-1 gap-3">
              <button type="submit" disabled={savingEp} className="py-3 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
                {savingEp ? 'Saving...' : 'Save Endpoint Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Advance button (after endpoint declared) */}
      {endpoint && (
        <div className="surface p-5 flex items-center justify-between">
          <div className="text-sm">
            <p className="font-bold text-gray-900">Endpoint declared ✓</p>
            <p className="text-gray-500 text-xs">Final pH: {endpoint.final_ph} · {endpoint.total_hours?.toFixed(1)}hr total fermentation</p>
          </div>
          <button disabled={actionLoading} onClick={() => onAdvanceFlaskStage('straining')} className="px-5 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
            Advance Trial → Straining
          </button>
        </div>
      )}

      {/* ── Admin Edit Reading Modal ── */}
      {editingReading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Edit Reading — {editingReading.flask_label} T+{editingReading.elapsed_hours?.toFixed(1)}h</h3>
              <button onClick={() => setEditingReading(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-400"/></button>
            </div>
            <form onSubmit={handleEditSave} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">pH <span className="text-red-500">★ CCP</span></label>
                  <input type="number" step="0.01" min="0" max="14" value={editFields.ph}
                    onChange={e => setEditFields(f => ({...f, ph: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Temp (°C)</label>
                  <input type="number" step="0.1" value={editFields.incubator_temp_c}
                    onChange={e => setEditFields(f => ({...f, incubator_temp_c: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Brix (°Bx)</label>
                  <input type="number" step="0.1" value={editFields.brix}
                    onChange={e => setEditFields(f => ({...f, brix: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">OD (600nm)</label>
                  <input type="number" step="0.001" value={editFields.optical_density}
                    onChange={e => setEditFields(f => ({...f, optical_density: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Foam</label>
                  <select value={editFields.foam_level} onChange={e => setEditFields(f => ({...f, foam_level: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {FOAM_OPTS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Visual Appearance</label>
                  <select value={editFields.visual_appearance} onChange={e => setEditFields(f => ({...f, visual_appearance: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {APPEARANCE_OPTS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Plating Status</label>
                  <select value={editFields.plating_status} onChange={e => setEditFields(f => ({...f, plating_status: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {['Pending','Clear','Contaminated','Not Done'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">CFU Count</label>
                  <input value={editFields.cfu_count} onChange={e => setEditFields(f => ({...f, cfu_count: e.target.value}))}
                    placeholder="e.g. 1.2 x 10^6"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Reading Timestamp</label>
                <input type="datetime-local" value={editFields.logged_at}
                  onChange={e => setEditFields(f => ({...f, logged_at: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Notes</label>
                <input value={editFields.notes} onChange={e => setEditFields(f => ({...f, notes: e.target.value}))}
                  placeholder="Notes (optional)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
              </div>
              <div className="pt-1 border-t border-gray-100">
                <label className="block text-[10px] font-bold uppercase text-red-500 mb-1">Reason for Edit <span>*Required</span></label>
                <input required value={editReason} onChange={e => setEditReason(e.target.value)}
                  placeholder="Why is this reading being corrected?"
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-semibold outline-none focus:border-red-400"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditingReading(null)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={savingEdit}
                  className="flex-1 py-2 bg-navy text-white rounded-lg text-sm font-bold hover:bg-navy-hover disabled:opacity-50">
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Admin Delete Reading Modal ── */}
      {deletingReading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-red-600 mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4"/> Delete Reading
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>{deletingReading.flask_label}</strong> reading at <strong>T+{deletingReading.elapsed_hours?.toFixed(1)}h</strong> (pH {deletingReading.ph})?
              This cannot be undone but will be logged in the audit trail.
            </p>
            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase text-red-500 mb-1">Reason <span>*Required</span></label>
              <input value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                placeholder="Why is this reading being deleted?"
                className="w-full px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-semibold outline-none focus:border-red-400"/>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeletingReading(null); setDeleteReason(''); }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteConfirm} disabled={savingDelete || !deleteReason.trim()}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                {savingDelete ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Out of Range Override Modal */}
      {pendingOOROverride && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-amber-600 mb-2 text-center flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5"/> pH Alert
            </h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Final pH <strong className="text-amber-600">{epPh}</strong> is outside the target range of 4.2–4.5. Confirm and proceed with endpoint declaration anyway?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingOOROverride(false)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmOOROverride}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition w-full"
              >
                ⚠ Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
