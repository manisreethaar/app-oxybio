'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { useData } from '@/lib/hooks/useData';
import { Activity, Plus, AlertTriangle, CheckCircle2, Clock, Pencil, Trash2, X, Timer, Droplet } from 'lucide-react';
import EditRequestButton from '@/components/ui/EditRequestButton';
import CreatorBadge from '@/components/ui/CreatorBadge';
import {
  calculateElapsedHours,
  validateEndpointPayload,
  validateReadingPayload,
} from '@/lib/fermentation/validation';

const FLASK_COLORS = ['#1e3a5f', '#d97706', '#7c3aed', '#059669'];
const FOAM_OPTS = ['None','Slight','Moderate','Heavy'];
const APPEARANCE_OPTS = ['Normal','Colour change','Turbidity change','Separation observed'];

function PhChart({ readings, loading = false, comparisonData = {} }) {
  if (loading) return (
    <div className="h-28 flex items-center justify-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-xl animate-pulse">Loading…</div>
  );
  if (!readings.length) return (
    <div className="h-28 flex items-center justify-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-xl">No readings yet — chart will appear here</div>
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
      {/* A-33: Historical batch comparison overlays */}
      {Object.entries(comparisonData).map(([batchLabel, pts], idx) => {
        const sorted = [...pts].sort((a,b) => a.elapsed_hours - b.elapsed_hours).filter(p => p.ph >= minPh && p.ph <= maxPh && p.elapsed_hours <= maxH);
        if (!sorted.length) return null;
        const d = sorted.map((p,j) => `${j===0?'M':'L'}${xS(p.elapsed_hours).toFixed(1)},${yS(p.ph).toFixed(1)}`).join(' ');
        const compColors = ['#7c3aed','#059669','#b45309'];
        return (
          <g key={`comp-${batchLabel}`} opacity={0.35}>
            <path d={d} stroke={compColors[idx%compColors.length]} strokeWidth={1.5} fill="none" strokeDasharray="5,3" strokeLinecap="round"/>
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

// G-87: OD trend chart
function OdChart({ readings }) {
  const valid = readings.filter(r => r.optical_density != null && r.elapsed_hours != null);
  if (!valid.length) return null;
  const W = 400, H = 90, PAD = { t: 8, r: 16, b: 18, l: 32 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const maxH = Math.max(...valid.map(r => r.elapsed_hours), 1);
  const allOd = valid.map(r => r.optical_density);
  const minOd = Math.max(0, Math.min(...allOd) - 0.05);
  const maxOd = Math.max(...allOd) + 0.05;
  const xS = h => PAD.l + (h / maxH) * cW;
  const yS = v => PAD.t + cH - ((v - minOd) / (maxOd - minOd)) * cH;
  const byFlask = {};
  valid.forEach(r => { const k = r.flask_label || 'All'; (byFlask[k] = byFlask[k] || []).push(r); });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {Object.entries(byFlask).map(([label, pts], i) => {
        const sorted = [...pts].sort((a,b) => a.elapsed_hours - b.elapsed_hours);
        const d = sorted.map((p,j) => `${j===0?'M':'L'}${xS(p.elapsed_hours).toFixed(1)},${yS(p.optical_density).toFixed(1)}`).join(' ');
        const col = FLASK_COLORS[i % FLASK_COLORS.length];
        return (
          <g key={label}>
            <path d={d} stroke={col} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2,3"/>
            {sorted.map((p,j) => <circle key={j} cx={xS(p.elapsed_hours)} cy={yS(p.optical_density)} r={2} fill={col} stroke="white" strokeWidth={0.8}/>)}
          </g>
        );
      })}
      {[minOd, (minOd+maxOd)/2, maxOd].map(v => <text key={v} x={PAD.l-4} y={yS(v)} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="#9ca3af">{v.toFixed(2)}</text>)}
      {[0, Math.round(maxH/2), Math.round(maxH)].map(h => <text key={h} x={xS(h)} y={H-1} textAnchor="middle" fontSize={7} fill="#9ca3af">T+{h}h</text>)}
      <text x={W-PAD.r} y={PAD.t+4} textAnchor="end" fontSize={7} fill="#6b7280">OD</text>
    </svg>
  );
}

// G-88: Temperature trend chart
function TempChart({ readings }) {
  const valid = readings.filter(r => r.incubator_temp_c != null && r.elapsed_hours != null);
  if (!valid.length) return null;
  const W = 400, H = 90, PAD = { t: 8, r: 16, b: 18, l: 32 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const maxH = Math.max(...valid.map(r => r.elapsed_hours), 1);
  const temps = valid.map(r => r.incubator_temp_c);
  const minT = Math.max(34, Math.min(...temps) - 0.5);
  const maxT = Math.min(42, Math.max(...temps) + 0.5);
  const xS = h => PAD.l + (h / maxH) * cW;
  const yS = v => PAD.t + cH - ((v - minT) / (maxT - minT)) * cH;
  const byFlask = {};
  valid.forEach(r => { const k = r.flask_label || 'All'; (byFlask[k] = byFlask[k] || []).push(r); });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Target range band 36-38°C */}
      <rect x={PAD.l} y={yS(38)} width={cW} height={Math.max(0,yS(36)-yS(38))} fill="#f59e0b" fillOpacity={0.1}/>
      <line x1={PAD.l} x2={W-PAD.r} y1={yS(38)} y2={yS(38)} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="2,2"/>
      <line x1={PAD.l} x2={W-PAD.r} y1={yS(36)} y2={yS(36)} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="2,2"/>
      {Object.entries(byFlask).map(([label, pts], i) => {
        const sorted = [...pts].sort((a,b) => a.elapsed_hours - b.elapsed_hours);
        const d = sorted.map((p,j) => `${j===0?'M':'L'}${xS(p.elapsed_hours).toFixed(1)},${yS(p.incubator_temp_c).toFixed(1)}`).join(' ');
        const col = FLASK_COLORS[i % FLASK_COLORS.length];
        return (
          <g key={label}>
            <path d={d} stroke={col} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            {sorted.map((p,j) => <circle key={j} cx={xS(p.elapsed_hours)} cy={yS(p.incubator_temp_c)} r={2.5} fill={p.is_temp_alarm?'#ef4444':col} stroke="white" strokeWidth={0.8}/>)}
          </g>
        );
      })}
      {[minT, (minT+maxT)/2, maxT].filter(v=>!isNaN(v)).map(v => <text key={v} x={PAD.l-4} y={yS(v)} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="#9ca3af">{v.toFixed(0)}°C</text>)}
      {[0, Math.round(maxH/2), Math.round(maxH)].map(h => <text key={h} x={xS(h)} y={H-1} textAnchor="middle" fontSize={7} fill="#9ca3af">T+{h}h</text>)}
      <text x={W-PAD.r} y={PAD.t+4} textAnchor="end" fontSize={7} fill="#f59e0b">36–38°C</text>
    </svg>
  );
}

// G-33: Brix trend chart
function BrixChart({ readings }) {
  const valid = readings.filter(r => r.brix != null && r.elapsed_hours != null);
  if (!valid.length) return (
    <div className="h-20 flex items-center justify-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-xl">No Brix readings yet</div>
  );
  const W = 400, H = 100, PAD = { t: 10, r: 16, b: 20, l: 32 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const maxH = Math.max(...valid.map(r => r.elapsed_hours), 1);
  const allBrix = valid.map(r => r.brix);
  const minB = Math.max(0, Math.min(...allBrix) - 1);
  const maxB = Math.max(...allBrix) + 1;
  const xS = h  => PAD.l + (h / maxH) * cW;
  const yS = b  => PAD.t + cH - ((b - minB) / (maxB - minB)) * cH;
  const byFlask = {};
  valid.forEach(r => { const k = r.flask_label || 'All'; (byFlask[k] = byFlask[k] || []).push(r); });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {Object.entries(byFlask).map(([label, pts], i) => {
        const sorted = [...pts].sort((a,b) => a.elapsed_hours - b.elapsed_hours);
        const d = sorted.map((p,j) => `${j===0?'M':'L'}${xS(p.elapsed_hours).toFixed(1)},${yS(p.brix).toFixed(1)}`).join(' ');
        const col = FLASK_COLORS[i % FLASK_COLORS.length];
        return (
          <g key={label}>
            <path d={d} stroke={col} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2"/>
            {sorted.map((p,j) => <circle key={j} cx={xS(p.elapsed_hours)} cy={yS(p.brix)} r={2.5} fill={col} stroke="white" strokeWidth={1}/>)}
          </g>
        );
      })}
      {[minB, Math.round((minB+maxB)/2), maxB].filter(v=>!isNaN(v)).map(b => (
        <text key={b} x={PAD.l-4} y={yS(b)} textAnchor="end" dominantBaseline="middle" fontSize={7} fill="#9ca3af">{b.toFixed(0)}</text>
      ))}
      {[0, Math.round(maxH/2), Math.round(maxH)].map(h => (
        <text key={h} x={xS(h)} y={H-2} textAnchor="middle" fontSize={7} fill="#9ca3af">T+{h}h</text>
      ))}
      <text x={W-PAD.r} y={PAD.t+4} textAnchor="end" fontSize={7} fill="#6b7280">°Bx</text>
    </svg>
  );
}

export default function FermentationPanel({ batch, flasks, activeFlask, employees, employeeProfile, role, canDo, supabase, onDataSaved, onAdvanceFlaskStage, actionLoading, setGlobalError }) {
  const toast = useToast();
  const [readings,  setReadings]  = useState([]);
  const [inocu,     setInocu]     = useState(null);
  const [endpoint,  setEndpoint]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [loadingReadings, setLoadingReadings] = useState(true);

  // A-33: inter-batch comparison
  const [comparisonData, setComparisonData] = useState({});
  const [showComparison, setShowComparison] = useState(false);

  // Feed log (pH correction / nutrient addition)
  const [feeds,         setFeeds]         = useState([]);
  const [showFeedForm,  setShowFeedForm]  = useState(false);
  const [savingFeed,    setSavingFeed]    = useState(false);

  const [incubatorId,   setIncubatorId]   = useState('');

  // Form state
  const form = useForm({
    defaultValues: {
      pH: '', temp: '', brix: '', od: '', ta: '', doPercent: '', co2Pressure: '',
      co2Observed: '', ethanolPct: '', foam: 'None', appearance: 'Normal',
      platingIntent: null, plateMedia: '', plateDilution: '', plateCount: '2',
      plateTemp: '37', plateExpectedHours: '48', notes: '', supervisedBy: '',
      isRetro: false, retroReason: '', loggedAt: '',
      feedType: 'pH Correction', feedVolMl: '', feedPhBefore: '', feedPhAfter: '', feedReason: '',
      epPh: '', aroma: 'Tangy and clean', texture: 'Normal slurry', sensory: 'PASS',
      gramStain: 'Not done', gramStainImg: '', epTa: '', colourDesc: '', epNotes: '', endpointTime: '',
      editReason: '', deleteReason: '', epEditHours: '', epEditPh: ''
    }
  });
  const { register, handleSubmit, watch, reset, setValue, getValues } = form;

  // Watched fields for conditional rendering (only watching these prevents typing lag)
  const isRetro = watch('isRetro');
  const loggedAt = watch('loggedAt');
  const platingIntent = watch('platingIntent');
  const supervisedBy = watch('supervisedBy');
  const foam = watch('foam');
  const appearance = watch('appearance');
  const epPh = watch('epPh');
    const editReason = watch('editReason');
  const pH = watch('pH');
  const temp = watch('temp');
  const co2Observed = watch('co2Observed');
  const endpointTime = watch('endpointTime');
  const sensory = watch('sensory');

  const [platingDone, setPlatingDone] = useState(false);

  // Pending plating banner — set when last reading has unresolved plating
  const [pendingPlatingReading, setPendingPlatingReading] = useState(null);
  const [resolvingPlating, setResolvingPlating] = useState(false);
  // G-05: track whether fermentation-exceeded push has been sent for this flask
  const [exceededNotifSent, setExceededNotifSent] = useState(false);

  // Endpoint form
  const [showEndpoint, setShowEndpoint] = useState(false);
  // G-30: TA at endpoint
  const [savingEp,   setSavingEp]   = useState(false);
  const [pendingOOROverride, setPendingOOROverride] = useState(false);

  // Pending edit-request tracking
  const [pendingIds, setPendingIds] = useState(new Set());

  // Admin edit/delete state
  const [editingReading,  setEditingReading]  = useState(null);
    const [savingEdit,      setSavingEdit]      = useState(false);
  const [deletingReading, setDeletingReading] = useState(null);
  const [savingDelete,    setSavingDelete]    = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [savingEpEdit,    setSavingEpEdit]    = useState(false);

  const isAdmin  = ['admin','ceo','cto'].includes(role);
  const isIntern = ['intern','research_intern'].includes(role);

  const toLocalDatetime = (utcStr) => {
    if (!utcStr) return '';
    const d = new Date(utcStr);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0,16);
  };

  const fetcher = async () => {
    const [rRes, iRes, epRes, feedRes, pRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('*, logged_by, logger:employees!batch_fermentation_readings_logged_by_fkey(id, full_name, initials)').eq('batch_id', batch.id).eq('flask_id', activeFlask.id).order('logged_at'),
      supabase.from('batch_flask_inoculations').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
      supabase.from('batch_flask_endpoints').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
      supabase.from('batch_fermentation_feeds').select('*, employees(full_name, initials)').eq('flask_id', activeFlask.id).order('logged_at', { ascending: false }),
      fetch('/api/edit-request').then(r => r.json()).catch(() => ({ data: [] }))
    ]);
    return {
      readings: rRes.data || [],
      inocu: iRes.data || null,
      endpoint: epRes.data || null,
      feeds: feedRes.data || [],
      pendingIds: new Set((pRes.data || []).filter(r => r.status === 'pending').map(r => r.record_id))
    };
  };

  const { data: swrData, mutate: mutateFermentation } = useSWR(
    activeFlask?.id ? `fermentation-${activeFlask.id}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 2000 }
  );

  useEffect(() => {
    if (swrData) {
      setReadings(swrData.readings);
      setInocu(swrData.inocu);
      setEndpoint(swrData.endpoint);
      setFeeds(swrData.feeds);
      setPendingIds(swrData.pendingIds);
      setLoadingReadings(false);
    }
  }, [swrData]);

  useEffect(() => {
    // Reset local state when active flask changes
    setReadings([]); setInocu(null); setEndpoint(null); setFeeds([]);
    setLoadingReadings(true);
    setExceededNotifSent(false);
  }, [activeFlask?.id]);

  const fetchData = useCallback(() => { mutateFermentation(); }, [mutateFermentation]);
  const fetchFeeds = useCallback(() => { mutateFermentation(); }, [mutateFermentation]);

  const handleLogFeed = handleSubmit(async (data) => {
    const { feedType, feedVolMl, feedPhBefore, feedPhAfter, feedReason } = data;
    if (!activeFlask?.id || !feedVolMl || !feedReason) {
      toast.warn('Volume and reason are required for a feed log entry.');
      return;
    }
    setSavingFeed(true);
    try {
      const { error } = await supabase.from('batch_fermentation_feeds').insert({
        batch_id: batch.id,
        flask_id: activeFlask.id,
        flask_label: activeFlask.flask_label,
        feed_type: feedType,
        volume_ml: parseFloat(feedVolMl),
        ph_before: feedPhBefore ? parseFloat(feedPhBefore) : null,
        ph_after: feedPhAfter ? parseFloat(feedPhAfter) : null,
        reason: feedReason,
        logged_by: employeeProfile?.id,
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Feed/correction logged.');
      setValue('feedVolMl',''); setValue('feedPhBefore',''); setValue('feedPhAfter',''); setValue('feedReason','');
      setShowFeedForm(false);
      fetchFeeds();
    } catch (err) { toast.error(err.message); }
    finally { setSavingFeed(false); }
  });

  // A-33: fetch inter-batch comparison data when toggled on
  useEffect(() => {
    if (!showComparison || !batch?.formulation_id) return;
    fetch(`/api/batches/compare?formulation_id=${batch.formulation_id}&current_batch_id=${batch.id}&limit=3`)
      .then(r => r.json())
      .then(d => { if (d.success) setComparisonData(d.data || {}); })
      .catch(() => {});
  }, [showComparison, batch?.formulation_id, batch?.id]);

  // G-31: Fetch incubator equipment once
  const { data: incubatorsData } = useData({
    table: 'equipment',
    select: 'id, name, status',
    order: { column: 'name' }
  });
  const incubators = (incubatorsData || []).filter(eq => eq.name.toLowerCase().includes('incubat'));

  const { data: mediaData } = useData({
    table: 'formulations',
    select: 'name, status, category',
    order: { column: 'name' }
  });
  const mediaFormulations = (mediaData || []).filter(m => m.category === 'Lab Media' && m.status === 'Approved');

  // Restore last supervisor from localStorage for this user
  useEffect(() => {
    if (!employeeProfile?.id || !isIntern) return;
    const stored = localStorage.getItem(`oxybio_last_supervisor_${employeeProfile.id}`);
    if (stored) setValue('supervisedBy', stored);
  }, [employeeProfile?.id, isIntern]);

  // Detect pending-plating reading for this flask whenever readings change
  useEffect(() => {
    if (!readings.length || !activeFlask?.id) { setPendingPlatingReading(null); return; }
    const flaskReadings = readings
      .filter(r => r.flask_id === activeFlask.id)
      .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));
    const lastReading = flaskReadings[0];
    if (
      lastReading &&
      lastReading.plating_status === 'pending'
    ) {
      setPendingPlatingReading(lastReading);
    } else {
      setPendingPlatingReading(null);
    }
  }, [readings, activeFlask?.id]);

  useEffect(() => {
    // Clear endpoint form whenever the active flask changes
    setValue('epPh', '');
    setValue('aroma', 'Tangy and clean');
    setValue('texture', 'Normal slurry');
    setValue('sensory', 'PASS');
    setValue('gramStain', 'Not done');
    setValue('gramStainImg', '');
    setValue('epTa', '');
    setValue('colourDesc', '');
    setValue('epNotes', '');
    setValue('endpointTime', '');
    setShowEndpoint(false);
    setPendingOOROverride(false);
  }, [activeFlask?.id]);

  // Elapsed hours from T=0 specific to THIS flask
  const tZero     = inocu?.t_zero_time ? new Date(inocu.t_zero_time) : null;
  const elapsedHr = tZero ? ((new Date() - tZero) / 3600000) : null;
  const maxExceeded = elapsedHr != null && elapsedHr > (inocu?.planned_fermentation_hrs || 24);

  // G-05: send push notification to all lab supervisors when fermentation time is exceeded
  useEffect(() => {
    if (!maxExceeded || exceededNotifSent || endpoint || !activeFlask) return;
    setExceededNotifSent(true);
    const supervisors = employees.filter(e =>
      ['ceo','admin','cto','research_fellow','scientist'].includes(e.role) && e.id !== employeeProfile?.id
    );
    supervisors.forEach(sup => {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_to: sup.id,
          title: `Fermentation Time Exceeded — ${activeFlask.flask_label}`,
          body: `Batch ${batch.batch_id} / Trial ${activeFlask.flask_label} has exceeded its planned fermentation duration of ${inocu?.planned_fermentation_hrs}h. Endpoint declaration required.`,
          url: `/batches/${batch.id}`,
        }),
      }).catch(() => {});
    });
  }, [maxExceeded, exceededNotifSent, endpoint, activeFlask]); // eslint-disable-line react-hooks/exhaustive-deps
  const latestAlarm = readings.filter(r => r.flask_id === activeFlask?.id).some(r => r.is_ph_alarm || r.is_temp_alarm);

  const handleLogReading = handleSubmit(async (data) => {
    const { pH, temp, brix, od, ta, doPercent, co2Pressure, co2Observed, ethanolPct, foam, appearance, platingIntent, plateMedia, plateDilution, plateCount, plateTemp, plateExpectedHours, notes, supervisedBy, isRetro, retroReason, loggedAt } = data;
    if (!pH || saving || !activeFlask) return;
    if (isIntern && !supervisedBy) { toast.warn('Select a supervisor before submitting.'); return; }
    const elapsed = tZero ? (new Date(isRetro && loggedAt ? loggedAt : new Date()) - tZero) / 3600000 : null;
    const validation = validateReadingPayload({
      ph: pH,
      incubator_temp_c: temp || null,
      is_retrospective: isRetro,
      retro_reason: retroReason,
      logged_at: isRetro && loggedAt ? new Date(loggedAt).toISOString() : new Date().toISOString(),
    });
    if (!validation.ok) {
      toast.warn(validation.errors.join(' '));
      return;
    }
    
    setSaving(true);
    try {
      const loggedAtIso = isRetro && loggedAt ? new Date(loggedAt).toISOString() : new Date().toISOString();
      const platingEnabled = platingIntent === 'yes' || platingIntent === 'later';
      const platingNow = platingIntent === 'yes' && platingDone;
      const platingStatusVal = platingIntent === 'later' ? 'pending' : (platingIntent === 'no' ? 'na' : null);
      const res = await fetch(`/api/batches/${batch.id}/fermentation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reading',
          flask_id: activeFlask.id,
          flask_label: activeFlask.flask_label,
          ph: parseFloat(pH),
          incubator_temp_c: temp ? parseFloat(temp) : null,
          brix: brix ? parseFloat(brix) : null,
          optical_density: od ? parseFloat(od) : null,
          titratable_acidity_pct: ta ? parseFloat(ta) : null,
          do_percent: doPercent ? parseFloat(doPercent) : null,
          co2_pressure_kpa: co2Pressure ? parseFloat(co2Pressure) : null,
          incubator_equipment_id: incubatorId || null,
          co2_observed:  co2Observed || null,
          ethanol_pct:   ethanolPct ? parseFloat(ethanolPct) : null,
          foam_level: foam,
          visual_appearance: appearance,
          elapsed_hours: elapsed ? parseFloat(elapsed.toFixed(2)) : null,
          logged_at: loggedAtIso,
          is_retrospective: isRetro,
          retro_reason: isRetro ? retroReason : null,
          supervised_by: supervisedBy || null,
          notes: notes || null,
          logged_by: employeeProfile?.id,
          plating_done: platingNow,
          plating_status: platingStatusVal,
          plating_config: platingNow ? {
            media_type: plateMedia || null,
            dilution: plateDilution || null,
            plate_count: plateCount ? parseInt(plateCount, 10) : null,
            incubation_temp_c: plateTemp ? parseFloat(plateTemp) : 37,
            expected_hours: plateExpectedHours ? parseInt(plateExpectedHours, 10) : 48,
          } : {},
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to log reading');

      toast.success(json.incubation ? 'Reading logged and incubation activity created.' : 'Reading logged.');
      reset({ ...data, pH: '', temp: '', brix: '', od: '', ta: '', doPercent: '', co2Pressure: '', co2Observed: '', ethanolPct: '', platingIntent: null, notes: '', isRetro: false, retroReason: '', loggedAt: '' }); setPlatingDone(false);
      fetchData();
    } catch (err) { 
      if (setGlobalError) setGlobalError(err.message);
    }
    finally { setSaving(false); }
  });

  const handleEndpoint = handleSubmit(async (data) => {
    const { epPh, endpointTime } = data;
    if (!epPh || savingEp) return;
    if (!endpointTime) {
      toast.warn('Set the actual fermentation end time before declaring endpoint.');
      return;
    }
    const finalPh = parseFloat(epPh);
    const totalHours = calculateElapsedHours(tZero, endpointTime);
    const validation = validateEndpointPayload({
      final_ph: finalPh,
      total_hours: totalHours,
      end_time: new Date(endpointTime).toISOString(),
    });
    if (!validation.ok) {
      toast.warn(validation.errors.join(' '));
      return;
    }
    const phOOR = validation.values.is_endpoint_ph_out_of_range;
    if (phOOR) {
      setPendingOOROverride(true);
      return;
    }
    await executeEndpoint(data);
  });

  const confirmOOROverride = handleSubmit(async (data) => {
    setPendingOOROverride(false);
    await executeEndpoint(data);
  });

  const executeEndpoint = async (data) => {
    const { epPh, aroma, texture, sensory, gramStain, gramStainImg, epTa, colourDesc, epNotes, endpointTime } = data;
    const finalPh = parseFloat(epPh);
    const totalHours = calculateElapsedHours(tZero, endpointTime);
    setSavingEp(true);
    try {
      const res = await fetch(`/api/batches/${batch.id}/fermentation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'endpoint',
          flask_id: activeFlask.id,
          flask_label: activeFlask.flask_label,
          total_hours: totalHours,
          end_time: new Date(endpointTime).toISOString(),
          final_ph: finalPh,
          aroma,
          colour_desc: colourDesc,
          texture,
          sensory_overall: sensory,
          gram_stain: gramStain,
          gram_stain_image_url: gramStainImg || null,
          titratable_acidity_pct: epTa ? parseFloat(epTa) : null,
          notes: epNotes,
          declared_by: employeeProfile?.id,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to declare endpoint');
      
      toast.success(`Endpoint declared for ${activeFlask.flask_label}.`);
      setValue('endpointTime', '');
      fetchData(); onDataSaved();
    } catch (err) { 
      if (setGlobalError) setGlobalError(err.message);
      toast.error(err.message); 
    }
    finally { setSavingEp(false); }
  };

  const handleEndpointEdit = handleSubmit(async (data) => {
    const { epEditHours, epEditPh } = data;
    if (!epEditHours || !epEditPh) return;
    setSavingEpEdit(true);
    try {
      const { error } = await supabase.from('batch_flask_endpoints')
        .update({ total_hours: parseFloat(epEditHours), final_ph: parseFloat(epEditPh) })
        .eq('flask_id', activeFlask.id);
      if (error) throw error;
      toast.success('Endpoint updated.');
      setEditingEndpoint(false);
      fetchData(); onDataSaved();
    } catch (err) { 
      if (setGlobalError) setGlobalError(err.message);
      toast.error(err.message); 
    }
    finally { setSavingEpEdit(false); }
  });

  const openEdit = (r) => {
    setEditingReading(r);
    setValue('editFields.ph', r.ph ?? '');
    setValue('editFields.incubator_temp_c', r.incubator_temp_c ?? '');
    setValue('editFields.brix', r.brix ?? '');
    setValue('editFields.optical_density', r.optical_density ?? '');
    setValue('editFields.foam_level', r.foam_level ?? 'None');
    setValue('editFields.visual_appearance', r.visual_appearance ?? 'Normal');
    setValue('editFields.notes', r.notes ?? '');
    setValue('editFields.logged_at', toLocalDatetime(r.logged_at));
    setValue('editReason', '');
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editReason.trim()) { toast.warn('A reason for the edit is required.'); return; }
    const editFields = getValues('editFields') || {};
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
        foam_level: editFields.foam_level || null,
        visual_appearance: editFields.visual_appearance || null,
        notes: editFields.notes || null,
        logged_at: editFields.logged_at ? new Date(editFields.logged_at).toISOString() : undefined,
        elapsed_hours: newElapsedHours !== undefined ? newElapsedHours : undefined,
        is_retrospective: editFields.is_retrospective,
        retro_reason: editFields.retro_reason || null,
      };
      Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
      const { data, error } = await supabase.rpc('update_fermentation_reading', {
        p_reading_id: editingReading.id, p_updates: updates, p_reason: editReason,
      });
      if (error) throw error;
      if (!data?.id) throw new Error('Reading update did not return the saved row. Please run the latest Batch Monitoring RPC migration.');
      setReadings(prev => prev.map(r => r.id === data.id ? data : r));
      toast.success('Reading updated.');
      setEditingReading(null);
      await fetchData();
      onDataSaved?.();
    } catch (err) { toast.error(err.message); }
    finally { setSavingEdit(false); }
  };

  const handleDeleteConfirm = handleSubmit(async (data) => {
    const { deleteReason } = data;
    if (!deleteReason?.trim()) { toast.warn('A reason for deletion is required.'); return; }
    setSavingDelete(true);
    try {
      const { error } = await supabase.rpc('delete_fermentation_reading', {
        p_reading_id: deletingReading.id, p_reason: deleteReason,
      });
      if (error) throw error;
      setReadings(prev => prev.filter(r => r.id !== deletingReading.id));
      toast.success('Reading deleted.');
      setDeletingReading(null); setValue('deleteReason', '');
      await fetchData();
      onDataSaved?.();
    } catch (err) { toast.error(err.message); }
    finally { setSavingDelete(false); }
  });

  const platingSummary = (reading) => {
    if (reading.sample_incubation_id) {
      if (reading.plating_status === 'completed') return 'Plate completed';
      return 'Plate incubating';
    }
    if (reading.plating_done) return 'Plate logged';
    if (reading.plating_result) return `Legacy: ${reading.plating_result}`;
    return null;
  };

  const supervisors = employees.filter(e => ['ceo','admin','cto','research_fellow','scientist'].includes(e.role));

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Fermentation details.</div>;

  // pH range helpers for inline hint
  // Suppress alarm/target hints at T+0h — initial pH is always on the higher side
  const currentReadingElapsed = isRetro && loggedAt && tZero
    ? (new Date(loggedAt) - tZero) / 3600000
    : elapsedHr;
  const isAtTZero = currentReadingElapsed !== null && currentReadingElapsed < 0.5;
  const phNum = parseFloat(pH);
  const phInAlarmRange = false;
  const phOutOfTarget = pH && !isAtTZero && !phInAlarmRange && (phNum < 4.2 || phNum > 4.5);

  return (
    <div className="space-y-5">
      {/* Pending plating banner */}
      {pendingPlatingReading && !resolvingPlating && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-300 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-800 flex-1">
            Previous reading at T+{pendingPlatingReading.elapsed_hours?.toFixed(1)}h still needs plate data.
          </p>
          <button
            onClick={() => setResolvingPlating(true)}
            className="px-2.5 py-1 bg-amber-600 text-white text-xs font-black rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
          >
            Add now ▶
          </button>
          <button
            onClick={async () => {
              await supabase.from('batch_fermentation_readings')
                .update({ plating_status: 'na' })
                .eq('id', pendingPlatingReading.id);
              setPendingPlatingReading(null);
            }}
            className="p-1 text-amber-400 hover:text-amber-700 transition-colors"
            title="Mark N/A"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Header + alarms */}
      <div className="card p-5 border-l-4 border-l-navy">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-navy"/>
            <h2 className="text-base font-bold text-slate-900">Fermentation: <span className="text-navy">{activeFlask.flask_label}</span></h2>
            {tZero && (
              <span className="px-2 py-0.5 bg-navy/5 border border-navy/20 rounded text-xs font-black text-navy">
                {endpoint
                  ? `${endpoint.total_hours?.toFixed(1)}hr Total`
                  : `${elapsedHr?.toFixed(1)}hr Elapsed`}
              </span>
            )}
          </div>
          {!endpoint && tZero && (
            <button onClick={() => {
              if (!showEndpoint) {
                // Pre-fill end time: use suggested planned end time if already in the past,
                // otherwise default to right now. Always use toLocalDatetime() so the
                // datetime-local input gets local time (not UTC), preventing a 5h30m
                // offset error for IST users.
                if (inocu?.planned_fermentation_hrs && tZero) {
                  const suggested = new Date(tZero.getTime() + inocu.planned_fermentation_hrs * 3600000);
                  const prefill = suggested < new Date() ? suggested : new Date();
                  setValue('endpointTime', toLocalDatetime(prefill.toISOString()));
                } else {
                  setValue('endpointTime', toLocalDatetime(new Date().toISOString()));
                }
              } else {
                setValue('endpointTime', '');
              }
              setShowEndpoint(s => !s);
            }} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${showEndpoint ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
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
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Log Reading for {activeFlask.flask_label}</h3>
            </div>
            <form onSubmit={handleLogReading} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">pH Value <span className="text-red-500">★ CCP</span></label>
                <input type="number" step="0.01" min="0" max="14" required {...register('pH')}
                  className={`w-full px-4 py-3 border-2 rounded-xl text-3xl font-black font-mono tracking-tighter text-slate-800 focus:border-navy outline-none text-center transition-colors ${
                    phInAlarmRange ? 'border-red-400 bg-red-50/30' :
                    phOutOfTarget  ? 'border-amber-400 bg-amber-50/20' :
                    'border-slate-200'
                  }`} placeholder="0.00"/>
                {/* 3B: Inline target range hint */}
                <div className={`mt-1 text-xs font-semibold flex items-center gap-1 ${
                  phInAlarmRange ? 'text-red-600' : phOutOfTarget ? 'text-amber-600' : 'text-slate-400'
                }`}>
                  {phInAlarmRange
                    ? '⚠ Outside alarm range (3–6) — reading will be flagged'
                    : phOutOfTarget
                    ? '◈ Outside target endpoint range (4.2–4.5)'
                    : 'Target endpoint: 4.2–4.5 · Alarm: <3 or >6'}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Temp (°C)</label>
                  <input type="number" step="0.1" {...register('temp')} placeholder="37.0" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                  <p className={`text-xs mt-0.5 font-semibold ${temp && (parseFloat(temp)<36||parseFloat(temp)>38)?'text-amber-600':'text-slate-400'}`}>
                    {temp && (parseFloat(temp)<36||parseFloat(temp)>38)?'⚠ Outside 36–38°C':'Range: 36–38°C'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Brix (°Bx)</label>
                  <input type="number" step="0.1" {...register('brix')} placeholder="10.5" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">OD (600nm)</label>
                  <input type="number" step="0.001" {...register('od')} placeholder="0.500" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                {/* G-30: Titratable Acidity */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">TA (%)</label>
                  <input type="number" step="0.01" {...register('ta')} placeholder="0.75" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                  <p className="text-xs text-slate-400 mt-0.5">Titratable acidity</p>
                </div>
              </div>
              {/* G-82: CO₂ gas lock observation */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">CO₂ / Gas Production</label>
                <div className="flex gap-2">
                  {['Active bubbling','Slow evolution','Trace','None observed'].map(o=>(
                    <button key={o} type="button" onClick={()=>setValue('co2Observed', co2Observed===o?'':o)}
                      className={`flex-1 py-1 text-xs font-black rounded-lg border transition-all ${co2Observed===o?'bg-navy text-white border-navy':'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              {/* G-83: Ethanol measurement (for mixed cultures) */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Ethanol (%) <span className="text-slate-300 font-normal normal-case">— mixed cultures</span></label>
                <input type="number" step="0.01" {...register('ethanolPct')} placeholder="0.00" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
              </div>

              {/* A-60, A-61: DO + headspace CO₂ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">DO (%)</label>
                  <input type="number" step="0.1" min="0" max="100" {...register('doPercent')} placeholder="e.g. 5.0" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                  <p className="text-xs text-slate-400 mt-0.5">Dissolved oxygen %</p>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Headspace CO₂ (kPa)</label>
                  <input type="number" step="0.1" {...register('co2Pressure')} placeholder="e.g. 1.5" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
              </div>

              {/* G-31: Incubator equipment picker */}
              {incubators.length > 0 && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Incubator Used</label>
                  <select {...register('incubatorId')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none bg-white focus:border-navy">
                    <option value="">Select incubator...</option>
                    {incubators.map(eq => <option key={eq.id} value={eq.id}>{eq.name} ({eq.status})</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Foam</label>
                  <select {...register('foam')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {FOAM_OPTS.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              {/* 1A: Plate this sample? — Yes / No / Later */}
              <div className="bg-slate-50/50 border border-slate-100 p-3 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Plate this sample?</span>
                  <div className="flex gap-1.5">
                    {[['yes','Yes','bg-slate-600 text-white border-slate-600'],['no','No','bg-slate-200 text-slate-700 border-slate-200'],['later','Later','bg-amber-100 text-amber-700 border-amber-300']].map(([val, label, activeClass]) => (
                      <button
                        key={val} type="button"
                        onClick={() => setPlatingIntent(platingIntent === val ? null : val)}
                        className={`px-3 py-1 text-xs font-black rounded-lg border transition-all ${
                          platingIntent === val ? activeClass : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {platingIntent === 'later' && (
                  <p className="text-xs text-amber-700 font-semibold pl-1">⏱ A reminder banner will appear on your next log entry for this flask.</p>
                )}
                {platingIntent === 'yes' && (
                  <div className="space-y-3 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input type="checkbox" checked={platingDone} onChange={e=>setPlatingDone(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-navy focus:ring-navy"/>
                      Plating done now — create incubation activity
                    </label>
                    {platingDone && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="field-label">Media Type</label>
                          <select {...register('plateMedia')} className="field-input text-xs bg-white">
                            <option value="">Select media...</option>
                            {mediaFormulations.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="field-label">Dilution</label>
                          <select {...register('plateDilution')} className="field-input text-xs bg-white">
                            <option value="">Select...</option>
                            <option value="Direct (No dilution)">Direct (No dilution)</option>
                            {['10^-1','10^-2','10^-3','10^-4','10^-5','10^-6','10^-7','10^-8','10^-9','10^-10'].map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="field-label">No. of Plates</label>
                          <input type="number" min="1" {...register('plateCount')} className="field-input text-xs" placeholder="2"/>
                        </div>
                        <div>
                          <label className="field-label">Incubation Temp (°C)</label>
                          <input type="number" step="0.1" {...register('plateTemp')} className="field-input text-xs" placeholder="37"/>
                        </div>
                        <div>
                          <label className="field-label">Expected Duration (hrs)</label>
                          <input type="number" {...register('plateExpectedHours')} className="field-input text-xs" placeholder="48"/>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Visual Appearance</label>
                <select {...register('appearance')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                  {APPEARANCE_OPTS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="retro" {...register('isRetro')} className="w-4 h-4 rounded border-slate-300"/>
                <label htmlFor="retro" className="text-xs font-semibold text-slate-600">Retrospective entry</label>
              </div>
              {isRetro && (
                <div className="space-y-2 pl-6">
                  <input type="datetime-local" {...register('loggedAt')} 
                    max={toLocalDatetime(new Date().toISOString())}
                    className="w-full px-3 py-2 border-2 border-amber-200 rounded-lg text-sm bg-white focus:border-amber-400 outline-none"/>
                  <input placeholder="Reason for retrospective entry (required)" {...register('retroReason')} className="w-full px-3 py-2 border border-amber-300 rounded-lg text-xs font-semibold outline-none"/>
                </div>
              )}
              {isIntern && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-red-500 mb-1">Supervised By <span className="text-red-500">*Required</span></label>
                  <select
                    value={supervisedBy}
                    onChange={e => {
                      setValue('supervisedBy', e.target.value);
                      // 1A: Persist supervisor choice in localStorage
                      if (e.target.value && employeeProfile?.id) {
                        localStorage.setItem(`oxybio_last_supervisor_${employeeProfile.id}`, e.target.value);
                      }
                    }}
                    required className="w-full px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-red-400">
                    <option value="">Select supervising scientist...</option>
                    {supervisors.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
              )}
              <input {...register('notes')} placeholder="Notes (optional)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none"/>
              <button type="submit" disabled={saving||!pH} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5"/>{saving ? 'Logging...' : 'Commit Reading'}
              </button>
            </form>
          </div>
        )}

        {/* ── Chart + Reading Table (Shows All Flasks' graph context) ── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Trial Trends</h3>
            {batch?.formulation_id && (
              <button onClick={() => setShowComparison(v => !v)}
                className={`px-2.5 py-1 text-xs font-black rounded-lg border transition-all ${showComparison ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
                {showComparison ? 'Hide' : 'Compare'} Historical
              </button>
            )}
          </div>
          <div className="p-4 space-y-3">
            <PhChart readings={readings} loading={loadingReadings} comparisonData={showComparison ? comparisonData : {}}/>
            {/* G-33: Brix trend chart */}
            {readings.some(r => r.brix != null) && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400 mb-1">Sugar Consumption (Brix °Bx)</p>
                <BrixChart readings={readings.filter(r => r.flask_id === activeFlask?.id)}/>
              </div>
            )}
            {/* G-87: OD trend chart */}
            {readings.some(r => r.optical_density != null) && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400 mb-1">Biomass Growth (OD 600nm)</p>
                <OdChart readings={readings.filter(r => r.flask_id === activeFlask?.id)}/>
              </div>
            )}
            {/* G-88: Temperature trend chart */}
            {readings.some(r => r.incubator_temp_c != null) && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400 mb-1">Temperature Profile (°C)</p>
                <TempChart readings={readings.filter(r => r.flask_id === activeFlask?.id)}/>
              </div>
            )}
            {/* A-66: PAT Shewhart control chart stats for pH */}
            {(() => {
              const flaskPh = readings.filter(r => r.flask_id === activeFlask?.id && r.ph != null && r.elapsed_hours != null);
              if (flaskPh.length < 4) return null;
              const phVals = flaskPh.map(r => parseFloat(r.ph));
              const mean = phVals.reduce((a,b) => a+b, 0) / phVals.length;
              const std = Math.sqrt(phVals.reduce((a,b) => a + Math.pow(b-mean,2), 0) / phVals.length);
              const ucl = mean + 3*std, lcl = mean - 3*std;
              const violations = phVals.filter(v => v > ucl || v < lcl).length;
              return (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-black uppercase text-slate-600 mb-2">A-66 PAT — Shewhart Control Chart (pH)</p>
                  <div className="grid grid-cols-4 gap-2 text-xs text-center">
                    {[['Mean', mean.toFixed(3)],['σ', std.toFixed(3)],['UCL (3σ)', ucl.toFixed(3)],['LCL (3σ)', lcl.toFixed(3)]].map(([l,v])=>(
                      <div key={l} className="p-1.5 bg-white rounded-lg border border-slate-100">
                        <p className="text-xs font-black uppercase text-slate-400">{l}</p>
                        <p className="font-black text-slate-800 text-sm tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>
                  {violations > 0 && <p className="text-xs text-red-700 font-bold mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>{violations} reading(s) outside 3σ control limits — process out of control</p>}
                  {violations === 0 && flaskPh.length >= 4 && <p className="text-xs text-emerald-700 font-semibold mt-1">✓ All readings within 3σ control limits — process in control</p>}
                </div>
              );
            })()}

            {/* A-33: Inter-batch pH comparison overlay */}
            {showComparison && Object.keys(comparisonData).length > 0 && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs font-black uppercase text-slate-700 mb-2">Historical Batch Comparison (same formulation)</p>
                <div className="space-y-1">
                  {Object.entries(comparisonData).map(([batchLabel, pts], idx) => {
                    const colors = ['#7c3aed','#059669','#d97706'];
                    const col = colors[idx % colors.length];
                    const latestPt = pts[pts.length - 1];
                    return (
                      <div key={batchLabel} className="flex items-center gap-2 text-xs">
                        <span style={{ backgroundColor: col }} className="w-8 h-1.5 rounded-full inline-block shrink-0"/>
                        <span className="font-bold text-slate-700 font-mono">{batchLabel}</span>
                        <span className="text-slate-500">{pts.length} readings · Last pH: {latestPt?.ph?.toFixed(2)} at T+{latestPt?.elapsed_hours?.toFixed(1)}h</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-1">pH data from last 3 released batches overlaid above in grey on chart</p>
              </div>
            )}

            {/* A-31 + A-32: TA production rate and acid curve */}
            {(() => {
              const flaskReadings = readings.filter(r => r.flask_id === activeFlask?.id && r.titratable_acidity_pct != null && r.elapsed_hours != null).sort((a,b)=>a.elapsed_hours-b.elapsed_hours);
              if (flaskReadings.length < 2) return null;
              // Calculate ΔTA/Δt for each interval
              const rates = [];
              for (let i=1; i<flaskReadings.length; i++) {
                const dTA = parseFloat(flaskReadings[i].titratable_acidity_pct) - parseFloat(flaskReadings[i-1].titratable_acidity_pct);
                const dt = parseFloat(flaskReadings[i].elapsed_hours) - parseFloat(flaskReadings[i-1].elapsed_hours);
                if (dt > 0) rates.push(dTA/dt);
              }
              const maxRate = Math.max(...rates);
              const finalTA = parseFloat(flaskReadings[flaskReadings.length-1].titratable_acidity_pct);
              const totalHrs = parseFloat(flaskReadings[flaskReadings.length-1].elapsed_hours);
              // A-64: lactic acid productivity ≈ (TA% × 10 g/L) / hours [rough estimate]
              const productivity = totalHrs > 0 ? ((finalTA * 10) / totalHrs).toFixed(3) : null;
              return (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                  <p className="text-xs font-black uppercase text-red-800">Acid Production Analytics (from TA% readings)</p>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><p className="text-red-600 font-black text-xs uppercase">Max ΔTA/Δt</p><p className="font-black text-red-900">{maxRate.toFixed(4)} %/h</p></div>
                    <div><p className="text-red-600 font-black text-xs uppercase">Final TA%</p><p className="font-black text-red-900">{finalTA.toFixed(2)}%</p></div>
                    {productivity && <div><p className="text-red-600 font-black text-xs uppercase">A-64 Productivity</p><p className="font-black text-red-900">~{productivity} g/L/h</p><p className="text-xs text-red-400">lactic acid est.</p></div>}
                  </div>
                </div>
              );
            })()}

            {/* G-34: Sampling plan indicator */}
            {inocu?.sampling_plan_hrs?.length > 0 && (
              <div className="p-3 bg-navy/5 rounded-xl border border-navy/10">
                <p className="text-xs font-black uppercase text-navy/70 mb-1.5">Sampling Schedule</p>
                <div className="flex flex-wrap gap-1.5">
                  {inocu.sampling_plan_hrs.map(hr => {
                    const logged = readings.filter(r => r.flask_id === activeFlask?.id)
                      .some(r => Math.abs((r.elapsed_hours || 0) - parseFloat(hr)) <= 1.5);
                    return (
                      <span key={hr} className={`px-2 py-0.5 text-xs font-black rounded border ${logged ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                        {logged ? '✓' : '○'} T+{hr}h
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 overflow-x-auto">
            <table className="w-full min-w-[480px] divide-y divide-gray-100">
              <thead><tr className="bg-slate-50/50">
                <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Flask</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">T+hr</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">pH</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Temp</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Brix · OD · Plating</th>
                {isAdmin && <th className="px-3 py-2 text-xs font-bold text-slate-400 uppercase"></th>}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[...readings].filter(r => r.flask_id === activeFlask.id).reverse().map(r => (
                  <tr key={r.id} className={r.is_ph_alarm ? 'bg-red-50' : 'hover:bg-slate-50/30'}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p className="text-xs font-black text-navy">{r.flask_label}</p>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {r.is_retrospective && <span className="px-1 py-0.5 bg-amber-100 text-amber-700 rounded text-[7px] font-bold">RETRO</span>}
                        {r.edit_reason && <span className="px-1 py-0.5 bg-slate-100 text-slate-700 rounded text-[7px] font-bold" title={`Edited: ${r.edit_reason}`}>EDITED</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap">T+{r.elapsed_hours?.toFixed(1)}h</td>
                    <td className={`px-3 py-2 text-sm font-black tabular-nums whitespace-nowrap ${r.is_ph_alarm?'text-red-600':'text-slate-900'}`}>{r.ph}</td>
                    <td className={`px-3 py-2 text-xs font-semibold whitespace-nowrap ${r.is_temp_alarm?'text-amber-600':'text-slate-600'}`}>{r.incubator_temp_c ? `${r.incubator_temp_c}°C` : '—'}</td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-slate-600 font-semibold">
                        {r.brix ? `${r.brix}°Bx` : '—'} · {r.optical_density ? `OD ${r.optical_density}` : '—'}
                      </p>
                      {platingSummary(r) && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]" title={platingSummary(r)}>
                          {platingSummary(r)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {r.logger && <CreatorBadge initials={r.logger.initials} fullName={r.logger.full_name} size="sm"/>}
                        {isAdmin ? (
                          <>
                            <button onClick={() => openEdit(r)} title="Edit reading"
                              className="p-1 rounded hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors">
                              <Pencil className="w-3 h-3"/>
                            </button>
                            <button onClick={() => { setDeletingReading(r); setValue('deleteReason', ''); }} title="Delete reading"
                              className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                              <Trash2 className="w-3 h-3"/>
                            </button>
                          </>
                        ) : r.logged_by === employeeProfile?.id ? (
                          <EditRequestButton
                            tableName="batch_fermentation_readings"
                            recordId={r.id}
                            moduleLabel="Fermentation Reading"
                            fields={[
                              { key: 'ph', label: 'pH', type: 'number' },
                              { key: 'optical_density', label: 'OD', type: 'number' },
                              { key: 'incubator_temp_c', label: 'Incubator Temp (°C)', type: 'number' },
                              { key: 'brix', label: 'Brix (°Bx)', type: 'number' },
                              { key: 'elapsed_hours', label: 'Elapsed Hours (T+)', type: 'number' },
                              { key: 'notes', label: 'Notes', type: 'textarea' },
                            ]}
                            currentData={r}
                            hasPending={pendingIds.has(r.id)}
                            allowDelete
                            onSuccess={() => { fetchData(); fetchPendingIds(); }}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {readings.filter(r => r.flask_id === activeFlask.id).length===0 && <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-xs text-slate-400">{loadingReadings ? 'Loading…' : 'No readings yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Endpoint Declaration ── */}
      {!endpoint && showEndpoint && (
        <div className="card overflow-hidden border-2 border-navy/20">
          <div className="px-5 py-4 border-b border-slate-100 bg-navy/5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-navy"/>
            <h3 className="text-sm font-bold text-slate-900">Declare Endpoint for {activeFlask.flask_label}</h3>
          </div>
          <form onSubmit={handleEndpoint} className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Final pH</label>
                <input type="number" step="0.01" required {...register('epPh')}
                  className={`w-full px-4 py-3 border-2 rounded-xl text-2xl font-black font-mono text-center outline-none ${parseFloat(epPh)<4.2||parseFloat(epPh)>4.5?'border-red-400 text-red-600':'border-slate-200 text-slate-800 focus:border-navy'}`} placeholder="4.30"/>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-amber-600">
                  Fermentation End Time <span className="text-red-500">* Required</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  
                  max={toLocalDatetime(new Date().toISOString())}
                  {...register('endpointTime')}
                  className={`w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold outline-none focus:border-navy ${!endpointTime ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                />
                {tZero && (() => {
                  const t = endpointTime ? new Date(endpointTime) : new Date();
                  const hrs = (t - tZero) / 3600000;
                  return (
                    <p className="text-xs mt-1 font-black text-navy text-center">
                      Total: {hrs.toFixed(1)} hr
                      {!endpointTime && <span className="text-amber-600"> — enter actual end time above</span>}
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold uppercase text-slate-400 mb-1">Aroma</label>
                <select {...register('aroma')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Tangy and clean','Mild','Off-odour detected'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-bold uppercase text-slate-400 mb-1">Texture</label>
                <select {...register('texture')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none bg-white">
                  {['Normal slurry','Over-separated','Clumped'].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold uppercase text-slate-400 mb-1">Colour Description</label>
                <input {...register('colourDesc')} placeholder="e.g. Reddish-slate" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none"/>
              </div>
              <div className="space-y-2">
                <div><label className="block text-xs font-bold uppercase text-slate-400 mb-1">Gram Stain Result</label>
                  <select {...register('gramStain')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none bg-white">
                    {['Gram-positive rods dominant','Mixed','Gram-negative dominant','Not done'].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                {/* G-32: Gram stain image URL */}
                <div><label className="block text-xs font-bold uppercase text-slate-400 mb-1">Gram Stain Photo URL <span className="text-slate-300 font-normal normal-case">(optional)</span></label>
                  <input type="url" {...register('gramStainImg')} placeholder="https://..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-navy"/>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[{label:'Sensory Overall',val:sensory,set:(v)=>setValue('sensory', v),opts:['PASS','FAIL']}].map(f=>(
                <div key={f.label}><label className="block text-xs font-bold uppercase text-slate-400 mb-1">{f.label}</label>
                  <div className="flex gap-2">
                    {f.opts.map(o=><button type="button" key={o} onClick={()=>f.set(o)} className={`flex-1 py-2 text-xs font-black rounded-lg border transition-all ${f.val===o?(o==='PASS'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>{o}</button>)}
                  </div>
                </div>
              ))}
            </div>
            {/* G-30: TA% at endpoint */}
            <div><label className="block text-xs font-bold uppercase text-slate-400 mb-1">Titratable Acidity at Endpoint (%)</label>
              <input type="number" step="0.01" {...register('epTa')} placeholder="e.g. 0.85" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
              <p className="text-xs text-slate-400 mt-0.5">Typical LAB endpoint: 0.6–1.0% TA</p>
            </div>
            <textarea {...register('epNotes')} rows={2} placeholder="Endpoint notes..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
            <div className="grid grid-cols-1 gap-3">
              <button type="submit" disabled={savingEp} className="py-3 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
                {savingEp ? 'Saving...' : 'Save Endpoint Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Feed / pH Correction Log */}
      {tZero && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplet className="w-4 h-4 text-slate-600"/>
              <h3 className="text-sm font-bold text-slate-900">Feed / pH Correction Log</h3>
              {feeds.length > 0 && <span className="text-xs font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">{feeds.length}</span>}
            </div>
            {!endpoint && (
              <button onClick={() => setShowFeedForm(v => !v)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3"/>{showFeedForm ? 'Cancel' : 'Log Feed'}
              </button>
            )}
          </div>
          {showFeedForm && (
            <div className="p-4 border-b border-slate-100 bg-slate-50/30 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="field-label">Type</label>
                  <select {...register('feedType')} className="field-input bg-white text-xs">
                    {['pH Correction','Nutrient Addition','Buffer Addition','Anti-foam','Water'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Volume (ml)</label>
                  <input type="number" step="0.1" {...register('feedVolMl')} className="field-input" placeholder="e.g. 2.5"/>
                </div>
                <div>
                  <label className="field-label">pH Before</label>
                  <input type="number" step="0.01" {...register('feedPhBefore')} className="field-input" placeholder="3.2"/>
                </div>
                <div>
                  <label className="field-label">pH After</label>
                  <input type="number" step="0.01" {...register('feedPhAfter')} className="field-input" placeholder="4.1"/>
                </div>
              </div>
              <input {...register('feedReason')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none" placeholder="Reason / agent used (e.g. 0.5ml 1M NaOH to correct pH overshoot) *"/>
              <button onClick={handleLogFeed} disabled={savingFeed} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider disabled:opacity-50">
                {savingFeed ? 'Logging...' : 'Log Entry'}
              </button>
            </div>
          )}
          {feeds.length === 0 ? (
            <div className="px-5 py-4 text-xs text-slate-400 font-semibold">No feed / correction entries yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {feeds.map(f => (
                <div key={f.id} className="px-5 py-3 flex items-center gap-3 text-xs">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-xs uppercase">{f.feed_type}</span>
                  <span className="font-black text-slate-800">{f.volume_ml} ml</span>
                  {f.ph_before && f.ph_after && (
                    <span className="text-slate-500 font-semibold">pH {f.ph_before} → {f.ph_after}</span>
                  )}
                  <span className="text-slate-500 flex-1 truncate">{f.reason}</span>
                  <span className="text-slate-400 whitespace-nowrap">{new Date(f.logged_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Advance button (after endpoint declared) */}
      {endpoint && (
        <div className="card p-5 flex items-center justify-between gap-4">
          <div className="text-sm">
            <p className="font-bold text-slate-900">Endpoint declared ✓</p>
            <p className="text-slate-500 text-xs">Final pH: {endpoint.final_ph} · {endpoint.total_hours?.toFixed(1)}hr total fermentation</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => { setValue('epEditHours', endpoint.total_hours?.toFixed(2) || ''); setValue('epEditPh', endpoint.final_ph || ''); setEditingEndpoint(true); }}
                className="px-3 py-2 border border-amber-300 bg-amber-50 text-amber-700 text-xs font-black rounded-lg hover:bg-amber-100 transition-colors"
              >
                Edit Hours
              </button>
            )}
            <button disabled={actionLoading} onClick={() => onAdvanceFlaskStage('harvest')} className="px-5 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50">
              Advance Trial → Harvest
            </button>
          </div>
        </div>
      )}

      {/* Admin Edit Endpoint Modal */}
      {editingEndpoint && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-amber-700 mb-1 flex items-center gap-2">
              <Pencil className="w-4 h-4"/> Correct Endpoint Record
            </h3>
            <p className="text-xs text-slate-500 mb-4">Admin correction — update total fermentation hours and final pH stored for this endpoint.</p>
            <form onSubmit={handleEndpointEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Total Fermentation Hours</label>
                <input type="number" step="0.01" min="0" required {...register('epEditHours')}
                  className="w-full px-3 py-2 border-2 border-amber-300 rounded-lg text-sm font-semibold outline-none focus:border-amber-500"/>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Final pH</label>
                <input type="number" step="0.01" min="0" max="14" required {...register('epEditPh')}
                  className="w-full px-3 py-2 border-2 border-amber-300 rounded-lg text-sm font-semibold outline-none focus:border-amber-500"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditingEndpoint(false)}
                  className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingEpEdit}
                  className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-50">
                  {savingEpEdit ? 'Saving...' : 'Save Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Admin Edit Reading Modal ── */}
      {editingReading && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-md shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Edit Reading — {editingReading.flask_label} T+{editingReading.elapsed_hours?.toFixed(1)}h</h3>
              <button onClick={() => setEditingReading(null)} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-400"/></button>
            </div>
            <form onSubmit={handleEditSave} className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">pH <span className="text-red-500">★ CCP</span></label>
                  <input type="number" step="0.01" min="0" max="14" {...register('editFields.ph')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Temp (°C)</label>
                  <input type="number" step="0.1" {...register('editFields.incubator_temp_c')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Brix (°Bx)</label>
                  <input type="number" step="0.1" {...register('editFields.brix')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">OD (600nm)</label>
                  <input type="number" step="0.001" {...register('editFields.optical_density')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Foam</label>
                  <select {...register('editFields.foam_level')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {FOAM_OPTS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Visual Appearance</label>
                  <select {...register('editFields.visual_appearance')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none bg-white focus:border-navy">
                    {APPEARANCE_OPTS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              {(editingReading.sample_incubation_id || editingReading.plating_result) && (
                <div className="rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-700">Plating</p>
                  <p className="mt-0.5 text-xs text-slate-800">
                    {editingReading.sample_incubation_id
                      ? 'Linked incubation results are edited in Sample Incubation.'
                      : `Legacy result: ${editingReading.plating_result}`}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Reading Timestamp</label>
                <input type="datetime-local" {...register('editFields.logged_at')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Notes</label>
                <input {...register('editFields.notes')}
                  placeholder="Notes (optional)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
              </div>
              <div className="pt-1 border-t border-slate-100">
                <label className="block text-xs font-bold uppercase text-red-500 mb-1">Reason for Edit <span>*Required</span></label>
                <input required {...register('editReason')}
                  placeholder="Why is this reading being corrected?"
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-semibold outline-none focus:border-red-400"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditingReading(null)}
                  className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
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
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-red-600 mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4"/> Delete Reading
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Delete <strong>{deletingReading.flask_label}</strong> reading at <strong>T+{deletingReading.elapsed_hours?.toFixed(1)}h</strong> (pH {deletingReading.ph})?
              This cannot be undone but will be logged in the audit trail.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase text-red-500 mb-1">Reason <span>*Required</span></label>
              <input {...register('deleteReason')}
                placeholder="Why is this reading being deleted?"
                className="w-full px-3 py-2 border-2 border-red-200 rounded-lg text-sm font-semibold outline-none focus:border-red-400"/>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeletingReading(null); setValue('deleteReason', ''); }}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleDeleteConfirm} disabled={savingDelete}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                {savingDelete ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Out of Range Override Modal */}
      {pendingOOROverride && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-amber-600 mb-2 text-center flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5"/> pH Alert
            </h3>
            <p className="text-sm text-slate-600 mb-6 text-center">
              Final pH <strong className="text-amber-600">{epPh}</strong> is outside the target range of 4.2–4.5. Confirm and proceed with endpoint declaration anyway?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingOOROverride(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
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
