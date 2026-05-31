'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import {
  Plus, Grid3x3, RefreshCw, FlaskConical, Activity,
  AlertCircle, Clock, ChevronRight, Loader2, ClipboardList,
  CheckCircle2, Beaker, History
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/context/AuthContext';
import EditRequestButton from '@/components/ui/EditRequestButton';

// ── Urgency config ─────────────────────────────────────────────────────────
const URGENCY = {
  overdue:  { label: 'Overdue',   dot: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-50 border-red-200 text-red-700',    ring: 'border-red-200' },
  due_soon: { label: 'Due Soon',  dot: 'bg-amber-400',  text: 'text-amber-700',  badge: 'bg-amber-50 border-amber-200 text-amber-700', ring: 'border-amber-200' },
  active:   { label: 'Active',    dot: 'bg-teal-400',   text: 'text-teal-700',   badge: 'bg-teal-50 border-teal-200 text-teal-700',  ring: 'border-slate-200' },
  upcoming: { label: 'Upcoming',  dot: 'bg-slate-300',  text: 'text-slate-500',  badge: 'bg-slate-50 border-slate-200 text-slate-500', ring: 'border-slate-200' },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function relativeTime(isoStr) {
  if (!isoStr) return '';
  const mins = Math.round((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const h = (mins / 60).toFixed(1);
  return `${h}h ago`;
}

function quickLogUrl(item) {
  const p = new URLSearchParams();
  p.set('source_type', item.source_type);
  if (item.source_type === 'batch') {
    p.set('source_id', item.source_id);
    if (item.flask_id) p.set('flask_id', item.flask_id);
  } else {
    p.set('source_id', item.source_id);
    if (item.time_point_id) p.set('tp_id', item.time_point_id);
  }
  return `/lab-bench/log?${p.toString()}`;
}

function gridUrl(item) {
  const p = new URLSearchParams();
  p.set('source_type', item.source_type);
  p.set('source_id', item.source_id);
  return `/lab-bench/grid?${p.toString()}`;
}

// ── Queue Item Card ────────────────────────────────────────────────────────
function QueueCard({ item }) {
  const u   = URGENCY[item.urgency] || URGENCY.active;
  const isGrowth = item.type === 'growth_timepoint';
  const isFerm   = item.type === 'fermentation_flask';

  return (
    <div className={clsx(
      'bg-white rounded-2xl border p-4 flex items-start gap-3 hover:shadow-sm transition-all',
      u.ring
    )}>
      {/* Urgency dot + icon */}
      <div className="flex flex-col items-center gap-1.5 pt-0.5 shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${u.dot} shrink-0`} />
        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
          {isGrowth
            ? <Activity className="w-3.5 h-3.5 text-slate-500" />
            : <FlaskConical className="w-3.5 h-3.5 text-slate-500" />
          }
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-800 truncate">{item.source_label}</p>

            {/* Sub-label: flask name or timepoint */}
            <p className="text-xs font-bold text-slate-500 mt-0.5">
              {isFerm && item.flask_label && (
                <span className="text-teal-700">{item.flask_label}</span>
              )}
              {isGrowth && (
                <span className="text-violet-700">{item.timepoint_label}</span>
              )}
              {isGrowth && item.sample_types?.length > 0 && (
                <span className="text-slate-400 ml-1">
                  · {item.sample_types.join(', ')}
                </span>
              )}
            </p>
          </div>

          {/* Urgency badge */}
          <span className={clsx(
            'px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0',
            u.badge
          )}>
            {u.label}
          </span>
        </div>

        {/* Detail line */}
        <p className={clsx('text-xs font-bold mt-1.5', u.text)}>
          {item.detail}
        </p>

        {/* Last values (fermentation only) */}
        {isFerm && (item.last_ph != null || item.last_od != null) && (
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            {item.last_ph  != null && `pH ${item.last_ph}`}
            {item.last_ph  != null && item.last_od != null && ' · '}
            {item.last_od  != null && `OD ${item.last_od}`}
            {item.last_elapsed != null && ` @ T+${item.last_elapsed}h`}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          <Link
            href={quickLogUrl(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-black rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" /> Log Now
          </Link>
          <Link
            href={gridUrl(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black rounded-lg transition-colors"
          >
            <Grid3x3 className="w-3 h-3" /> Grid
          </Link>
          <Link
            href={item.source_type === 'batch'
              ? `/batches/${item.source_id}`
              : `/growth-studies/${item.source_id}`
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black rounded-lg transition-colors"
          >
            View <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ urgency, count }) {
  const u = URGENCY[urgency];
  return (
    <div className="flex items-center gap-2 px-1">
      <div className={`w-2 h-2 rounded-full ${u.dot}`} />
      <h2 className={`text-[11px] font-black uppercase tracking-widest ${u.text}`}>
        {u.label}
      </h2>
      <span className={clsx(
        'px-1.5 py-0.5 rounded-full text-[10px] font-black border',
        u.badge
      )}>
        {count}
      </span>
    </div>
  );
}

const TEST_TYPE_LABELS = {
  ph:             'pH',
  od:             'OD',
  sterility:      'Sterility',
  plate_analysis: 'Plate Analysis',
  temperature:    'Temperature',
  brix:           'Brix',
};

function formatTestValue(tr) {
  if (tr.skipped) return `Skipped — ${tr.skip_reason || 'no reason'}`;
  if (tr.numeric_value != null) return `${tr.numeric_value}${tr.unit ? ` ${tr.unit}` : ''}`;
  if (tr.text_value) return tr.text_value;
  return '—';
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function LabBenchPage() {
  const { role, employeeProfile } = useAuth();
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const [queue, setQueue]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [asOf, setAsOf]         = useState(null);
  const [filter, setFilter]     = useState('all'); // 'all' | 'overdue' | 'due_soon' | 'active'
  const [recentEntries, setRecentEntries] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());

  const fetchPendingIds = useCallback(async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await fetch('/api/lab-bench/recent');
      const json = await res.json();
      if (json.success) setRecentEntries(json.data || []);
    } catch (_) {}
    setRecentLoading(false);
  }, []);

  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/lab-bench/queue');
      const json = await res.json();
      if (json.success) {
        setQueue(json);
        setAsOf(json.as_of);
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); fetchRecent(); fetchPendingIds(); }, [load, fetchRecent, fetchPendingIds]);

  // Realtime live-sync replaces old 5-minute polling
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('lab_bench_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_fermentation_readings' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_study_samples' }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [supabase, load]);

  const items    = queue?.items || [];
  const summary  = queue?.summary || {};
  const filtered = filter === 'all' ? items : items.filter(i => i.urgency === filter);

  // Group by urgency for rendering
  const groups = ['overdue', 'due_soon', 'active', 'upcoming']
    .map(u => ({ urgency: u, items: filtered.filter(i => i.urgency === u) }))
    .filter(g => g.items.length > 0);

  const hasUrgent = (summary.overdue || 0) + (summary.due_soon || 0) > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-6">

      {/* ── Action bar (title already shown in layout top bar) ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {!loading && hasUrgent && (
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          )}
          {asOf && (
            <p className="text-xs text-slate-400 font-medium">
              Updated {relativeTime(asOf)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={load}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <Link
            href="/lab-bench/grid"
            className="flex items-center gap-1.5 px-3 py-2.5 bg-violet-100 hover:bg-violet-200 text-violet-700 font-black text-xs rounded-xl transition-colors"
          >
            <Grid3x3 className="w-4 h-4" /> Grid
          </Link>
          <Link
            href="/lab-bench/log"
            className="flex items-center gap-1.5 px-3 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-black text-xs rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Quick Log
          </Link>
        </div>
      </div>

      {/* ── Summary chips ── */}
      {!loading && queue && (
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all',      label: 'All',       count: items.length },
            { key: 'overdue',  label: 'Overdue',   count: summary.overdue  || 0 },
            { key: 'due_soon', label: 'Due Soon',  count: summary.due_soon || 0 },
            { key: 'active',   label: 'Active',    count: summary.active   || 0 },
          ].map(({ key, label, count }) => (
            count > 0 || key === 'all' ? (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition-all',
                  filter === key
                    ? key === 'overdue'  ? 'bg-red-50    border-red-300    text-red-700'
                    : key === 'due_soon' ? 'bg-amber-50  border-amber-300  text-amber-700'
                    : key === 'active'   ? 'bg-teal-50   border-teal-300   text-teal-700'
                    :                      'bg-slate-800 border-slate-800  text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                )}
              >
                {key !== 'all' && (
                  <span className={clsx(
                    'w-1.5 h-1.5 rounded-full',
                    key === 'overdue'  ? 'bg-red-500'
                    : key === 'due_soon' ? 'bg-amber-400'
                    : 'bg-teal-400'
                  )} />
                )}
                {label}
                <span className={clsx(
                  'px-1.5 py-0.5 rounded-full text-[10px]',
                  filter === key ? 'bg-white/30' : 'bg-slate-100 text-slate-600'
                )}>
                  {count}
                </span>
              </button>
            ) : null
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading active runs…</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && items.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7 text-teal-500" />
          </div>
          <p className="font-black text-slate-700">All clear</p>
          <p className="text-slate-400 text-sm font-medium max-w-xs mx-auto">
            No active batches in fermentation or running growth studies right now.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Link href="/batches"        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors">Batches</Link>
            <Link href="/growth-studies" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors">Growth Studies</Link>
          </div>
        </div>
      )}

      {/* ── Queue groups ── */}
      {!loading && groups.map(({ urgency, items: groupItems }) => (
        <div key={urgency} className="space-y-2.5">
          <SectionHeader urgency={urgency} count={groupItems.length} />
          {groupItems.map(item => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      ))}

      {/* ── Module shortcuts (collapsed at bottom) ── */}
      {!loading && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Module Review</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { href: '/batches',             icon: FlaskConical,  label: 'Batches' },
              { href: '/growth-studies',      icon: Activity,      label: 'Growth Studies' },
              { href: '/research/incubation', icon: ClipboardList, label: 'Incubation' },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-500"
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-bold">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── My Recent Entries ── */}
      {!isAdmin && (
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">My Recent Entries</p>
            </div>
            {recentLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
          </div>

          {!recentLoading && recentEntries.length === 0 && (
            <p className="text-xs text-slate-400 font-medium px-1">No entries yet — use Quick Log or Grid to record measurements.</p>
          )}

          {recentEntries.map(sample => (
            <div key={sample.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-black text-slate-700 truncate">
                  {sample.source_label || sample.sample_label}
                  {sample.flask_label && <span className="text-slate-400 font-medium"> · {sample.flask_label}</span>}
                  {sample.timepoint_label && <span className="text-teal-600 font-medium"> {sample.timepoint_label}</span>}
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                  {new Date(sample.collected_at).toLocaleString()}
                </p>
              </div>

              {(sample.test_results || []).filter(tr => !tr.skipped).map(tr => (
                <div key={tr.id} className="flex items-center justify-between px-4 py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider w-20 shrink-0">
                      {TEST_TYPE_LABELS[tr.test_type] || tr.test_type}
                    </span>
                    <span className="text-sm font-black text-slate-800 font-mono">
                      {formatTestValue(tr)}
                    </span>
                    {tr.notes && (
                      <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{tr.notes}</span>
                    )}
                  </div>
                  {tr.entered_by === employeeProfile?.id && (
                    <EditRequestButton
                      tableName="test_results"
                      recordId={tr.id}
                      moduleLabel="Test Result"
                      fields={[
                        { key: 'numeric_value', label: `${TEST_TYPE_LABELS[tr.test_type] || tr.test_type} Value`, type: 'number' },
                        { key: 'text_value',    label: 'Text Result',  type: 'text' },
                        { key: 'notes',         label: 'Notes',        type: 'textarea' },
                      ]}
                      currentData={tr}
                      hasPending={pendingIds.has(tr.id)}
                      allowDelete
                      onSuccess={() => { fetchRecent(); fetchPendingIds(); }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
