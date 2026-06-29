'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Archive, Activity, FlaskConical, Loader2, Trash2, RotateCcw,
  Search, Calendar, Package, Wrench, CheckSquare, BookOpen,
  Users, X, AlertTriangle, ChevronDown, Thermometer, ShieldAlert,
  ClipboardList, Microscope, TestTube2, Beaker,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import MobilePageHeader from '@/components/ui/MobilePageHeader';

// ── Retention helpers ────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function RetentionBadge({ archivedAt }) {
  const days = daysSince(archivedAt);
  if (days === null) return null;
  const color = days > 90 ? 'bg-red-50 text-red-700 border-red-200' :
                days > 30 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${color}`}>
      {days}d ago{days > 90 ? ' · review' : ''}
    </span>
  );
}

function formatArchiveDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function getArchivedAt(row, tabId) {
  return tabId === 'employees' ? row.created_at : row.archived_at;
}

function getArchiveCard(row, tabId) {
  const fallback = { title: row.name || row.title || row.batch_id || row.full_name || 'Archived record', meta: [], status: row.status };
  const map = {
    employees: {
      title: row.full_name,
      eyebrow: row.employee_code || row.role,
      meta: [row.email, row.department, row.joined_date && `Joined ${row.joined_date}`],
      href: '/directory',
    },
    batches: {
      title: row.batch_id,
      eyebrow: row.formulations?.name,
      meta: [row.status, row.planned_volume_ml && `${row.planned_volume_ml} ml`],
      href: `/batches/${row.id}`,
    },
    formulations: {
      title: row.name,
      eyebrow: row.code && `${row.code} v${row.version}`,
      meta: [row.category, row.status],
    },
    equipment: {
      title: row.name,
      eyebrow: row.model,
      meta: [row.serial_number, row.status],
    },
    tasks: {
      title: row.title,
      eyebrow: row.priority,
      meta: [row.assigned_user?.full_name && `To ${row.assigned_user.full_name}`, row.creator?.full_name && `By ${row.creator.full_name}`],
    },
    lnb: {
      title: row.title,
      eyebrow: row.batches?.batch_id,
      meta: [row.author?.full_name, row.status],
    },
    inventory: {
      title: row.name,
      eyebrow: row.category,
      meta: [row.unit],
    },
    activity: {
      title: row.employees?.full_name || 'Activity log',
      eyebrow: `${row.start_time || '-'} - ${row.end_time || '-'}`,
      meta: [row.activity_description],
      issue: row.issue_observed,
    },
    shelf_life: {
      title: row.batches?.batch_id || 'Shelf Life Study',
      eyebrow: row.study_type,
      meta: [row.storage_condition, row.status, row.creator?.full_name && `by ${row.creator.full_name}`],
    },
    deviations: {
      title: row.title,
      eyebrow: row.source,
      meta: [row.severity, row.status, row.batches?.batch_id],
    },
    capa: {
      title: row.title,
      eyebrow: row.action_type,
      meta: [row.status, row.assignee?.full_name && `Assigned: ${row.assignee.full_name}`],
    },
    growth_studies: {
      title: row.title || 'Growth Study',
      eyebrow: row.status,
      meta: [row.creator?.full_name && `by ${row.creator.full_name}`],
    },
    research: {
      title: row.session_title,
      eyebrow: row.batches?.batch_id,
      meta: [row.panelist_count && `${row.panelist_count} panelists`, row.status, row.creator?.full_name && `by ${row.creator.full_name}`],
    },
    samples: {
      title: row.sample_label || 'Sample',
      eyebrow: row.source_type,
      meta: [row.source_label, row.batches?.batch_id],
    },
  };
  return { ...fallback, ...(map[tabId] || {}) };
}

function ArchiveMobileCard({ row, tabId, canRestore, onRestore, onDelete }) {
  const card = getArchiveCard(row, tabId);
  const archivedAt = getArchivedAt(row, tabId);
  return (
    <div className="mobile-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {card.eyebrow && <p className="text-[10px] font-black uppercase tracking-wider text-navy truncate">{card.eyebrow}</p>}
          <h3 className="text-sm font-black text-slate-900 mt-1 line-clamp-2">{card.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.issue && <span className="text-[9px] font-black text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">ISSUE</span>}
            <RetentionBadge archivedAt={archivedAt} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Archived</p>
          <p className="text-[11px] font-bold text-slate-600 mt-1">{formatArchiveDate(archivedAt)}</p>
        </div>
      </div>
      <div className="space-y-1">
        {card.meta.filter(Boolean).slice(0, 3).map((item, idx) => (
          <p key={idx} className="text-xs font-semibold text-slate-500 line-clamp-2">{item}</p>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        {card.href && <Link href={card.href} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black">View</Link>}
        {tabId === 'employees' ? (
          <Link href="/directory" className="px-3 py-2 rounded-xl bg-navy text-white text-xs font-black">Manage</Link>
        ) : (
          <>
            {canRestore && (
              <button onClick={() => onRestore(row)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Restore
              </button>
            )}
            <button onClick={() => onDelete(row)} className="px-3 py-2 rounded-xl bg-red-50 text-red-700 border border-red-100 text-xs font-black inline-flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab config ───────────────────────────────────────────────────
const TABS = [
  { id: 'batches',       label: 'Batches',       icon: FlaskConical,  table: 'batches' },
  { id: 'activity',      label: 'Activity',       icon: Activity,      table: 'activity_log' },
  { id: 'formulations',  label: 'Formulations',   icon: Beaker,        table: 'formulations' },
  { id: 'equipment',     label: 'Equipment',      icon: Wrench,        table: 'equipment' },
  { id: 'tasks',         label: 'Tasks',          icon: CheckSquare,   table: 'tasks' },
  { id: 'lnb',           label: 'Lab Notebook',   icon: BookOpen,      table: 'lab_notebook_entries' },
  { id: 'inventory',     label: 'Inventory',      icon: Package,       table: 'inventory_items' },
  { id: 'shelf_life',    label: 'Shelf Life',     icon: Thermometer,   table: 'shelf_life_studies' },
  { id: 'deviations',    label: 'Deviations',     icon: ShieldAlert,   table: 'deviations' },
  { id: 'capa',          label: 'CAPA',           icon: ClipboardList, table: 'capa_actions' },
  { id: 'growth_studies',label: 'Growth Studies', icon: Microscope,    table: 'growth_studies' },
  { id: 'research',      label: 'Research',       icon: TestTube2,     table: 'taste_panels' },
  { id: 'samples',       label: 'Samples',        icon: Package,       table: 'samples' },
  { id: 'employees',     label: 'Employees',      icon: Users,         table: null },
];

export default function ArchivePage() {
  const { role, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const [tab, setTab]           = useState('batches');
  const [counts, setCounts]     = useState({});
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'delete'|'restore', item, tabId }

  // ── Fetch counts for tab badges ──────────────────────────────
  const fetchCounts = useCallback(async () => {
    const res = await fetch('/api/archive');
    if (!res.ok) return;
    const json = await res.json();
    if (json.counts) setCounts(json.counts);
  }, []);

  // ── Fetch data for active tab ────────────────────────────────
  const fetchTab = useCallback(async (tabId) => {
    setLoading(true);
    setData([]);
    try {
      const res = await fetch(`/api/archive?tab=${tabId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json.data || []);
    } catch (err) {
      toast.error('Failed to load: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading && isAdmin) { fetchCounts(); }
  }, [authLoading, isAdmin, fetchCounts]);

  useEffect(() => {
    if (isAdmin) { setSearch(''); setDateFrom(''); setDateTo(''); fetchTab(tab); }
  }, [tab, isAdmin, fetchTab]);

  // ── Search + date filter ─────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = data;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => {
        const searchable = [
          r.batch_id, r.name, r.title, r.full_name, r.code, r.model,
          r.employee_code, r.email, r.activity_description,
          r.formulations?.name, r.batches?.batch_id,
          r.author?.full_name, r.assigned_user?.full_name,
          r.session_title, r.storage_condition, r.study_type, r.source,
          r.severity, r.action_type, r.sample_label, r.source_type, r.source_label,
          r.creator?.full_name, r.reporter?.full_name, r.assignee?.full_name,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(q);
      });
    }
    const archiveField = tab === 'employees' ? 'created_at' : 'archived_at';
    if (dateFrom) rows = rows.filter(r => r[archiveField] && r[archiveField] >= dateFrom);
    if (dateTo)   rows = rows.filter(r => r[archiveField] && r[archiveField] <= dateTo + 'T23:59:59');
    return rows;
  }, [data, search, dateFrom, dateTo, tab]);

  // ── Restore ──────────────────────────────────────────────────
  const handleRestore = async (item, tabId) => {
    const tableMap = Object.fromEntries(TABS.filter(t => t.table).map(t => [t.id, t.table]));
    const table = tableMap[tabId];
    if (!table) return;
    try {
      const res = await fetch('/api/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id: item.id, action: 'restore' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Restored successfully.');
      setData(prev => prev.filter(r => r.id !== item.id));
      setCounts(prev => ({ ...prev, [tabId]: Math.max((prev[tabId] || 1) - 1, 0) }));
    } catch (err) { toast.error(err.message); }
  };

  // ── Permanent delete ─────────────────────────────────────────
  const handlePermanentDelete = async (item, tabId) => {
    const tableMap = Object.fromEntries(TABS.filter(t => t.table).map(t => [t.id, t.table]));
    const table = tableMap[tabId];
    if (!table) return;
    try {
      const res = await fetch(`/api/archive?table=${table}&id=${item.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Permanently deleted.');
      setData(prev => prev.filter(r => r.id !== item.id));
      setCounts(prev => ({ ...prev, [tabId]: Math.max((prev[tabId] || 1) - 1, 0) }));
    } catch (err) { toast.error(err.message); }
  };

  if (authLoading) return <div className="page-container flex items-center justify-center min-h-[50vh] text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2"/>Loading...</div>;
  if (!isAdmin) return (
    <div className="page-container">
      <div className="surface p-8 text-center">
        <Archive className="w-10 h-10 mx-auto text-slate-300 mb-3"/>
        <p className="text-sm text-slate-500">Only admins, CEO, and CTO can access archived records.</p>
      </div>
    </div>
  );

  const currentTab = TABS.find(t => t.id === tab);
  const canRestore = tab !== 'employees'; // employees are reactivated through directory, not archive restore

  return (
    <div className="page-container space-y-6">
      <MobilePageHeader
        icon={Archive}
        title="Archive"
        subtitle="Restore records back to their module or permanently delete them after review."
        stats={[
          { label: 'Records', value: Object.values(counts).reduce((sum, value) => sum + (value || 0), 0) },
          { label: currentTab?.label || 'Current', value: filtered.length },
          { label: 'Modules', value: TABS.length },
        ]}
      />

      {/* Header */}
      <div className="hidden md:block">
        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Archive className="w-7 h-7 text-slate-500"/> Archive
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Archived records sit here before permanent deletion. Restore to bring them back, or permanently delete to free space.
        </p>
      </div>

      {/* Tab bar */}
      <div className="mobile-scroll-tabs">
        {TABS.map(t => {
          const count = counts[t.id] ?? 0;
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 whitespace-nowrap ${active ? 'bg-navy text-white border-navy' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
            >
              <Icon className="w-3.5 h-3.5"/>
              {t.label}
              {count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black min-w-[18px] text-center ${active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="surface p-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, author…"
            className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0"/>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-navy"/>
          <span className="text-slate-400 text-xs">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-navy"/>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">Clear</button>
          )}
        </div>
        <p className="text-[10px] font-bold text-slate-400 shrink-0">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="surface p-12 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin"/> Loading {currentTab?.label}…
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface p-12 text-center">
          <Archive className="w-10 h-10 mx-auto text-slate-200 mb-3"/>
          <p className="text-sm text-slate-400">{data.length === 0 ? `No archived ${currentTab?.label?.toLowerCase()}.` : 'No results match your search.'}</p>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="md:hidden p-3 space-y-3">
            {filtered.map(row => (
              <ArchiveMobileCard
                key={row.id}
                row={row}
                tabId={tab}
                canRestore={canRestore}
                onRestore={(item) => setConfirmAction({ type: 'restore', item, tabId: tab })}
                onDelete={(item) => setConfirmAction({ type: 'delete', item, tabId: tab })}
              />
            ))}
          </div>
          {/* ── Employees tab (is_active=false) — special layout ── */}
          {tab === 'employees' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50">
                <tr>
                  {['Employee', 'Role', 'ID', 'Email', 'Dept', 'Joined', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900">{emp.full_name}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 capitalize">{emp.role?.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 text-xs font-mono font-bold text-slate-700">{emp.employee_code || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{emp.email}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{emp.department || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{emp.joined_date || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href="/directory" className="text-xs font-bold text-navy hover:underline">Manage in Directory →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Batches ── */}
          {tab === 'batches' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Batch', 'Recipe', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-xs font-mono font-black text-slate-900">{b.batch_id}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-700">{b.formulations?.name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{b.status || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(b.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={b.archived_at}/></td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <Link href={`/batches/${b.id}`} className="text-xs font-bold text-navy hover:underline">View</Link>
                      <button onClick={() => setConfirmAction({ type: 'restore', item: b, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setConfirmAction({ type: 'delete', item: b, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Formulations ── */}
          {tab === 'formulations' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Name', 'Code', 'Category', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900">{f.name}</td>
                    <td className="px-5 py-3 text-xs font-mono font-bold text-navy">{f.code} v{f.version}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{f.category || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{f.status}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(f.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={f.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: f, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: f, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Equipment ── */}
          {tab === 'equipment' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Name', 'Model', 'Serial', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900">{e.name}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{e.model || '—'}</td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-500">{e.serial_number || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{e.status}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(e.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={e.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: e, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: e, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Tasks ── */}
          {tab === 'tasks' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Title', 'Priority', 'Assigned To', 'Created By', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 max-w-[240px] truncate">{t.title}</td>
                    <td className="px-5 py-3"><span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${t.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' : t.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{t.priority}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-600">{t.assigned_user?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{t.creator?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(t.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={t.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: t, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: t, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Lab Notebook ── */}
          {tab === 'lnb' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Title', 'Batch', 'Author', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 max-w-[240px] truncate">{e.title}</td>
                    <td className="px-5 py-3 text-xs font-mono text-navy">{e.batches?.batch_id || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{e.author?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{e.status}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(e.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={e.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: e, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: e, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Inventory ── */}
          {tab === 'inventory' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Name', 'Category', 'Unit', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(i => (
                  <tr key={i.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900">{i.name}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{i.category || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{i.unit || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(i.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={i.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: i, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: i, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Shelf Life ── */}
          {tab === 'shelf_life' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Batch', 'Type', 'Condition', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-xs font-mono font-black text-navy">{s.batches?.batch_id || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{s.study_type || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{s.storage_condition || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{s.status}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(s.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={s.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: s, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: s, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Deviations ── */}
          {tab === 'deviations' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Title', 'Source', 'Severity', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 max-w-[240px] truncate">{d.title}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{d.source || '—'}</td>
                    <td className="px-5 py-3"><span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${d.severity === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' : d.severity === 'Major' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{d.severity}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-500">{d.status}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(d.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={d.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: d, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: d, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── CAPA ── */}
          {tab === 'capa' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Title', 'Type', 'Status', 'Assigned To', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 max-w-[220px] truncate">{c.title}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{c.action_type || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{c.status || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{c.assignee?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(c.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={c.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: c, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: c, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Growth Studies ── */}
          {tab === 'growth_studies' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Title', 'Status', 'Created By', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(g => (
                  <tr key={g.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 max-w-[240px] truncate">{g.title || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{g.status || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{g.creator?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(g.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={g.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: g, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: g, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Research (Taste Panels) ── */}
          {tab === 'research' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Session', 'Batch', 'Panelists', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 max-w-[220px] truncate">{r.session_title}</td>
                    <td className="px-5 py-3 text-xs font-mono text-navy">{r.batches?.batch_id || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{r.panelist_count ?? '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{r.status || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(r.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={r.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: r, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: r, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Samples ── */}
          {tab === 'samples' && (
            <table className="hidden md:table min-w-full divide-y divide-gray-100">
              <thead className="bg-slate-50"><tr>
                {['Label', 'Type', 'Source', 'Batch', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-xs font-mono font-black text-slate-900">{s.sample_label || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{s.source_type || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{s.source_label || '—'}</td>
                    <td className="px-5 py-3 text-xs font-mono text-navy">{s.batches?.batch_id || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 flex items-center gap-1.5">{new Date(s.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={s.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: s, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: s, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Activity ── */}
          {tab === 'activity' && (
            <div className="hidden md:block divide-y divide-gray-100">
              {filtered.map(a => (
                <div key={a.id} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-slate-50/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-black text-slate-900">{a.employees?.full_name || 'Unknown'}</span>
                      <span className="text-xs text-slate-400">{a.start_time} – {a.end_time}</span>
                      {a.issue_observed && <span className="text-[9px] font-black text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">ISSUE</span>}
                      <RetentionBadge archivedAt={a.archived_at}/>
                    </div>
                    <p className="text-xs text-slate-700 line-clamp-2">{a.activity_description}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Archived {new Date(a.archived_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setConfirmAction({ type: 'restore', item: a, tabId: tab })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold hover:bg-emerald-100"><RotateCcw className="w-3 h-3"/>Restore</button>
                    <button onClick={() => setConfirmAction({ type: 'delete', item: a, tabId: tab })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-100 text-xs font-bold hover:bg-red-100"><Trash2 className="w-3.5 h-3.5"/>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'restore' ? 'Restore Record' : 'Permanently Delete'}
        message={confirmAction?.type === 'restore'
          ? 'This will restore the record back to its original module and make it active again.'
          : 'This will permanently delete the record. This action cannot be undone.'
        }
        confirmText={confirmAction?.type === 'restore' ? 'Restore' : 'Delete permanently'}
        variant={confirmAction?.type === 'restore' ? 'default' : 'danger'}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'restore') handleRestore(confirmAction.item, confirmAction.tabId);
          else handlePermanentDelete(confirmAction.item, confirmAction.tabId);
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
