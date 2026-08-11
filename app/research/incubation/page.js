'use client';
import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import Link from 'next/link';
import {
  Plus, FlaskConical, Beaker, Clock, CheckCircle2, AlertCircle,
  Search, Trash2, BookOpen, ChevronDown, ChevronRight, ExternalLink, Layers,
  ChevronUp, TrendingUp, TrendingDown, LayoutGrid, List, Columns, Table as TableIcon
} from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import IncubationFormModal from './components/IncubationFormModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CreatorBadge from '@/components/ui/CreatorBadge';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sterileChip(status) {
  if (status === 'Sterile')       return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (status === 'Contaminated')  return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

function PlateStatusIcon({ record }) {
  if (!record.end_time)                              return <Clock className="w-3.5 h-3.5 text-slate-400" />;
  if (record.sterility_status === 'Sterile')         return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (record.sterility_status === 'Contaminated')    return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />;
}

function parseObservation(obs) {
  if (!obs) return { reads: [], notes: '' };
  try {
    const p = JSON.parse(obs);
    if (p && Array.isArray(p.reads)) return { reads: p.reads, notes: p.notes || '' };
  } catch {}
  return { reads: [], notes: '' };
}

function parseMorphologyChips(raw) {
  const CHIP_COLORS = {
    shape:     'bg-slate-50 text-slate-700 border-slate-200',
    margin:    'bg-slate-50 text-slate-700 border-slate-200',
    elevation: 'bg-slate-50 text-slate-700 border-slate-200',
    color:     'bg-amber-50 text-amber-700 border-amber-200',
    surface:   'bg-red-50 text-red-700 border-red-200',
  };
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length > 0) {
      return (
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(p).map(([trait, choice]) => (
            <span key={trait} className={`px-2 py-0.5 rounded text-xs font-black border ${CHIP_COLORS[trait] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              {choice}
            </span>
          ))}
        </div>
      );
    }
  } catch {}
  return <span className="text-xs text-slate-500">{raw}</span>;
}

/** Format ms duration as "2h 15min" */
function formatDue(ms) {
  if (ms <= 0) return 'now';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0)           return `${h}h`;
  return `${m}min`;
}

// ---------------------------------------------------------------------------
// Reads-Due-Today alert panel
// ---------------------------------------------------------------------------

function ReadsDuePanel({ samples, onLogRead }) {
  const [collapsed, setCollapsed] = useState(false);

  const dueItems = useMemo(() => {
    const now = Date.now();
    const horizon = 4 * 60 * 60 * 1000; // 4 hours in ms
    const items = [];

    for (const s of samples) {
      if (s.end_time || !s.start_time) continue;
      const startMs = new Date(s.start_time).getTime();
      const { reads } = parseObservation(s.observation);
      const loggedHours = new Set(reads.map(r => r.hour));

      for (const h of [12, 24, 36, 48]) {
        const dueMs = startMs + h * 3600 * 1000;
        const msUntilDue = dueMs - now;
        if (!loggedHours.has(h) && msUntilDue >= 0 && msUntilDue <= horizon) {
          items.push({ record: s, hour: h, msUntilDue });
        }
      }
    }

    return items.sort((a, b) => a.msUntilDue - b.msUntilDue);
  }, [samples]);

  if (dueItems.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-black text-amber-800">
            Reads Due Soon ({dueItems.length})
          </span>
          <span className="text-xs font-bold text-amber-600">
            -- samples with plate reads due in the next 4 hours
          </span>
        </div>
        {collapsed
          ? <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-amber-500 shrink-0" />}
      </button>

      {!collapsed && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {dueItems.map(({ record, hour, msUntilDue }) => (
            <div key={`${record.id}-${hour}`} className="flex items-center justify-between px-5 py-2.5 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-amber-900 truncate">{record.sample_name}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {record.batches?.batch_id || record.source_label || 'No batch'}
                  {' -- '}
                  <span className="font-black">{hour}h read due in {formatDue(msUntilDue)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLogRead(record)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider transition-colors"
              >
                Log Read
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Growth curve chart
// ---------------------------------------------------------------------------

function GrowthCurveChart({ observation }) {
  const { reads } = parseObservation(observation);
  if (!reads || reads.length < 2) return null;

  const data = reads
    .filter(r => r.hour != null)
    .sort((a, b) => a.hour - b.hour)
    .map(r => ({
      hour: r.hour,
      colonies: r.colony_count != null && r.colony_count !== '' ? Number(r.colony_count) : null,
    }))
    .filter(d => d.colonies !== null);

  if (data.length < 2) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Growth Curve</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            tickFormatter={v => `T+${v}h`}
          />
          <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} />
          <Tooltip
            contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(v) => [v, 'Colony Count']}
            labelFormatter={(v) => `T+${v}h`}
          />
          <Line
            type="monotone"
            dataKey="colonies"
            stroke="#1d4ed8"
            strokeWidth={2}
            dot={{ r: 3, fill: '#1d4ed8' }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OD trend chart (for broth samples)
// ---------------------------------------------------------------------------

function ODTrendChart({ observation }) {
  const { reads } = parseObservation(observation);
  if (!reads || reads.length < 2) return null;

  const data = reads
    .filter(r => r.hour != null && r.od_value != null && r.od_value !== '')
    .sort((a, b) => a.hour - b.hour)
    .map(r => ({ hour: r.hour, od: Number(r.od_value) }));

  if (data.length < 2) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">OD Trend</p>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `T+${v}h`} />
          <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} />
          <Tooltip
            contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(v) => [v.toFixed(3), 'OD']}
            labelFormatter={(v) => `T+${v}h`}
          />
          <Line type="monotone" dataKey="od" stroke="#0d9488" strokeWidth={2} dot={{ r: 3, fill: '#0d9488' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded plate tile (shows charts)
// ---------------------------------------------------------------------------

function ExpandedPlateDetail({ record }) {
  const { reads, notes } = parseObservation(record.observation);

  return (
    <div className="border-t border-slate-100 mt-2 pt-2 space-y-2">
      {/* Colony morphology chips */}
      {record.colony_morphology && (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Morphology</p>
          {parseMorphologyChips(record.colony_morphology)}
        </div>
      )}

      {/* Dilution info */}
      {(record.dilution_factor != null || record.volume_plated_ml != null || record.replicate_label) && (
        <div className="flex flex-wrap gap-2 text-xs font-mono text-slate-500">
          {record.dilution_factor != null && (
            <span className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
              Dilution: {record.dilution_factor}
            </span>
          )}
          {record.volume_plated_ml != null && (
            <span className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
              Vol: {record.volume_plated_ml}mL
            </span>
          )}
          {record.replicate_label && record.replicate_label !== 'None' && (
            <span className="bg-slate-50 border border-slate-200 text-slate-700 rounded px-1.5 py-0.5 font-black">
              Rep {record.replicate_label}
            </span>
          )}
        </div>
      )}

      {/* Reads summary */}
      {reads.length > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Plate Reads</p>
          <div className="space-y-0.5">
            {reads.map(r => (
              <div key={r.hour} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-slate-500 w-10 shrink-0">T+{r.hour}h</span>
                <span className={`font-black px-1.5 py-0.5 rounded border text-xs ${
                  r.status === 'growing'      ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                  r.status === 'contaminated' ? 'text-red-700 bg-red-50 border-red-200' :
                  r.status === 'tntc'         ? 'text-amber-700 bg-amber-50 border-amber-200' :
                  'text-slate-600 bg-slate-50 border-slate-200'
                }`}>
                  {r.status?.replace(/_/g, ' ')}
                </span>
                {r.colony_count != null && r.colony_count !== '' && (
                  <span className="text-slate-500">{r.colony_count} col</span>
                )}
                {r.notes && <span className="text-slate-400 truncate">{r.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <GrowthCurveChart observation={record.observation} />
      <ODTrendChart observation={record.observation} />

      {notes && (
        <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">{notes}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contamination rate analytics card
// ---------------------------------------------------------------------------

function ContaminationCard({ samples }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 3600 * 1000;

    const recent   = samples.filter(s => new Date(s.created_at).getTime() > sevenDaysAgo);
    const previous = samples.filter(s => {
      const t = new Date(s.created_at).getTime();
      return t > fourteenDaysAgo && t <= sevenDaysAgo;
    });

    const pct = (arr) => {
      if (arr.length === 0) return 0;
      return Math.round((arr.filter(s => s.sterility_status === 'Contaminated').length / arr.length) * 100);
    };

    const overall        = pct(samples);
    const recentPct      = pct(recent);
    const previousPct    = pct(previous);
    const trend          = previous.length > 0 ? recentPct - previousPct : null;

    // By category
    const categories = ['Fermentation IPC', 'Cell Bank', 'Passage', 'Subculture', 'Other'];
    const byCategory = categories.map(cat => {
      const catSamples = samples.filter(s => s.sample_category === cat);
      return { cat, total: catSamples.length, pct: pct(catSamples) };
    }).filter(x => x.total > 0);

    return { overall, trend, byCategory };
  }, [samples]);

  return (
    <div className="card p-4 col-span-2 md:col-span-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Contamination Rate</p>
          <div className="flex items-center gap-2 mt-1">
            <p className={`text-2xl font-black font-mono ${stats.overall > 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {stats.overall}%
            </p>
            {stats.trend !== null && (
              <span className={`flex items-center gap-0.5 text-xs font-black ${
                stats.trend > 0 ? 'text-red-600' : stats.trend < 0 ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {stats.trend > 0
                  ? <TrendingUp className="w-3 h-3" />
                  : stats.trend < 0
                  ? <TrendingDown className="w-3 h-3" />
                  : null}
                {stats.trend > 0 ? '+' : ''}{stats.trend}% vs prev 7d
              </span>
            )}
          </div>
        </div>
      </div>

      {/* By category bars */}
      {stats.byCategory.length > 0 && (
        <div className="space-y-1.5">
          {stats.byCategory.map(({ cat, total, pct }) => (
            <div key={cat} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-28 shrink-0 truncate">{cat}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct > 0 ? 'bg-red-400' : 'bg-emerald-300'}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="text-xs font-black text-slate-600 w-8 text-right">{pct}%</span>
              <span className="text-xs text-slate-400 w-10 text-right">({total})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Replicate group tile
// ---------------------------------------------------------------------------

function ReplicateGroupTile({ records, onEdit, onDelete, canDelete, deletingId, setConfirmDeleteId }) {
  const [expanded, setExpanded] = useState(false);

  // Sort by replicate label
  const sorted = [...records].sort((a, b) =>
    (a.replicate_label || '').localeCompare(b.replicate_label || '')
  );

  const labels = sorted.map(r => r.replicate_label || '?').filter(Boolean);
  const counts = sorted.map(r => r.colony_count).filter(v => v != null);
  const meanCount = counts.length > 0
    ? Math.round(counts.reduce((a, b) => a + Number(b), 0) / counts.length)
    : null;

  // Use first record for shared metadata
  const first = sorted[0];
  const anyContaminated = records.some(r => r.sterility_status === 'Contaminated');
  const anyOngoing      = records.some(r => !r.end_time);

  return (
    <div
      className={`rounded-xl border transition-all p-3 bg-white group cursor-pointer ${
        expanded ? 'border-navy shadow-sm' : 'border-slate-200 hover:border-navy hover:shadow-sm'
      }`}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Tile header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Beaker className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-black text-slate-800 truncate">
            {first.plate_label || first.sample_name || 'Plate'}
            {first.dilution_factor != null ? ` (Dil: ${first.dilution_factor})` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {anyOngoing && <Clock className="w-3.5 h-3.5 text-slate-400" />}
          {anyContaminated && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
        </div>
      </div>

      {/* Replicate chips */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {labels.map((lbl, i) => (
          <span key={lbl} className={`px-2 py-0.5 rounded text-xs font-black border ${
            sorted[i].sterility_status === 'Contaminated'
              ? 'bg-red-50 text-red-700 border-red-200'
              : sorted[i].sterility_status === 'Sterile'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}>
            {lbl}
          </span>
        ))}
        <span className="text-xs text-slate-400 ml-1">triplicate</span>
      </div>

      {/* Mean count */}
      {meanCount !== null && (
        <p className="text-xs font-mono text-slate-500 mb-1">
          Mean colonies: {meanCount}
        </p>
      )}

      {/* Media lot */}
      {first.media_lot && (
        <p className="text-xs text-slate-400 mb-1">Media: {first.media_lot}</p>
      )}

      {/* Sterility summary + creator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 flex-wrap">
          {sorted.map(r => (
            <span key={r.id} className={`text-xs font-black uppercase px-1.5 py-0.5 rounded border ${sterileChip(r.sterility_status || 'Pending')}`}>
              {r.replicate_label}: {r.sterility_status || 'Pending'}
            </span>
          ))}
        </div>
        {first.employees && (
          <CreatorBadge initials={first.employees.initials} fullName={first.employees.full_name} />
        )}
      </div>

      {/* Expanded detail -- show first record's charts */}
      {expanded && (
        <div onClick={e => e.stopPropagation()}>
          <ExpandedPlateDetail record={first} />
          {/* Edit first replicate */}
          <div className="flex justify-end gap-2 mt-2 flex-wrap">
            {sorted.map(r => (
              <div key={r.id} className="flex items-center gap-1 border border-navy/20 bg-navy/5 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onEdit(r); }}
                  className="px-2 py-1 rounded-md text-xs font-black text-navy hover:bg-navy/10 transition-colors"
                >
                  Edit {r.replicate_label}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                    disabled={deletingId === r.id}
                    className="p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 disabled:opacity-40"
                    title={`Delete replicate ${r.replicate_label}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single plate tile (with expand)
// ---------------------------------------------------------------------------

function SinglePlateTile({ record, onEdit, onDelete, canDelete, deletingId, setConfirmDeleteId }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      className={`cursor-pointer rounded-xl border transition-all p-3 bg-white group ${
        expanded ? 'border-navy shadow-sm' : 'border-slate-200 hover:border-navy hover:shadow-sm'
      }`}
    >
      {/* Tile header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Beaker className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-black text-slate-800 truncate">
            {record.plate_label || record.sample_name || (record.plate_total ? `Plate ${record.plate_index || 1}/${record.plate_total}` : 'Plate')}
          </span>
        </div>
        <PlateStatusIcon record={record} />
      </div>

      {/* Manual entry number */}
      {record.manual_entry_no && (
        <p className="text-xs font-mono text-navy/60 mb-1">{record.manual_entry_no}</p>
      )}

      {/* Flask */}
      {record.batch_flasks?.flask_label && (
        <p className="text-xs font-mono text-slate-500 mb-1">
          Flask: {record.batch_flasks.flask_label}
        </p>
      )}

      {/* Media lot */}
      {record.media_lot && (
        <p className="text-xs text-slate-400 mb-1">Media: {record.media_lot}</p>
      )}

      {/* Replicate label chip */}
      {record.replicate_label && record.replicate_label !== 'None' && (
        <span className="inline-block text-xs font-black px-1.5 py-0.5 rounded border bg-slate-50 text-slate-700 border-slate-200 mb-1">
          Rep {record.replicate_label}
        </span>
      )}

      {/* Observation snippet */}
      {record.observation && !expanded && (
        <p className="text-xs text-slate-400 truncate mb-1.5">
          {(() => {
            try {
              const p = JSON.parse(record.observation);
              if (p?.reads?.length > 0) {
                const last = p.reads[p.reads.length - 1];
                const authorStr = last.recorded_by ? ` (${last.recorded_by})` : '';
                return `T+${last.hour}h: ${last.status?.replace(/_/g, ' ')}${authorStr}`;
              }
              return p?.notes || '';
            } catch { return record.observation.split(' | ')[0]; }
          })()}
        </p>
      )}

      {/* Sterility chip + creator */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${sterileChip(record.sterility_status || 'Pending')}`}>
          {record.sterility_status || 'Pending'}
        </span>
        <div className="flex items-center gap-1.5">
          {record.employees ? (
            <CreatorBadge initials={record.employees.initials} fullName={record.employees.full_name} />
          ) : record.logged_by ? null : (
            <span className="text-xs text-slate-300 font-mono">auto</span>
          )}
          {record.end_time && record.duration_hours != null && (
            <span className="text-xs font-mono text-slate-400">
              {Number(record.duration_hours).toFixed(0)}h
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {(record.colony_count != null || record.cfu_per_ml != null) && (
        <div className="mt-1.5 text-xs font-mono text-slate-500 space-y-0.5">
          {record.colony_count != null && <p>Colonies: {record.colony_count}</p>}
          {record.cfu_per_ml  != null && <p>CFU/mL: {record.cfu_per_ml}</p>}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div onClick={e => e.stopPropagation()}>
          <ExpandedPlateDetail record={record} />
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onEdit(record); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-navy text-white hover:bg-navy/90 transition-colors"
            >
              Log Read / Edit
            </button>
            <div className="flex items-center gap-1">
              {record.linked_lnb_id && (
                <Link
                  href={`/lab-notebook/${record.linked_lnb_id}`}
                  onClick={e => e.stopPropagation()}
                  className="p-1 text-slate-400 hover:text-emerald-600 rounded"
                  title="View Lab Notebook"
                >
                  <BookOpen className="w-3 h-3" />
                </Link>
              )}
              {canDelete && (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(record.id); }}
                  disabled={deletingId === record.id}
                  className="p-1 text-slate-400 hover:text-red-500 rounded disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions row (collapsed) */}
      {!expanded && (
        <div className="flex justify-end gap-1 mt-2">
          {record.linked_lnb_id && (
            <Link
              href={`/lab-notebook/${record.linked_lnb_id}`}
              onClick={e => e.stopPropagation()}
              className="p-1 text-slate-400 hover:text-emerald-600 rounded"
              title="View Lab Notebook"
            >
              <BookOpen className="w-3 h-3" />
            </Link>
          )}
          {canDelete && (
            <button
              onClick={e => { e.stopPropagation(); setConfirmDeleteId(record.id); }}
              disabled={deletingId === record.id}
              className="p-1 text-slate-400 hover:text-red-500 rounded disabled:opacity-40"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SampleIncubationPage() {
  const { employeeProfile, role, loading: authLoading } = useAuth();
  const toast = useToast();
  const [samples, setSamples]                   = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [showModal, setShowModal]               = useState(false);
  const [editData, setEditData]                 = useState(null);
  const [statusFilter, setStatusFilter]         = useState('all');
  const [searchTerm, setSearchTerm]             = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [deletingId, setDeletingId]             = useState(null);
  const [confirmDeleteId, setConfirmDeleteId]   = useState(null);
  const [expandedSources, setExpandedSources]   = useState(new Set());
  const [expandedTimepoints, setExpandedTimepoints] = useState(new Set());
  const [viewMode, setViewMode] = useState('kanban');

  useEffect(() => {
    const saved = localStorage.getItem('incubation_view_mode');
    if (saved && ['list', 'kanban', 'table'].includes(saved)) {
      setViewMode(saved);
    }
  }, []);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('incubation_view_mode', mode);
  };

  const canDelete = ['admin', 'ceo', 'cto'].includes(role);

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      const res  = await withTimeout(fetch(`/api/research/incubation?${params.toString()}`), 45000, 'Incubation samples load timed out');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch');
      setSamples(json.data || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [statusFilter, searchTerm, toast]);

  useEffect(() => { fetchSamples(); }, [fetchSamples]);

  // Group: source -> timepoint -> plates
  const grouped = useMemo(() => {
    const map = new Map();

    for (const r of samples) {
      const srcLabel = r.source_label || r.batches?.batch_id || null;
      const srcKey   = srcLabel || '__other__';

      if (!map.has(srcKey)) {
        map.set(srcKey, {
          key:          srcKey,
          label:        srcLabel || 'Other / Manual',
          batch_id:     r.batch_id    || null,
          batch_code:   r.batches?.batch_id || null,
          batch_status: r.batches?.status || null,
          source_type:  r.source_type || null,
          timepoints:   new Map(),
        });
      }

      const src    = map.get(srcKey);
      const tpHour = r.log_hour;
      const tpKey  = tpHour != null ? `h_${tpHour}` : (r.source_stage || '__none__');
      const tpLabel = r.timepoint_label
        || (tpHour != null ? `T+${Number(tpHour).toFixed(1)}h` : (r.source_stage ? `Sampled at: ${r.source_stage.replace(/_/g, ' ')}` : 'No timepoint'));

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

  const openEdit = (record) => {
    setEditData(record);
    setShowModal(true);
  };

  if (authLoading) return <div className="page-container"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-slate-900 space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <FlaskConical className="w-7 h-7 text-navy" /> Incubation Hub
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">All plated samples, grouped by batch and log-hour timepoint</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/lab-bench/log"
            className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all"
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

      {/* Reads Due Today alert panel */}
      {!loading && (
        <ReadsDuePanel samples={samples} onLogRead={openEdit} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Batches / Sources', grouped.length,        'text-slate-900'],
          ['Ongoing Plates',    stats.ongoing,         'text-slate-700'],
          ['Over 72h Open',     stats.overdue,         stats.overdue      ? 'text-amber-700' : 'text-slate-900'],
          ['Contaminated',      stats.contaminated,    stats.contaminated ? 'text-red-700'   : 'text-slate-900'],
        ].map(([label, value, color]) => (
          <div key={label} className="card p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`mt-1 text-2xl font-black font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Contamination rate analytics card */}
      {!loading && samples.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ContaminationCard samples={samples} />
        </div>
      )}

      {/* Filters & Views */}
      <div className="card p-3 flex flex-col md:flex-row gap-3 justify-between">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg self-start">
          {[
            { id: 'kanban', icon: Columns, label: 'Kanban' },
            { id: 'list',   icon: List,    label: 'List' },
            { id: 'table',  icon: TableIcon, label: 'Table' },
          ].map(v => {
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => handleViewModeChange(v.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  viewMode === v.id
                    ? 'bg-white text-navy shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:bg-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1 md:flex-initial">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search sample name..."
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none focus:border-navy"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none focus:border-navy"
        >
          <option value="all">All statuses</option>
          <option value="ongoing">Ongoing only</option>
          <option value="completed">Completed only</option>
        </select>
        </div>
      </div>

      {/* Views */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="card p-16 text-center">
          <FlaskConical className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No incubation records found.</p>
          <Link href="/lab-bench/log" className="mt-3 inline-block text-navy font-bold text-sm hover:underline">
            Log samples in Lab Bench
          </Link>
        </div>
      ) : (
        <>
          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <div className="space-y-3">
              {grouped.map(src => {
            const isExpanded        = expandedSources.has(src.key);
            const allRecords        = [...src.timepoints.values()].flatMap(tp => tp.records);
            const ongoingCount      = allRecords.filter(r => !r.end_time).length;
            const contaminatedCount = allRecords.filter(r => r.sterility_status === 'Contaminated').length;

            return (
              <div key={src.key} className="card overflow-hidden">

                {/* Source (batch) header */}
                <button
                  onClick={() => toggleSource(src.key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50/70 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${src.key === '__other__' ? 'bg-slate-100' : 'bg-navy/10'}`}>
                      <Layers className={`w-4 h-4 ${src.key === '__other__' ? 'text-slate-400' : 'text-navy'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900">{src.label}</span>
                        {src.batch_status && (
                          <span className={`text-xs font-black uppercase px-1.5 py-0.5 rounded border ${
                            src.batch_status === 'released'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            src.batch_status === 'rejected'   ? 'bg-red-50 text-red-700 border-red-200' :
                            src.batch_status === 'fermenting' ? 'bg-slate-50 text-slate-700 border-slate-200' :
                            'bg-slate-50 text-slate-500 border-slate-200'
                          }`} title="Current batch status">Batch: {src.batch_status}</span>
                        )}
                        {src.batch_id && (
                          <Link
                            href={`/batches/${src.batch_id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs font-mono text-navy hover:underline border border-navy/20 px-1.5 py-0.5 rounded"
                          >
                            View Batch
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-400">
                          {allRecords.length} plate{allRecords.length !== 1 ? 's' : ''} -- {src.timepoints.size} timepoint{src.timepoints.size !== 1 ? 's' : ''}
                        </span>
                        {ongoingCount > 0 && (
                          <span className="text-xs font-bold text-slate-600">{ongoingCount} ongoing</span>
                        )}
                        {contaminatedCount > 0 && (
                          <span className="text-xs font-bold text-red-600">{contaminatedCount} contaminated</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {src.batch_id && (
                      <Link
                        href="/lab-bench/log"
                        onClick={e => e.stopPropagation()}
                        className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-lg border border-slate-200 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Log Sample
                      </Link>
                    )}
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400" />
                      : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {/* Timepoints + plates */}
                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-gray-50">
                    {[...src.timepoints.values()].map(tp => {
                      const tpFullKey = `${src.key}::${tp.key}`;
                      const isTpOpen  = expandedTimepoints.has(tpFullKey);
                      const tpOngoing = tp.records.filter(r => !r.end_time).length;
                      const tpDone    = tp.records.filter(r => r.end_time).length;

                      // Group records by replicate_label
                      // A "replicate group" = same (batch_id, log_hour, sample_name) with A/B/C labels
                      const replicateGroups = (() => {
                        const groups = new Map();
                        const singles = [];

                        for (const r of tp.records) {
                          if (!r.replicate_label || r.replicate_label === 'None') {
                            singles.push(r);
                            continue;
                          }
                          // Key: batch_id + log_hour + sample_name + dilution_factor
                          const gKey = `${r.batch_id || ''}|${r.log_hour}|${r.sample_name}|${r.dilution_factor || ''}`;
                          if (!groups.has(gKey)) groups.set(gKey, []);
                          groups.get(gKey).push(r);
                        }

                        const result = [];
                        for (const grp of groups.values()) {
                          if (grp.length > 1) {
                            result.push({ type: 'group', records: grp });
                          } else {
                            singles.push(...grp);
                          }
                        }
                        for (const r of singles) {
                          result.push({ type: 'single', records: [r] });
                        }
                        // Sort: groups first, then singles, each by plate_index
                        result.sort((a, b) => {
                          if (a.type === 'group' && b.type !== 'group') return -1;
                          if (b.type === 'group' && a.type !== 'group') return 1;
                          return (a.records[0].plate_index ?? 0) - (b.records[0].plate_index ?? 0);
                        });
                        return result;
                      })();

                      return (
                        <div key={tp.key}>
                          {/* Timepoint row */}
                          <button
                            onClick={() => toggleTimepoint(tpFullKey)}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                              <span className="text-sm font-black text-slate-700">{tp.label}</span>
                              <span className="text-xs font-bold text-slate-400">
                                {tp.records.length} plate{tp.records.length !== 1 ? 's' : ''}
                              </span>
                              {tpOngoing > 0 && (
                                <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                                  {tpOngoing} ongoing
                                </span>
                              )}
                              {tpDone > 0 && (
                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                  {tpDone} done
                                </span>
                              )}
                            </div>
                            {isTpOpen
                              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          </button>

                          {/* Plate tiles grid */}
                          {isTpOpen && (
                            <div className="px-5 pb-5 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {replicateGroups.map((item, idx) => {
                                if (item.type === 'group') {
                                  return (
                                    <ReplicateGroupTile
                                      key={`grp-${idx}`}
                                      records={item.records}
                                      onEdit={openEdit}
                                      canDelete={canDelete}
                                      deletingId={deletingId}
                                      setConfirmDeleteId={setConfirmDeleteId}
                                    />
                                  );
                                }
                                const record = item.records[0];
                                return (
                                  <SinglePlateTile
                                    key={record.id}
                                    record={record}
                                    onEdit={openEdit}
                                    canDelete={canDelete}
                                    deletingId={deletingId}
                                    setConfirmDeleteId={setConfirmDeleteId}
                                  />
                                );
                              })}
                            </div>
                            {/* Quick: add another plate for this timepoint */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const firstRecord = tp.records[0];
                                  setEditData({
                                    ...firstRecord,
                                    id: undefined,
                                    replicate_label: '',
                                    sterility_status: 'Pending',
                                    colony_count: null,
                                    cfu_per_ml: null,
                                    observation: null,
                                    end_time: null,
                                  });
                                  setShowModal(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border border-dashed border-navy/30 text-navy hover:bg-navy/5 transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Add plate for this timepoint
                              </button>
                              <span className="text-xs text-slate-400">
                                Use Replicate A / B / C to group plates from the same sample
                              </span>
                            </div>
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

          {/* KANBAN VIEW */}
          {viewMode === 'kanban' && (
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
              {grouped.map(src => {
                const allRecords        = [...src.timepoints.values()].flatMap(tp => tp.records);
                const ongoingCount      = allRecords.filter(r => !r.end_time).length;
                const contaminatedCount = allRecords.filter(r => r.sterility_status === 'Contaminated').length;

                return (
                  <div key={src.key} className="w-80 shrink-0 snap-start flex flex-col max-h-[calc(100vh-200px)]">
                    <div className="bg-slate-200/50 rounded-t-xl p-3 border border-b-0 border-slate-200 flex flex-col gap-1.5 shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900 truncate">{src.label}</span>
                        {src.batch_status && (
                          <span className={`text-[10px] font-black uppercase px-1 py-0.5 rounded border ${
                            src.batch_status === 'released'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            src.batch_status === 'rejected'   ? 'bg-red-50 text-red-700 border-red-200' :
                            src.batch_status === 'fermenting' ? 'bg-slate-50 text-slate-700 border-slate-200' :
                            'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>{src.batch_status}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {ongoingCount > 0 && <span className="text-xs font-bold text-slate-600">{ongoingCount} ongoing</span>}
                        {contaminatedCount > 0 && <span className="text-xs font-bold text-red-600">{contaminatedCount} contam</span>}
                      </div>
                    </div>
                    
                    <div className="bg-slate-100/50 rounded-b-xl border border-t-0 border-slate-200 p-2 flex-1 overflow-y-auto space-y-3">
                      {[...src.timepoints.values()].map(tp => {
                        const replicateGroups = (() => {
                          const groups = new Map();
                          const singles = [];
                          for (const r of tp.records) {
                            if (!r.replicate_label || r.replicate_label === 'None') {
                              singles.push(r);
                              continue;
                            }
                            const gKey = `${r.batch_id || ''}|${r.log_hour}|${r.sample_name}|${r.dilution_factor || ''}`;
                            if (!groups.has(gKey)) groups.set(gKey, []);
                            groups.get(gKey).push(r);
                          }
                          const result = [];
                          for (const grp of groups.values()) {
                            if (grp.length > 1) result.push({ type: 'group', records: grp });
                            else singles.push(...grp);
                          }
                          for (const r of singles) result.push({ type: 'single', records: [r] });
                          result.sort((a, b) => {
                            if (a.type === 'group' && b.type !== 'group') return -1;
                            if (b.type === 'group' && a.type !== 'group') return 1;
                            return (a.records[0].plate_index ?? 0) - (b.records[0].plate_index ?? 0);
                          });
                          return result;
                        })();

                        return (
                          <div key={tp.key} className="space-y-2">
                            <div className="flex items-center gap-2 sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10 py-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              <span className="text-xs font-black text-slate-600">{tp.label}</span>
                            </div>
                            <div className="space-y-2 pl-2 border-l border-slate-200 ml-0.5">
                              {replicateGroups.map((item, idx) => {
                                if (item.type === 'group') {
                                  return <ReplicateGroupTile key={`grp-${idx}`} records={item.records} onEdit={openEdit} canDelete={canDelete} deletingId={deletingId} setConfirmDeleteId={setConfirmDeleteId} />;
                                }
                                return <SinglePlateTile key={item.records[0].id} record={item.records[0]} onEdit={openEdit} canDelete={canDelete} deletingId={deletingId} setConfirmDeleteId={setConfirmDeleteId} />;
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="card overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Source</th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Sample</th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Timepoint</th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Sterility</th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 text-right">Count</th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {samples.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2 text-sm font-semibold text-slate-700">
                        {r.source_label || r.batches?.batch_id || 'Other'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm font-semibold text-slate-900">{r.sample_name || 'Plate'}</div>
                        <div className="flex gap-1 mt-0.5">
                           {r.replicate_label && r.replicate_label !== 'None' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded border border-slate-200">Rep {r.replicate_label}</span>}
                           {r.dilution_factor != null && <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded border border-slate-200">Dil {r.dilution_factor}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm font-mono text-slate-500">
                        {r.timepoint_label || (r.log_hour != null ? `T+${r.log_hour}h` : '-')}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-black uppercase px-2 py-0.5 rounded border ${sterileChip(r.sterility_status || 'Pending')}`}>
                          {r.sterility_status || 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm font-mono text-slate-600 text-right">
                        {r.colony_count != null ? r.colony_count : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => openEdit(r)} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded">Edit</button>
                          {r.linked_lnb_id && (
                            <Link href={`/lab-notebook/${r.linked_lnb_id}`} className="px-2 py-1 bg-slate-100 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded">
                              LNB
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showModal && (
        <IncubationFormModal
          onClose={() => setShowModal(false)}
          initialData={editData}
          onSuccess={() => { setShowModal(false); fetchSamples(); toast.success('Record saved!'); }}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => handleDelete(confirmDeleteId)}
        title="Delete Incubation Record"
        message="Are you sure you want to delete this incubation record? This cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
