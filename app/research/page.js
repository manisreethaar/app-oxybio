'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  Users, Plus, Loader2, Award, Zap, TrendingUp, X, FlaskConical,
  Search, SlidersHorizontal, Settings, FileText, Share2, Filter, AlertTriangle, ArrowRight, Save,
  Trash2, Download, CheckCircle2, XCircle,
  GitCompareArrows,
} from 'lucide-react';
import { downloadCsvWithHash } from '@/utils/exportUtils';
import Skeleton from '@/components/Skeleton';
import dynamic from 'next/dynamic';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CreatorBadge from '@/components/ui/CreatorBadge';

const ResearchTrendChart = dynamic(
  () => import('@/components/charts/ResearchCharts').then(m => ({ default: m.ResearchTrendChart })),
  { ssr: false }
);
const ResearchRadarChart = dynamic(
  () => import('@/components/charts/ResearchCharts').then(m => ({ default: m.ResearchRadarChart })),
  { ssr: false }
);
const CompareRadarChart = dynamic(
  () => import('@/components/charts/ResearchCharts').then(m => ({ default: m.CompareRadarChart })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_CRITERIA = ['Taste', 'Texture', 'Smell', 'Appearance'];
const ATTRS            = ['taste', 'texture', 'smell', 'appearance'];
const ATTR_LABELS      = { taste: 'Taste', texture: 'Texture', smell: 'Smell', appearance: 'Appearance' };
const COMPARE_COLORS   = ['#1F3A5F', '#0d9488', '#d97706', '#7c3aed'];

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------
const formSchema = z.object({
  batch_id:       z.string().uuid('Select a released batch').or(z.literal('')).optional().nullable(),
  flask_id:       z.string().optional().nullable(),
  session_title:  z.string().min(1, 'Title required'),
  panelist_count: z.preprocess((val) => Number(val), z.number().min(1, 'Min 1 panelist')),
  sample_ids:     z.string().optional(),
  // pass thresholds stored separately
  pt_taste:       z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).max(10).optional()),
  pt_texture:     z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).max(10).optional()),
  pt_smell:       z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).max(10).optional()),
  pt_appearance:  z.preprocess((v) => v === '' ? undefined : Number(v), z.number().min(0).max(10).optional()),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sessionStats(scores, thresholds = {}) {
  return ATTRS.map(attr => {
    const vals = (scores || []).map(s => s[attr]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return { attr, mean: null, sd: null, min: null, max: null, pass: null };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd   = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    const threshold = thresholds[attr];
    return {
      attr,
      mean:  +mean.toFixed(2),
      sd:    +sd.toFixed(2),
      min:   Math.min(...vals),
      max:   Math.max(...vals),
      pass:  threshold != null ? mean >= threshold : null,
    };
  });
}

function exportCSV(session) {
  const scores     = session.scores || [];
  const thresholds = session.pass_thresholds || {};
  const stats      = sessionStats(scores, thresholds);
  const headers    = ['Panelist #', 'Taste', 'Texture', 'Smell', 'Appearance'];
  const rows       = scores.map((s, i) =>
    [i + 1, s.taste ?? '', s.texture ?? '', s.smell ?? '', s.appearance ?? ''].join(',')
  );
  const statRow = (label, fn) =>
    [label, ...ATTRS.map(a => { const st = stats.find(x => x.attr === a); return st ? fn(st) : ''; })].join(',');

  const csv = [
    headers.join(','),
    ...rows,
    '',
    statRow('Mean',          st => st.mean ?? ''),
    statRow('SD',            st => st.sd   ?? ''),
    statRow('Pass Threshold',st => thresholds[st.attr] ?? ''),
    statRow('Pass/Fail',     st => st.pass === null ? '' : st.pass ? 'Pass' : 'Fail'),
  ].join('\n');

  downloadCsvWithHash(csv, `${session.session_title.replace(/[^a-z0-9]/gi, '_')}_scores.csv`);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ConsumerResearchPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast    = useToast();
  const isAdmin  = ['admin', 'ceo', 'cto'].includes(employeeProfile?.role);

  // Data
  const [sessions,  setSessions]  = useState([]);
  const [batches,   setBatches]   = useState([]);
  const [loading,   setLoading]   = useState(true);

  // New session modal
  const [showNew,    setShowNew]    = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Score modal
  const [activeSession,    setActiveSession]    = useState(null);
  const [scoreForms,       setScoreForms]       = useState([]);
  const [attrComments,     setAttrComments]     = useState({});
  const [activePanelist,   setActivePanelist]   = useState(0);
  const [scoreSubmitting,  setScoreSubmitting]  = useState(false);

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Compare mode
  const [compareMode,     setCompareMode]     = useState(false);
  const [compareSelected, setCompareSelected] = useState([]);

  // -------------------------------------------------------------------------
  // Form
  // -------------------------------------------------------------------------
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      batch_id: '', session_title: '', flask_id: '', panelist_count: 5, sample_ids: '',
      pt_taste: '', pt_texture: '', pt_smell: '', pt_appearance: '',
    },
  });
  const selectedBatchId = watch('batch_id');

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [panelRes, { data: batchData }] = await Promise.all([
        fetch('/api/research'),
        (async () => {
          const { createClient } = await import('@/utils/supabase/client');
          const sb = createClient();
          return sb
            .from('batches')
            .select('id, batch_id, variant, experiment_type, batch_flasks(id, flask_label, status, current_stage)')
            .eq('status', 'released')
            .limit(100);
        })(),
      ]);

      if (!panelRes.ok) throw new Error('Failed to load panels');
      const { data: panelData } = await panelRes.json();
      setSessions(panelData || []);
      setBatches(batchData || []);
    } catch (err) {
      console.error('Consumer panels fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // -------------------------------------------------------------------------
  // Create session
  // -------------------------------------------------------------------------
  const handleCreateSession = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Build pass_thresholds only for filled values
      const pass_thresholds = {};
      if (data.pt_taste      != null && data.pt_taste      !== '') pass_thresholds.taste      = data.pt_taste;
      if (data.pt_texture    != null && data.pt_texture    !== '') pass_thresholds.texture    = data.pt_texture;
      if (data.pt_smell      != null && data.pt_smell      !== '') pass_thresholds.smell      = data.pt_smell;
      if (data.pt_appearance != null && data.pt_appearance !== '') pass_thresholds.appearance = data.pt_appearance;

      const body = {
        batch_id:        data.batch_id || null,
        flask_id:        data.flask_id || null,
        session_title:   data.session_title,
        panelist_count:  data.panelist_count,
        sample_ids:      data.sample_ids,
        test_criteria:   DEFAULT_CRITERIA,
        pass_thresholds: Object.keys(pass_thresholds).length ? pass_thresholds : null,
      };
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to start session.');
      setShowNew(false);
      reset();
      fetchData();
      toast.success('Panel session created.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  const handleDeleteSession = async (id) => {
    const res = await fetch(`/api/research/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete');
    }
    toast.success('Session deleted');
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  // -------------------------------------------------------------------------
  // Score modal
  // -------------------------------------------------------------------------
  const getCriteria = (session) =>
    session?.test_criteria?.length ? session.test_criteria : DEFAULT_CRITERIA;

  const openScoreModal = (session) => {
    const criteria = getCriteria(session);
    const count    = session.panelist_count || 1;
    const nextForms = Array.from({ length: count }).map((_, idx) => {
      const existing = Array.isArray(session.scores) && session.scores.length > idx ? session.scores[idx] : {};
      return criteria.reduce((acc, c) => {
        acc[c] = Number(existing?.[c] ?? 0);
        return acc;
      }, {});
    });
    const existingComments = session.attribute_comments || {};
    const initComments = ATTRS.reduce((acc, a) => {
      acc[a] = (existingComments[a] || []).slice();
      return acc;
    }, {});
    setActiveSession(session);
    setScoreForms(nextForms);
    setAttrComments(initComments);
    setActivePanelist(0);
  };

  const closeScoreModal = () => {
    setActiveSession(null);
    setScoreForms([]);
    setAttrComments({});
    setActivePanelist(0);
  };

  const scoreAverage = useMemo(() => {
    if (!scoreForms || scoreForms.length === 0) return 0;
    let total = 0, count = 0;
    scoreForms.forEach(form => {
      Object.values(form).map(Number).filter(Number.isFinite).forEach(v => { total += v; count += 1; });
    });
    return count === 0 ? 0 : +(total / count).toFixed(1);
  }, [scoreForms]);

  const updateScore = (criterion, value) => {
    const numeric = Math.max(0, Math.min(10, Number(value)));
    setScoreForms(prev => {
      const updated = [...prev];
      updated[activePanelist] = { ...updated[activePanelist], [criterion]: Number.isFinite(numeric) ? numeric : 0 };
      return updated;
    });
  };

  const updateComment = (attr, value) => {
    setAttrComments(prev => {
      const updated = { ...prev };
      const arr = [...(updated[attr] || [])];
      arr[activePanelist] = value;
      updated[attr] = arr;
      return updated;
    });
  };

  const handleSaveScores = async () => {
    if (!activeSession || scoreSubmitting) return;
    setScoreSubmitting(true);
    try {
      const criteria = getCriteria(activeSession);
      const normalizedScores = scoreForms.map(form =>
        criteria.reduce((acc, c) => { acc[c] = Number(form[c] || 0); return acc; }, {})
      );

      // Build attribute_comments -- filter empty strings
      const finalComments = {};
      ATTRS.forEach(a => {
        const arr = (attrComments[a] || []).map(c => c || '');
        if (arr.some(c => c !== '')) finalComments[a] = arr;
      });

      const res = await fetch(`/api/research/${activeSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scores:             normalizedScores,
          avg_score:          scoreAverage,
          attribute_comments: Object.keys(finalComments).length ? finalComments : null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to save scores.');

      setSessions(prev => prev.map(s =>
        s.id === activeSession.id
          ? { ...s, ...payload.panel, batches: s.batches }
          : s
      ));
      toast.success('Panel scores saved.');
      closeScoreModal();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setScoreSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Compare mode
  // -------------------------------------------------------------------------
  const toggleCompareSelect = (id) => {
    setCompareSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) {
        toast.error('Select up to 3 sessions to compare.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const compareSessions = sessions.filter(s => compareSelected.includes(s.id));

  // -------------------------------------------------------------------------
  // Derived helpers
  // -------------------------------------------------------------------------
  const selectedBatch  = batches.find(b => b.id === selectedBatchId);
  const selectedFlasks = selectedBatch?.batch_flasks || [];

  const sessionIdentity = (session) =>
    [
      session.batches?.batch_id ? `Batch ${session.batches.batch_id}` : null,
      session.flask_id ? `Flask ${session.flask_id}` : null,
    ].filter(Boolean).join(' | ');

  // -------------------------------------------------------------------------
  // Loading / auth guard
  // -------------------------------------------------------------------------
  if (authLoading) return (
    <div className="page-container space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton width={200} height={32}/>
        <Skeleton width={150} height={40}/>
      </div>
      <Skeleton className="h-64 w-full rounded-2xl"/>
    </div>
  );
  if (!employeeProfile) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="page-container text-slate-900">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Consumer Insights</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Sensory Validation &amp; Taste Panel Data</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCompareMode(m => !m);
              setCompareSelected([]);
            }}
            className={`flex items-center px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all active:scale-95 border ${
              compareMode
                ? 'bg-slate-600 text-white border-slate-600 hover:bg-slate-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <GitCompareArrows className="w-4 h-4 mr-1.5"/>
            {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 mr-1.5"/> New Panel Session
          </button>
        </div>
      </div>

      {/* Compare mode banner */}
      {compareMode && (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800">
          Compare mode: select 2-3 sessions using the checkboxes on each card. Then scroll down to see the overlay chart.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Trend chart                                                          */}
      {/* ------------------------------------------------------------------ */}
      {sessions.length >= 2 && !compareMode && (
        <div className="card p-6 mb-6 mt-8">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-navy"/> Sensory Score Trend
          </h2>
          <p className="text-xs text-slate-500 font-medium mb-5">7.0+ threshold = consumer-ready formulation</p>
          <ResearchTrendChart sessions={sessions}/>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Compare radar overlay                                                */}
      {/* ------------------------------------------------------------------ */}
      {compareMode && compareSessions.length >= 2 && (
        <div className="card p-6 mt-6">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider mb-4 flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4"/> Session Comparison
          </h2>
          <div className="flex flex-wrap gap-3 mb-4">
            {compareSessions.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase border" style={{ borderColor: COMPARE_COLORS[i], color: COMPARE_COLORS[i] }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: COMPARE_COLORS[i] }}/>
                {s.session_title}
              </span>
            ))}
          </div>
          <div className="h-72 w-full">
            <CompareRadarChart sessions={compareSessions} colors={COMPARE_COLORS}/>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Released batches awaiting panel testing -- quick-start chips          */}
      {/* ------------------------------------------------------------------ */}
      {!loading && batches.length > 0 && (() => {
        const linkedKeys = new Set(sessions.map(s => `${s.batch_id || ''}::${s.flask_id || ''}`));
        const unlinked   = batches.flatMap(batch => {
          const flasks = batch.batch_flasks?.length ? batch.batch_flasks : [{ id: '', flask_label: '' }];
          return flasks
            .filter(flask => !linkedKeys.has(`${batch.id}::${flask.flask_label || ''}`))
            .map(flask => ({ batch, flask }));
        });
        if (unlinked.length === 0) return null;
        return (
          <div className="mt-8 mb-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FlaskConical className="w-4 h-4"/> Released Batches Awaiting Panel Testing
            </p>
            <div className="flex flex-wrap gap-2">
              {unlinked.map(({ batch, flask }) => (
                <button
                  key={`${batch.id}-${flask.id || 'batch'}`}
                  onClick={() => {
                    const flaskLabel = flask.flask_label || '';
                    reset({
                      batch_id:      batch.id,
                      flask_id:      flaskLabel,
                      session_title: `Panel - ${batch.batch_id}${flaskLabel ? ` ${flaskLabel}` : ''}`,
                      panelist_count: 5,
                      sample_ids:    flaskLabel,
                      pt_taste: '', pt_texture: '', pt_smell: '', pt_appearance: '',
                    });
                    setShowNew(true);
                  }}
                  className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 text-[10px] font-bold rounded-lg hover:bg-amber-100 transition-all"
                >
                  {batch.batch_id}{flask.flask_label ? ` | ${flask.flask_label}` : ''}{batch.variant ? ` | ${batch.variant}` : ''}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ------------------------------------------------------------------ */}
      {/* Session cards                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {loading ? (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full rounded-xl"/>
            <Skeleton className="h-48 w-full rounded-xl"/>
            <Skeleton className="h-48 w-full rounded-xl"/>
          </div>
        ) : sessions.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-sm font-medium text-slate-400">
            No panel data recorded. Select a released batch above to start a session.
          </div>
        ) : sessions.map((s, cardIdx) => {
          const stats      = sessionStats(s.scores || [], s.pass_thresholds || {});
          const hasScores  = Array.isArray(s.scores) && s.scores.length > 0;
          const isSelected = compareSelected.includes(s.id);
          const colorIdx   = compareSelected.indexOf(s.id);

          return (
            <div
              key={s.id}
              className={`card p-6 hover:shadow-md transition-all group relative overflow-hidden ${
                compareMode && isSelected ? 'ring-2' : ''
              }`}
              style={compareMode && isSelected ? { '--tw-ring-color': COMPARE_COLORS[colorIdx] } : {}}
            >
              {/* Compare checkbox */}
              {compareMode && (
                <button
                  onClick={() => toggleCompareSelect(s.id)}
                  className={`absolute top-3 left-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-transparent text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                  style={isSelected ? { background: COMPARE_COLORS[colorIdx], borderColor: COMPARE_COLORS[colorIdx] } : {}}
                  title={isSelected ? 'Deselect' : 'Select for comparison'}
                >
                  {isSelected && <span className="text-[10px] font-black">{colorIdx + 1}</span>}
                </button>
              )}

              {/* Batch tag */}
              {s.batches && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-navy rounded text-[10px] font-bold uppercase tracking-wider border border-slate-100">
                    <FlaskConical className="w-3 h-3"/> {s.batches.batch_id}
                    {s.batches.variant ? ` - ${s.batches.variant}` : ''}
                  </span>
                </div>
              )}

              {/* Meta row */}
              <div className="flex items-center justify-between mb-4">
                <span className="px-2 py-0.5 bg-slate-50 text-slate-700 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-100 flex items-center gap-1">
                  <Users className="w-3 h-3"/> {s.panelist_count} Panelists
                </span>
                <div className="flex items-center gap-2">
                  {s.creator && (
                    <CreatorBadge initials={s.creator.initials} fullName={s.creator.full_name}/>
                  )}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Title + delete */}
              <div className="flex justify-between items-start">
                <h3 className="text-base font-bold text-slate-900 mb-1">{s.session_title}</h3>
                <div className="flex items-center gap-1">
                  {hasScores && (
                    <button
                      title="Export CSV"
                      onClick={() => exportCSV(s)}
                      className="p-1 text-slate-400 hover:text-navy transition-all"
                    >
                      <Download className="w-4 h-4"/>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs font-bold text-navy font-mono mb-1">{s.sample_ids || 'V1 / V2 / V3 Comparison'}</p>
              {sessionIdentity(s) && (
                <p className="text-[10px] font-semibold text-slate-500 mb-5">{sessionIdentity(s)}</p>
              )}

              {/* Radar chart */}
              <div className="h-44 w-full mb-4 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                <ResearchRadarChart session={s}/>
              </div>

              {/* Per-attribute stats table (only when scores exist) */}
              {hasScores && (
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full text-[10px] font-semibold">
                    <thead>
                      <tr className="text-slate-400 uppercase tracking-wider">
                        <th className="text-left py-1 pr-2">Attr</th>
                        <th className="text-right pr-2">Mean</th>
                        <th className="text-right pr-2">SD</th>
                        <th className="text-right pr-2">Min</th>
                        <th className="text-right pr-2">Max</th>
                        <th className="text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map(st => (
                        <tr key={st.attr} className="border-t border-slate-100">
                          <td className="py-1 pr-2 font-bold text-slate-700 capitalize">{st.attr}</td>
                          <td className={`text-right pr-2 font-black ${
                            st.pass === true  ? 'text-slate-700' :
                            st.pass === false ? 'text-red-600'  : 'text-slate-800'
                          }`}>
                            {st.mean ?? '-'}
                          </td>
                          <td className="text-right pr-2 text-slate-500">{st.sd ?? '-'}</td>
                          <td className="text-right pr-2 text-slate-500">{st.min ?? '-'}</td>
                          <td className="text-right pr-2 text-slate-500">{st.max ?? '-'}</td>
                          <td className="text-right">
                            {st.pass === true  && <CheckCircle2 className="w-3.5 h-3.5 text-slate-600 inline"/>}
                            {st.pass === false && <XCircle      className="w-3.5 h-3.5 text-red-500 inline"/>}
                            {st.pass === null  && <span className="text-slate-300">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Composite score row */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Composite Score</p>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-black tracking-tight ${(s.avg_score || 0) >= 7.0 ? 'text-navy' : 'text-red-600'}`}>
                      {s.avg_score || '-'}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">/ 10</span>
                  </div>
                </div>
                {(s.avg_score || 0) >= 7.0
                  ? <span className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-100"><Award className="w-6 h-6"/></span>
                  : <span className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100"><Zap className="w-6 h-6"/></span>
                }
              </div>

              {/* Log / Edit scores button */}
              {(!hasScores || isAdmin) && (
                <button
                  type="button"
                  onClick={() => openScoreModal(s)}
                  className="mt-5 w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-navy rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-50 hover:border-navy/30 active:scale-95 transition-all"
                >
                  <SlidersHorizontal className="w-4 h-4"/>
                  {hasScores ? 'Edit Scores' : 'Log Scores'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Score Logging Modal                                                  */}
      {/* ------------------------------------------------------------------ */}
      {activeSession && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-0 sm:p-4">
          <div className="h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-none sm:rounded-2xl w-full max-w-xl shadow-xl relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={closeScoreModal}
              className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-slate-100 transition-all"
            >
              <X className="w-5 h-5 text-slate-400"/>
            </button>

            {/* Modal header */}
            <div className="p-6 border-b border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-navy mb-1">Sensory Score Entry</p>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{activeSession.session_title}</h2>
              {activeSession.batches && (
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Batch {activeSession.batches.batch_id}
                  {activeSession.flask_id ? ` | Flask ${activeSession.flask_id}` : ''}
                  {activeSession.batches.variant ? ` | ${activeSession.batches.variant}` : ''}
                </p>
              )}

              {/* Panelist tabs */}
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
                {Array.from({ length: activeSession.panelist_count || 1 }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePanelist(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
                      activePanelist === idx
                        ? 'bg-navy text-white border-navy'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Panelist {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Scores + comments */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {getCriteria(activeSession).map((criterion) => {
                const attrKey = criterion.toLowerCase();
                const threshold = activeSession.pass_thresholds?.[attrKey];
                const currentVal = scoreForms[activePanelist]?.[criterion] ?? 0;
                const passing = threshold != null ? currentVal >= threshold : null;

                return (
                  <div key={criterion} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">{criterion}</label>
                        {threshold != null && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${passing ? 'bg-slate-50 text-slate-700' : 'bg-red-50 text-red-600'}`}>
                            min {threshold}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {passing === true  && <CheckCircle2 className="w-4 h-4 text-slate-600"/>}
                        {passing === false && <XCircle      className="w-4 h-4 text-red-500"/>}
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.1"
                          value={currentVal}
                          onChange={(e) => updateScore(criterion, e.target.value)}
                          className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-sm text-center outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.1"
                      value={currentVal}
                      onChange={(e) => updateScore(criterion, e.target.value)}
                      className="w-full accent-[#1F3A5F]"
                    />
                    {/* Per-panelist comment */}
                    <textarea
                      rows={2}
                      placeholder={`Comment for ${criterion} (optional)`}
                      value={attrComments[attrKey]?.[activePanelist] || ''}
                      onChange={(e) => updateComment(attrKey, e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all resize-none"
                    />
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Composite Average</p>
                <p className={`text-3xl font-black tracking-tight ${scoreAverage >= 7.0 ? 'text-navy' : 'text-red-600'}`}>
                  {scoreAverage}<span className="text-sm font-semibold text-slate-400"> / 10</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveScores}
                disabled={scoreSubmitting}
                className="sm:min-w-40 px-4 py-2.5 bg-navy border border-navy hover:bg-navy-hover text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {scoreSubmitting ? <><Loader2 className="w-4 h-4 animate-spin"/> Saving...</> : 'Save Scores'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* New Panel Modal                                                      */}
      {/* ------------------------------------------------------------------ */}
      {showNew && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-0 sm:p-4">
          <div className="flex flex-col bg-white rounded-none sm:rounded-2xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setShowNew(false); reset(); }}
              className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-slate-100 transition-all"
            >
              <X className="w-5 h-5 text-slate-400"/>
            </button>

            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Panel Setup</h2>
              <p className="text-xs text-slate-500 mt-1">Link a released batch and configure your tasting session.</p>
            </div>

            <form onSubmit={handleSubmit(handleCreateSession)} className="px-6 pb-8 space-y-4">
              {/* Batch selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Released Batch</label>
                <select
                  {...register('batch_id')}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                >
                  <option value="">-- Select released batch (optional) --</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.batch_id}{b.variant ? ` - ${b.variant}` : ''}{b.experiment_type ? ` [${b.experiment_type}]` : ''}
                    </option>
                  ))}
                </select>
                {errors.batch_id && <p className="text-red-500 text-xs mt-1">{errors.batch_id.message}</p>}
                {batches.length === 0 && (
                  <p className="text-amber-600 text-[10px] font-semibold mt-1">No released batches found. Release a batch first to link it here.</p>
                )}
              </div>

              {/* Flask selector */}
              {selectedFlasks.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Flask / Trial</label>
                  <select
                    {...register('flask_id')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                  >
                    <option value="">Batch-level panel</option>
                    {selectedFlasks.map(flask => (
                      <option key={flask.id} value={flask.flask_label}>
                        {flask.flask_label}{flask.status ? ` | ${flask.status}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">Use one sensory session per flask when F1, F2, F3 have different results.</p>
                </div>
              )}

              {/* Session title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Session Target</label>
                <input
                  placeholder="e.g. Kavuni Pro v3.1 Blind Test"
                  {...register('session_title')}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                />
                {errors.session_title && <p className="text-red-500 text-xs mt-1">{errors.session_title.message}</p>}
              </div>

              {/* Panelists + version */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Panelists</label>
                  <input
                    type="number" min="1"
                    {...register('panelist_count')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                  />
                  {errors.panelist_count && <p className="text-red-500 text-xs mt-1">{errors.panelist_count.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Version / IDs</label>
                  <input
                    placeholder="e.g. V1, V2"
                    {...register('sample_ids')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                  />
                </div>
              </div>

              {/* Pass thresholds */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-3">Pass Thresholds (optional)</label>
                <p className="text-[10px] text-slate-500 font-semibold mb-3">Set minimum mean score required per attribute (0-10). Leave blank to skip.</p>
                <div className="grid grid-cols-2 gap-3">
                  {ATTRS.map(a => (
                    <div key={a}>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase tracking-wider">{ATTR_LABELS[a]}</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        placeholder="e.g. 7"
                        {...register(`pt_${a}`)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-navy border border-navy hover:bg-navy-hover text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin"/> Starting...</> : 'Start Session'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Confirm Delete Modal                                                 */}
      {/* ------------------------------------------------------------------ */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => handleDeleteSession(confirmDeleteId)}
        title="Delete Session"
        message="Are you sure you want to delete this session? All sensory scores will be permanently deleted."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
