'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import {
  Plus, FlaskConical, Beaker, Clock, CheckCircle2, AlertCircle,
  Search, Trash2, BookOpen, ChevronDown, ChevronRight, ExternalLink, Layers,
} from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import IncubationFormModal from './components/IncubationFormModal';

function sterileChip(status) {
  if (status === 'Sterile')       return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (status === 'Contaminated')  return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

function PlateStatusIcon({ record }) {
  if (!record.end_time)                         return <Clock className="w-3.5 h-3.5 text-blue-400" />;
  if (record.sterility_status === 'Sterile')    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (record.sterility_status === 'Contaminated') return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />;
}

export default function SampleIncubationPage() {
  const { employeeProfile, role, loading: authLoading } = useAuth();
  const toast = useToast();
  const [samples, setSamples]                   = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [showModal, setShowModal]               = useState(false);
  const [editData, setEditData]                 = useState(null);
  const [statusFilter, setStatusFilter]         = useState('all');
  const [searchTerm, setSearchTerm]             = useState('');
  const [deletingId, setDeletingId]             = useState(null);
  const [expandedSources, setExpandedSources]   = useState(new Set());
  const [expandedTimepoints, setExpandedTimepoints] = useState(new Set());

  const canDelete = ['admin', 'ceo', 'cto'].includes(role);

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      const res  = await fetch(`/api/research/incubation?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch');
      setSamples(json.data || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [statusFilter, searchTerm, toast]);

  useEffect(() => { fetchSamples(); }, [fetchSamples]);

  // ── Group: source → timepoint → plates ───────────────────────
  const grouped = useMemo(() => {
    const map = new Map();

    for (const r of samples) {
      const srcLabel = r.source_label || r.batches?.batch_id || null;
      const srcKey   = srcLabel || '__other__';

      if (!map.has(srcKey)) {
        map.set(srcKey, {
          key:         srcKey,
          label:       srcLabel || 'Other / Manual',
          batch_id:    r.batch_id    || null,
          batch_code:  r.batches?.batch_id || null,
          source_type: r.source_type || null,
          timepoints:  new Map(),
        });
      }

      const src    = map.get(srcKey);
      const tpHour = r.log_hour;
      const tpKey  = tpHour != null ? `h_${tpHour}` : (r.source_stage || '__none__');
      const tpLabel = r.timepoint_label
        || (tpHour != null ? `T+${Number(tpHour).toFixed(1)}h` : (r.source_stage?.replace(/_/g, ' ') || 'No timepoint'));

      if (!src.timepoints.has(tpKey)) {
        src.timepoints.set(tpKey, { key: tpKey, label: tpLabel, hour: tpHour, records: [] });
      }
      src.timepoints.get(tpKey).records.push(r);
    }

    // Sort timepoints by hour within each source
    for (const src of map.values()) {
      src.timepoints = new Map(
        [...src.timepoints.entries()].sort(([, a], [, b]) => {
          if (a.hour == null && b.hour == null) return 0;
          if (a.hour == null) return 1;
          if (b.hour == null) return -1;
          return a.hour - b.hour;
        }),
      );
    }

    return [...map.values()].sort((a, b) => {
      if (a.key === '__other__') return 1;
      if (b.key === '__other__') return -1;
      return a.label.localeCompare(b.label);
    });
  }, [samples]);

  // Auto-expand all sources and timepoints on first data load
  useEffect(() => {
    if (grouped.length > 0 && expandedSources.size === 0) {
      setExpandedSources(new Set(grouped.map(g => g.key)));
      const tpKeys = new Set();
      grouped.forEach(g => g.timepoints.forEach((_, k) => tpKeys.add(`${g.key}::${k}`)));
      setExpandedTimepoints(tpKeys);
    }
  }, [grouped]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSource = (key) =>
    setExpandedSources(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleTimepoint = (key) =>
    setExpandedTimepoints(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const stats = useMemo(() => {
    const now = Date.now();
    return samples.reduce((acc, s) => {
      if (!s.end_time) acc.ongoing++;
      if (s.sterility_status === 'Contaminated') acc.contaminated++;
      if (!s.end_time && s.start_time && (now - new Date(s.start_time).getTime()) / 36e5 > 72) acc.overdue++;
      acc.total++;
      return acc;
    }, { total: 0, ongoing: 0, contaminated: 0, overdue: 0 });
  }, [samples]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this incubation record? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res  = await fetch(`/api/research/incubation?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
      toast.success('Deleted.');
      fetchSamples();
    } catch (err) { toast.error(err.message); }
    finally { setDeletingId(null); }
  };

  if (authLoading) return <div className="page-container"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900 space-y-6">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <FlaskConical className="w-7 h-7 text-navy" /> Incubation Hub
          </h1>
          <p className="text-sm font-medium text-gray-500 mt-1">All plated samples, grouped by batch and log-hour timepoint</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/lab-bench/log"
            className="flex items-center px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all"
          >
            <ExternalLink className="w-4 h-4 mr-1.5" /> Log in Lab Bench
          </Link>
          <button
            onClick={() => { setEditData(null); setShowModal(true); }}
            className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Manual Entry
          </button>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Batches / Sources', grouped.length,        'text-gray-900'],
          ['Ongoing Plates',    stats.ongoing,         'text-blue-700'],
          ['Over 72h Open',     stats.overdue,         stats.overdue      ? 'text-amber-700' : 'text-gray-900'],
          ['Contaminated',      stats.contaminated,    stats.contaminated ? 'text-red-700'   : 'text-gray-900'],
        ].map(([label, value, color]) => (
          <div key={label} className="surface p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
            <p className={`mt-1 text-2xl font-black font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <div className="surface p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search sample name…"
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold outline-none focus:border-navy"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold outline-none focus:border-navy"
        >
          <option value="all">All statuses</option>
          <option value="ongoing">Ongoing only</option>
          <option value="completed">Completed only</option>
        </select>
      </div>

      {/* ── Grouped view ──────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="surface p-16 text-center">
          <FlaskConical className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No incubation records found.</p>
          <Link href="/lab-bench/log" className="mt-3 inline-block text-navy font-bold text-sm hover:underline">
            Log samples in Lab Bench →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(src => {
            const isExpanded       = expandedSources.has(src.key);
            const allRecords       = [...src.timepoints.values()].flatMap(tp => tp.records);
            const ongoingCount     = allRecords.filter(r => !r.end_time).length;
            const contaminatedCount = allRecords.filter(r => r.sterility_status === 'Contaminated').length;

            return (
              <div key={src.key} className="surface overflow-hidden">

                {/* Source (batch) header */}
                <button
                  onClick={() => toggleSource(src.key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${src.key === '__other__' ? 'bg-gray-100' : 'bg-navy/10'}`}>
                      <Layers className={`w-4 h-4 ${src.key === '__other__' ? 'text-gray-400' : 'text-navy'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-900">{src.label}</span>
                        {src.batch_id && (
                          <Link
                            href={`/batches/${src.batch_id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-[10px] font-mono text-navy hover:underline border border-navy/20 px-1.5 py-0.5 rounded"
                          >
                            View Batch →
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-400">
                          {allRecords.length} plate{allRecords.length !== 1 ? 's' : ''} · {src.timepoints.size} timepoint{src.timepoints.size !== 1 ? 's' : ''}
                        </span>
                        {ongoingCount > 0 && (
                          <span className="text-[10px] font-bold text-blue-600">{ongoingCount} ongoing</span>
                        )}
                        {contaminatedCount > 0 && (
                          <span className="text-[10px] font-bold text-red-600">{contaminatedCount} contaminated</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {src.batch_id && (
                      <Link
                        href="/lab-bench/log"
                        onClick={e => e.stopPropagation()}
                        className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-teal-200 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Log Sample
                      </Link>
                    )}
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Timepoints + plates */}
                {isExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {[...src.timepoints.values()].map(tp => {
                      const tpFullKey  = `${src.key}::${tp.key}`;
                      const isTpOpen   = expandedTimepoints.has(tpFullKey);
                      const tpOngoing  = tp.records.filter(r => !r.end_time).length;
                      const tpDone     = tp.records.filter(r => r.end_time).length;

                      return (
                        <div key={tp.key}>
                          {/* Timepoint row */}
                          <button
                            onClick={() => toggleTimepoint(tpFullKey)}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                              <span className="text-sm font-black text-gray-700">{tp.label}</span>
                              <span className="text-[10px] font-bold text-gray-400">
                                {tp.records.length} plate{tp.records.length !== 1 ? 's' : ''}
                              </span>
                              {tpOngoing > 0 && (
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                  {tpOngoing} ongoing
                                </span>
                              )}
                              {tpDone > 0 && (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                  {tpDone} done
                                </span>
                              )}
                            </div>
                            {isTpOpen
                              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                          </button>

                          {/* Plate tiles grid */}
                          {isTpOpen && (
                            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {[...tp.records]
                                .sort((a, b) => (a.plate_index ?? 0) - (b.plate_index ?? 0))
                                .map(record => (
                                  <div
                                    key={record.id}
                                    onClick={() => { setEditData(record); setShowModal(true); }}
                                    className="cursor-pointer rounded-xl border border-gray-200 hover:border-navy hover:shadow-sm transition-all p-3 bg-white group"
                                  >
                                    {/* Tile header */}
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <Beaker className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                        <span className="text-xs font-black text-gray-800 truncate">
                                          {record.plate_label || (record.plate_total ? `Plate ${record.plate_index || 1}/${record.plate_total}` : 'Plate')}
                                        </span>
                                      </div>
                                      <PlateStatusIcon record={record} />
                                    </div>

                                    {/* Flask */}
                                    {record.batch_flasks?.flask_label && (
                                      <p className="text-[10px] font-mono text-gray-500 mb-1">
                                        Flask: {record.batch_flasks.flask_label}
                                      </p>
                                    )}

                                    {/* Media / observation snippet */}
                                    {record.observation && (
                                      <p className="text-[9px] text-gray-400 truncate mb-1.5">
                                        {record.observation.split(' | ')[0]}
                                      </p>
                                    )}

                                    {/* Sterility chip */}
                                    <div className="flex items-center justify-between">
                                      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${sterileChip(record.sterility_status || 'Pending')}`}>
                                        {record.sterility_status || 'Pending'}
                                      </span>
                                      {record.end_time && record.duration_hours != null && (
                                        <span className="text-[9px] font-mono text-gray-400">
                                          {Number(record.duration_hours).toFixed(0)}h
                                        </span>
                                      )}
                                    </div>

                                    {/* Results */}
                                    {(record.colony_count != null || record.cfu_per_ml != null) && (
                                      <div className="mt-1.5 text-[9px] font-mono text-gray-500 space-y-0.5">
                                        {record.colony_count != null && <p>Colonies: {record.colony_count}</p>}
                                        {record.cfu_per_ml  != null && <p>CFU/mL: {record.cfu_per_ml}</p>}
                                      </div>
                                    )}

                                    {/* Hover actions */}
                                    <div className="flex justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {record.linked_lnb_id && (
                                        <Link
                                          href={`/lab-notebook/${record.linked_lnb_id}`}
                                          onClick={e => e.stopPropagation()}
                                          className="p-1 text-gray-400 hover:text-emerald-600 rounded"
                                          title="View Lab Notebook"
                                        >
                                          <BookOpen className="w-3 h-3" />
                                        </Link>
                                      )}
                                      {canDelete && (
                                        <button
                                          onClick={e => { e.stopPropagation(); handleDelete(record.id); }}
                                          disabled={deletingId === record.id}
                                          className="p-1 text-gray-400 hover:text-red-500 rounded disabled:opacity-40"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <IncubationFormModal
          onClose={() => setShowModal(false)}
          initialData={editData}
          onSuccess={() => { setShowModal(false); fetchSamples(); toast.success('Record saved!'); }}
        />
      )}
    </div>
  );
}
