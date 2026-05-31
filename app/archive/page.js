'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Archive, Activity, FlaskConical, Loader2, Trash2, RotateCcw,
  Search, Calendar, Package, Wrench, CheckSquare, BookOpen,
  Users, X, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import ConfirmModal from '@/components/ui/ConfirmModal';

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
                            'bg-gray-50 text-gray-500 border-gray-200';
  return (
    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${color}`}>
      {days}d ago{days > 90 ? ' · review' : ''}
    </span>
  );
}

// ── Tab config ───────────────────────────────────────────────────
const TABS = [
  { id: 'batches',      label: 'Batches',       icon: FlaskConical, table: 'batches' },
  { id: 'activity',     label: 'Activity',       icon: Activity,     table: 'activity_log' },
  { id: 'formulations', label: 'Formulations',   icon: ChevronDown,  table: 'formulations' },
  { id: 'equipment',    label: 'Equipment',      icon: Wrench,       table: 'equipment' },
  { id: 'tasks',        label: 'Tasks',          icon: CheckSquare,  table: 'tasks' },
  { id: 'lnb',          label: 'Lab Notebook',   icon: BookOpen,     table: 'lab_notebook_entries' },
  { id: 'inventory',    label: 'Inventory',      icon: Package,      table: 'inventory_items' },
  { id: 'employees',    label: 'Employees',      icon: Users,        table: null }, // is_active=false, not archived_at
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

  if (authLoading) return <div className="page-container flex items-center justify-center min-h-[50vh] text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2"/>Loading...</div>;
  if (!isAdmin) return (
    <div className="page-container">
      <div className="surface p-8 text-center">
        <Archive className="w-10 h-10 mx-auto text-gray-300 mb-3"/>
        <p className="text-sm text-gray-500">Only admins, CEO, and CTO can access archived records.</p>
      </div>
    </div>
  );

  const currentTab = TABS.find(t => t.id === tab);
  const canRestore = tab !== 'employees'; // employees are reactivated through directory, not archive restore

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Archive className="w-7 h-7 text-slate-500"/> Archive
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Archived records sit here before permanent deletion. Restore to bring them back, or permanently delete to free space.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => {
          const count = counts[t.id] ?? 0;
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 ${active ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            >
              <Icon className="w-3.5 h-3.5"/>
              {t.label}
              {count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black min-w-[18px] text-center ${active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="surface p-3 flex flex-col sm:flex-row gap-3 items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, author…"
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-navy"/>
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>}
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0"/>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-navy"/>
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-navy"/>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs font-bold text-gray-500 hover:text-gray-700">Clear</button>
          )}
        </div>
        <p className="text-[10px] font-bold text-gray-400 shrink-0">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="surface p-12 text-center text-gray-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin"/> Loading {currentTab?.label}…
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface p-12 text-center">
          <Archive className="w-10 h-10 mx-auto text-gray-200 mb-3"/>
          <p className="text-sm text-gray-400">{data.length === 0 ? `No archived ${currentTab?.label?.toLowerCase()}.` : 'No results match your search.'}</p>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          {/* ── Employees tab (is_active=false) — special layout ── */}
          {tab === 'employees' && (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Employee', 'Role', 'ID', 'Email', 'Dept', 'Joined', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-900">{emp.full_name}</td>
                    <td className="px-5 py-3 text-xs text-gray-600 capitalize">{emp.role?.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 text-xs font-mono font-bold text-gray-700">{emp.employee_code || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{emp.email}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{emp.department || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{emp.joined_date || '—'}</td>
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
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50"><tr>
                {['Batch', 'Recipe', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-xs font-mono font-black text-gray-900">{b.batch_id}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-700">{b.formulations?.name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{b.status || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-400 flex items-center gap-1.5">{new Date(b.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={b.archived_at}/></td>
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
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50"><tr>
                {['Name', 'Code', 'Category', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-900">{f.name}</td>
                    <td className="px-5 py-3 text-xs font-mono font-bold text-navy">{f.code} v{f.version}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{f.category || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{f.status}</td>
                    <td className="px-5 py-3 text-xs text-gray-400 flex items-center gap-1.5">{new Date(f.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={f.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: f, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: f, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Equipment ── */}
          {tab === 'equipment' && (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50"><tr>
                {['Name', 'Model', 'Serial', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-900">{e.name}</td>
                    <td className="px-5 py-3 text-xs text-gray-600">{e.model || '—'}</td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-500">{e.serial_number || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{e.status}</td>
                    <td className="px-5 py-3 text-xs text-gray-400 flex items-center gap-1.5">{new Date(e.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={e.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: e, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: e, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Tasks ── */}
          {tab === 'tasks' && (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50"><tr>
                {['Title', 'Priority', 'Assigned To', 'Created By', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-900 max-w-[240px] truncate">{t.title}</td>
                    <td className="px-5 py-3"><span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${t.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' : t.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{t.priority}</span></td>
                    <td className="px-5 py-3 text-xs text-gray-600">{t.assigned_user?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{t.creator?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-400 flex items-center gap-1.5">{new Date(t.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={t.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: t, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: t, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Lab Notebook ── */}
          {tab === 'lnb' && (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50"><tr>
                {['Title', 'Batch', 'Author', 'Status', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-900 max-w-[240px] truncate">{e.title}</td>
                    <td className="px-5 py-3 text-xs font-mono text-navy">{e.batches?.batch_id || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-600">{e.author?.full_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{e.status}</td>
                    <td className="px-5 py-3 text-xs text-gray-400 flex items-center gap-1.5">{new Date(e.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={e.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: e, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: e, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Inventory ── */}
          {tab === 'inventory' && (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50"><tr>
                {['Name', 'Category', 'Unit', 'Archived', '', ''].map(h => <th key={h} className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(i => (
                  <tr key={i.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-bold text-gray-900">{i.name}</td>
                    <td className="px-5 py-3 text-xs text-gray-600">{i.category || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{i.unit || '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-400 flex items-center gap-1.5">{new Date(i.archived_at).toLocaleDateString()} <RetentionBadge archivedAt={i.archived_at}/></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'restore', item: i, tabId: tab })} className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3"/>Restore</button></td>
                    <td className="px-5 py-3 text-right"><button onClick={() => setConfirmAction({ type: 'delete', item: i, tabId: tab })} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5"/>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Activity ── */}
          {tab === 'activity' && (
            <div className="divide-y divide-gray-100">
              {filtered.map(a => (
                <div key={a.id} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-gray-50/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-black text-gray-900">{a.employees?.full_name || 'Unknown'}</span>
                      <span className="text-xs text-gray-400">{a.start_time} – {a.end_time}</span>
                      {a.issue_observed && <span className="text-[9px] font-black text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">ISSUE</span>}
                      <RetentionBadge archivedAt={a.archived_at}/>
                    </div>
                    <p className="text-xs text-gray-700 line-clamp-2">{a.activity_description}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Archived {new Date(a.archived_at).toLocaleString()}</p>
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
