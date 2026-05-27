'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Users, Plus, Loader2, Award, Zap, TrendingUp, X, FlaskConical, SlidersHorizontal, Trash2 } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import dynamic from 'next/dynamic';
const ResearchTrendChart = dynamic(() => import('@/components/charts/ResearchCharts').then(m => ({ default: m.ResearchTrendChart })), { ssr: false });
const ResearchRadarChart = dynamic(() => import('@/components/charts/ResearchCharts').then(m => ({ default: m.ResearchRadarChart })), { ssr: false });

const formSchema = z.object({
  batch_id:      z.string().uuid('Select a released batch').or(z.literal('')).optional().nullable(),
  session_title: z.string().min(1, 'Title required'),
  panelist_count: z.preprocess((val) => Number(val), z.number().min(1, 'Min 1 panelist')),
  sample_ids:    z.string().optional(),
});

const DEFAULT_CRITERIA = ['Taste', 'Texture', 'Smell', 'Appearance'];

export default function ConsumerResearchPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [sessions,  setSessions]  = useState([]);
  const [batches,   setBatches]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [scoreForms, setScoreForms] = useState([]);
  const [activePanelist, setActivePanelist] = useState(0);
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const handleDeleteSession = async (id) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      const res = await fetch(`/api/research/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete');
      toast.success('Session deleted');
      fetchData();
    } catch (err) { toast.error(err.message); }
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { batch_id: '', session_title: '', flask_id: '', panelist_count: 5, sample_ids: '' },
  });

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: panelData, error: panelErr }, { data: batchData }] = await Promise.all([
        supabase
          .from('taste_panels')
          .select('*, batches(id, batch_id, variant, experiment_type)')
          .order('created_at', { ascending: false }),
        supabase
          .from('batches')
          .select('id, batch_id, variant, experiment_type')
          .eq('status', 'released')
          .limit(100),
      ]);
      if (panelErr) throw panelErr;
      setSessions(panelData || []);
      setBatches(batchData || []);
    } catch (err) {
      console.error('Consumer panels fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateSession = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = {
        ...data,
        batch_id:      data.batch_id || null,
        test_criteria: ['Taste', 'Texture', 'Smell', 'Appearance'],
      };
      const res = await fetch('/api/research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to start session.');
      setShowNew(false); reset(); fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const getCriteria = (session) => {
    return session?.test_criteria?.length ? session.test_criteria : DEFAULT_CRITERIA;
  };

  const openScoreModal = (session) => {
    const criteria = getCriteria(session);
    const count = session.panelist_count || 1;
    const nextForms = Array.from({ length: count }).map((_, idx) => {
      const existingScores = Array.isArray(session.scores) && session.scores.length > idx ? session.scores[idx] : {};
      return criteria.reduce((acc, criterion) => {
        acc[criterion] = Number(existingScores?.[criterion] ?? 0);
        return acc;
      }, {});
    });
    setActiveSession(session);
    setScoreForms(nextForms);
    setActivePanelist(0);
  };

  const closeScoreModal = () => {
    setActiveSession(null);
    setScoreForms([]);
    setActivePanelist(0);
  };

  const scoreAverage = useMemo(() => {
    if (!scoreForms || scoreForms.length === 0) return 0;
    let totalSum = 0;
    let totalCount = 0;
    scoreForms.forEach(form => {
      const values = Object.values(form).map(Number).filter((value) => Number.isFinite(value));
      values.forEach(v => { totalSum += v; totalCount += 1; });
    });
    if (totalCount === 0) return 0;
    return Number((totalSum / totalCount).toFixed(1));
  }, [scoreForms]);

  const updateScore = (criterion, value) => {
    const numeric = Math.max(0, Math.min(10, Number(value)));
    setScoreForms(prev => {
      const newForms = [...prev];
      newForms[activePanelist] = { ...newForms[activePanelist], [criterion]: Number.isFinite(numeric) ? numeric : 0 };
      return newForms;
    });
  };

  const handleSaveScores = async () => {
    if (!activeSession || scoreSubmitting) return;
    setScoreSubmitting(true);
    try {
      const criteria = getCriteria(activeSession);
      const normalizedScoresList = scoreForms.map(form => {
        return criteria.reduce((acc, criterion) => {
          acc[criterion] = Number(form[criterion] || 0);
          return acc;
        }, {});
      });
      const avg_score = scoreAverage;

      const res = await fetch(`/api/research/${activeSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: normalizedScoresList, avg_score }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to save scores.');

      setSessions(prev => prev.map(session => (
        session.id === activeSession.id
          ? { ...session, ...payload.panel, batches: session.batches }
          : session
      )));
      toast.success('Panel scores saved.');
      closeScoreModal();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setScoreSubmitting(false);
    }
  };

  if (authLoading) return (
    <div className="page-container space-y-6">
      <div className="flex justify-between items-center"><Skeleton width={200} height={32}/> <Skeleton width={150} height={40}/></div>
      <Skeleton className="h-64 w-full rounded-2xl"/>
    </div>
  );
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Consumer Insights</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Sensory Validation &amp; Taste Panel Data</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New Panel Session
        </button>
      </div>

      {/* Trend chart — only if ≥2 sessions */}
      {sessions.length >= 2 && (
        <div className="surface p-6 mb-6 mt-8">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-navy" /> Sensory Score Trend
          </h2>
          <p className="text-xs text-gray-500 font-medium mb-5">7.0+ threshold = consumer-ready formulation</p>
          <ResearchTrendChart sessions={sessions} />
        </div>
      )}

      {/* Released batches with no panel yet — quick-start chips */}
      {!loading && batches.length > 0 && (
        (() => {
          const linkedBatchIds = new Set(sessions.map(s => s.batch_id).filter(Boolean));
          const unlinked = batches.filter(b => !linkedBatchIds.has(b.id));
          if (unlinked.length === 0) return null;
          return (
            <div className="mt-8 mb-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FlaskConical className="w-4 h-4"/> Released Batches Awaiting Panel Testing
              </p>
              <div className="flex flex-wrap gap-2">
                {unlinked.map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      reset({ batch_id: b.id, session_title: `Panel — ${b.batch_id}`, panelist_count: 5, sample_ids: '' });
                      setShowNew(true);
                    }}
                    className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 text-[10px] font-bold rounded-lg hover:bg-amber-100 transition-all"
                  >
                    {b.batch_id}{b.variant ? ` · ${b.variant}` : ''}
                  </button>
                ))}
              </div>
            </div>
          );
        })()
      )}

      {/* Session cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {loading ? (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full rounded-xl"/>
            <Skeleton className="h-48 w-full rounded-xl"/>
            <Skeleton className="h-48 w-full rounded-xl"/>
          </div>
        ) : sessions.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm font-medium text-gray-400">
            No panel data recorded. Select a released batch above to start a session.
          </div>
        ) : sessions.map(s => (
          <div key={s.id} className="surface p-6 hover:shadow-md transition-all group relative overflow-hidden">
            {/* Batch tag */}
            {s.batches && (
              <div className="mb-3">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-navy rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                  <FlaskConical className="w-3 h-3"/> {s.batches.batch_id}
                  {s.batches.variant ? ` · ${s.batches.variant}` : ''}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-bold uppercase tracking-wider border border-purple-100 flex items-center gap-1">
                <Users className="w-3 h-3"/> {s.panelist_count} Panelists
              </span>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {new Date(s.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="flex justify-between items-start"><h3 className="text-base font-bold text-gray-900 mb-1">{s.session_title}</h3>
            {employeeProfile.role === 'admin' && (
              <button onClick={() => handleDeleteSession(s.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4"/></button>
            )}
            </div>
            <p className="text-xs font-bold text-navy font-mono mb-5">{s.sample_ids || 'V1 / V2 / V3 Comparison'}</p>

            {/* Sensory radar chart */}
            <div className="h-44 w-full mb-5 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
              <ResearchRadarChart session={s} />
            </div>

            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Composite Score</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-black tracking-tight ${(s.avg_score || 0) >= 7.0 ? 'text-navy' : 'text-red-600'}`}>
                    {s.avg_score || '—'}
                  </span>
                  <span className="text-xs font-semibold text-gray-400">/ 10</span>
                </div>
              </div>
              {(s.avg_score || 0) >= 7.0
                ? <span className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100"><Award className="w-6 h-6"/></span>
                : <span className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100"><Zap className="w-6 h-6"/></span>
              }
            </div>

            {(!s.scores || s.scores.length === 0 || employeeProfile.role === 'admin') && (
            <button
              type="button"
              onClick={() => openScoreModal(s)}
              className="mt-5 w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-navy rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-50 hover:border-navy/30 active:scale-95 transition-all"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {s.scores && s.scores.length > 0 ? 'Edit Scores' : 'Log Scores'}
            </button>
            )}
          </div>
        ))}
      </div>

      {/* Score Logging Modal */}
      {activeSession && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-xl shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden">
            <button
              onClick={closeScoreModal}
              className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 transition-all"
            >
              <X className="w-5 h-5 text-gray-400"/>
            </button>

            <div className="p-6 border-b border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-navy mb-1">Sensory Score Entry</p>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">{activeSession.session_title}</h2>
              {activeSession.batches && (
                <p className="text-xs font-semibold text-gray-500 mt-1">
                  Batch {activeSession.batches.batch_id}{activeSession.batches.variant ? ` - ${activeSession.batches.variant}` : ''}
                </p>
              )}
              
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
                {Array.from({ length: activeSession.panelist_count || 1 }).map((_, idx) => (
                  <button key={idx} onClick={() => setActivePanelist(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${activePanelist === idx ? 'bg-navy text-white border-navy' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                    Panelist {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {getCriteria(activeSession).map((criterion) => (
                <div key={criterion} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">{criterion}</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={scoreForms[activePanelist]?.[criterion] ?? 0}
                      onChange={(event) => updateScore(criterion, event.target.value)}
                      className="w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg font-bold text-sm text-center outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={scoreForms[activePanelist]?.[criterion] ?? 0}
                    onChange={(event) => updateScore(criterion, event.target.value)}
                    className="w-full accent-[#1F3A5F]"
                  />
                </div>
              ))}
            </div>

            <div className="px-6 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Composite Average</p>
                <p className={`text-3xl font-black tracking-tight ${scoreAverage >= 7.0 ? 'text-navy' : 'text-red-600'}`}>
                  {scoreAverage}<span className="text-sm font-semibold text-gray-400"> / 10</span>
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

      {/* New Panel Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setShowNew(false); reset(); }}
              className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 transition-all"
            >
              <X className="w-5 h-5 text-gray-400"/>
            </button>

            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">Panel Setup</h2>
              <p className="text-xs text-gray-500 mt-1">Link a released batch and configure your tasting session.</p>
            </div>

            <form onSubmit={handleSubmit(handleCreateSession)} className="px-6 pb-8 space-y-4">
              {/* Released Batch selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Released Batch</label>
                <select
                  {...register('batch_id')}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                >
                  <option value="">— Select released batch (optional) —</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.batch_id}{b.variant ? ` · ${b.variant}` : ''}{b.experiment_type ? ` [${b.experiment_type}]` : ''}
                    </option>
                  ))}
                </select>
                {errors.batch_id && <p className="text-red-500 text-xs mt-1">{errors.batch_id.message}</p>}
                {batches.length === 0 && (
                  <p className="text-amber-600 text-[10px] font-semibold mt-1">No released batches found. Release a batch first to link it here.</p>
                )}
              </div>

              {/* Session title */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Session Target</label>
                <input
                  placeholder="e.g. Kavuni Pro v3.1 Blind Test"
                  {...register('session_title')}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                />
                {errors.session_title && <p className="text-red-500 text-xs mt-1">{errors.session_title.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Panelists</label>
                  <input
                    type="number" min="1"
                    {...register('panelist_count')}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                  />
                  {errors.panelist_count && <p className="text-red-500 text-xs mt-1">{errors.panelist_count.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Version / IDs</label>
                  <input
                    placeholder="e.g. V1, V2"
                    {...register('sample_ids')}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
                  />
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
    </div>
  );
}
