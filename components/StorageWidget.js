'use client';
import { useState, useEffect } from 'react';
import { Database, HardDrive, Archive, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Trash2, Server } from 'lucide-react';

const FRIENDLY_NAMES = {
  employees: 'Employees',
  attendance_log: 'Attendance Logs',
  activity_log: 'Activity Logs',
  tasks: 'Tasks',
  batches: 'Production Batches',
  cell_bank_vials: 'Cell Bank Vials',
  cell_bank_vial_logs: 'Vial Logs',
  inventory_usage: 'Inventory Usage',
  leave_applications: 'Leave Applications',
  lab_notebook_entries: 'Lab Notebook',
  ph_readings: 'pH Readings',
  deviations: 'Deviations / CAPA',
  sop_acknowledgements: 'SOP Acknowledgements',
};

function GaugeBar({ percent, color }) {
  const pct = Math.min(percent || 0, 100);
  const barColor = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function StorageWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(null);
  const [archiveDays, setArchiveDays] = useState(180);
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/storage-stats');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setLastRefreshed(new Date());
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);

  const handleArchive = async (type) => {
    setArchiving(type);
    try {
      const res = await fetch('/api/admin/archive-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, older_than_days: archiveDays })
      });
      const json = await res.json();
      if (json.success) {
        alert(`✅ Archived ${json.result.archived} records from ${json.result.table}.`);
        fetchStats();
      } else {
        alert('❌ Archive failed: ' + json.error);
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setArchiving(null); }
  };

  if (loading) return (
    <div className="surface p-6 animate-pulse space-y-4">
      <div className="h-5 w-40 bg-gray-200 rounded" />
      <div className="h-3 w-full bg-gray-100 rounded-full" />
      <div className="h-3 w-full bg-gray-100 rounded-full" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  );

  const db = data?.database;
  const stor = data?.storage;
  const tables = data?.tableCounts || [];

  const dbStatus = db?.percentUsed > 85 ? 'danger' : db?.percentUsed > 60 ? 'warn' : 'ok';
  const storStatus = stor?.percentUsed > 85 ? 'danger' : stor?.percentUsed > 60 ? 'warn' : 'ok';

  return (
    <div className="surface p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-navy" />
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">System Storage Health</h3>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Supabase Free</span>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[9px] text-gray-400 font-medium">
              {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={fetchStats} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button
            onClick={() => setShowArchivePanel(!showArchivePanel)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-colors"
          >
            <Archive className="w-3 h-3" /> Manage
          </button>
        </div>
      </div>

      {/* DB + Storage Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Database */}
        <div className={`p-4 rounded-xl border ${dbStatus === 'danger' ? 'bg-red-50 border-red-200' : dbStatus === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-100'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className={`w-4 h-4 ${dbStatus === 'danger' ? 'text-red-500' : dbStatus === 'warn' ? 'text-amber-500' : 'text-emerald-600'}`} />
              <span className="text-xs font-bold text-gray-700">Database</span>
            </div>
            {dbStatus === 'danger' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
            {dbStatus === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          </div>
          <div className="flex items-end justify-between mb-2">
            <span className="text-xl font-black text-gray-900">
              {db?.usedMB != null ? `${db.usedMB} MB` : '—'}
            </span>
            <span className="text-[10px] font-bold text-gray-400">/ {db?.limitMB} MB limit</span>
          </div>
          <GaugeBar percent={db?.percentUsed} />
          <p className="text-[9px] text-gray-500 mt-1.5 font-semibold">
            {db?.percentUsed != null ? `${db.percentUsed}% used` : 'Run SQL function to enable'} · {db?.limitMB - (db?.usedMB || 0)} MB free
          </p>
        </div>

        {/* File Storage */}
        <div className={`p-4 rounded-xl border ${storStatus === 'danger' ? 'bg-red-50 border-red-200' : storStatus === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className={`w-4 h-4 ${storStatus === 'danger' ? 'text-red-500' : storStatus === 'warn' ? 'text-amber-500' : 'text-slate-500'}`} />
              <span className="text-xs font-bold text-gray-700">File Storage</span>
            </div>
            {storStatus === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          </div>
          <div className="flex items-end justify-between mb-2">
            <span className="text-xl font-black text-gray-900">{stor?.usedMB} MB</span>
            <span className="text-[10px] font-bold text-gray-400">/ {stor?.limitMB} MB limit</span>
          </div>
          <GaugeBar percent={stor?.percentUsed} />
          <p className="text-[9px] text-gray-500 mt-1.5 font-semibold">
            {stor?.percentUsed}% used · {stor?.buckets?.length || 0} bucket{stor?.buckets?.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Bucket Breakdown */}
      {stor?.buckets?.length > 0 && (
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Storage Buckets</p>
          <div className="space-y-1.5">
            {stor.buckets.map(b => (
              <div key={b.name} className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-semibold text-gray-700">{b.name}</span>
                <span className="text-gray-400 font-bold">{b.fileCount} files · {(b.totalBytes / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table Row Counts */}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Record Counts by Module</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tables
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .map(t => (
              <div key={t.table} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                <span className="font-semibold text-gray-600 truncate mr-2">{FRIENDLY_NAMES[t.table] || t.table}</span>
                <span className="font-black text-gray-900 shrink-0">{t.count?.toLocaleString() ?? '—'}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Archive Panel */}
      {showArchivePanel && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-4">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-indigo-900">Data Archival & Cleanup</h4>
          </div>
          <p className="text-xs text-indigo-700">
            Archive old records to free up database space. Archived attendance & activity entries are soft-deleted (data preserved, just hidden from active queries). Vial logs are permanently deleted.
          </p>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-indigo-700">Archive records older than:</label>
            <select
              value={archiveDays}
              onChange={e => setArchiveDays(Number(e.target.value))}
              className="px-3 py-1.5 border border-indigo-200 rounded-lg text-xs font-bold bg-white text-indigo-800 focus:ring-2 focus:ring-indigo-300 outline-none"
            >
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { type: 'attendance', label: 'Attendance Logs', icon: '📋', color: 'bg-blue-600 hover:bg-blue-700' },
              { type: 'activity_log', label: 'Activity Logs', icon: '📝', color: 'bg-slate-600 hover:bg-slate-700' },
              { type: 'vial_logs', label: 'Vial Logs (Permanent)', icon: '🧪', color: 'bg-red-600 hover:bg-red-700' },
            ].map(({ type, label, icon, color }) => (
              <button
                key={type}
                onClick={() => handleArchive(type)}
                disabled={archiving !== null}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 ${color} text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors`}
              >
                {archiving === type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>{icon}</span>}
                {archiving === type ? 'Archiving...' : label}
              </button>
            ))}
          </div>

          <p className="text-[9px] text-indigo-600 font-semibold">
            💡 Tip: Schedule monthly archival of attendance logs (6+ months old) to keep your database well under the 500 MB limit.
          </p>
        </div>
      )}

      {/* Upgrade nudge if getting close */}
      {(db?.percentUsed > 70 || stor?.percentUsed > 70) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800">Approaching storage limit</p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              Consider archiving old records using the Manage panel above, or upgrade to <strong>Supabase Pro (~$25/month)</strong> for 8 GB database + 100 GB file storage.
            </p>
            <a
              href="https://supabase.com/dashboard/project/ttikqclvbewkollnjvza/settings/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[10px] font-black text-amber-800 underline hover:text-amber-900"
            >
              Open Supabase Billing →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
