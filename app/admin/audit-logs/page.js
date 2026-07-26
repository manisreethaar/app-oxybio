'use client';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Shield, Search, ChevronDown, ChevronRight, Filter, AlertCircle, FileText, ArrowUpDown } from 'lucide-react';
import AuditDiffViewer from './AuditDiffViewer';

const supabase = createClient();

const RESULTS_PER_PAGE = 50;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [tableFilter, actionFilter]); // Fetch on filter change

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('system_audit_logs')
        .select(`
          *,
          employees:changed_by ( full_name )
        `)
        .order('changed_at', { ascending: false })
        .limit(RESULTS_PER_PAGE);

      if (tableFilter) query = query.eq('table_name', tableFilter);
      if (actionFilter) query = query.eq('action', actionFilter);
      // Wait to do search on client side for MVP, or we can use ilike on reason/table if we wanted.

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const s = search.toLowerCase();
    return logs.filter(log => 
      log.reason?.toLowerCase().includes(s) ||
      log.table_name?.toLowerCase().includes(s) ||
      log.record_id?.toLowerCase().includes(s) ||
      log.employees?.full_name?.toLowerCase().includes(s)
    );
  }, [logs, search]);

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const formatAction = (action) => {
    const colors = {
      INSERT: 'text-green-600 bg-green-50 border-green-200',
      UPDATE: 'text-blue-600 bg-blue-50 border-blue-200',
      DELETE: 'text-red-600 bg-red-50 border-red-200',
    };
    const c = colors[action] || 'text-slate-600 bg-slate-50 border-slate-200';
    return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${c}`}>
        {action}
      </span>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
            <Shield className="w-6 h-6 text-indigo-500" />
            Audit Logs
          </h1>
          <p className="text-sm text-slate-500 mt-1">ALCOA++ compliant audit trails for system data changes.</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by reason, table, record ID, or user..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <select 
          value={tableFilter} 
          onChange={e => setTableFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none font-medium text-slate-700"
        >
          <option value="">All Tables</option>
          <option value="inventory_movements">inventory_movements</option>
          <option value="inventory_items">inventory_items</option>
          <option value="batches">batches</option>
          <option value="batch_flasks">batch_flasks</option>
          <option value="capa_actions">capa_actions</option>
        </select>
        <select 
          value={actionFilter} 
          onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none font-medium text-slate-700"
        >
          <option value="">All Actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Record ID</th>
                <th className="px-4 py-3 min-w-[200px]">Reason for Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm font-medium">Loading audit logs...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-red-500 bg-red-50">
                    <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                    <p className="text-sm font-semibold">{error}</p>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-semibold">No audit logs found.</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr 
                        onClick={() => toggleExpand(log.id)}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}
                      >
                        <td className="px-4 py-3 text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap font-medium">
                          {new Date(log.changed_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800 font-semibold">
                          {log.employees?.full_name || 'System / Unknown'}
                        </td>
                        <td className="px-4 py-3">
                          {formatAction(log.action)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                          {log.table_name}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 font-mono truncate max-w-[120px]">
                          {log.record_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 italic truncate max-w-[300px]">
                          {log.reason || '—'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan="7" className="px-4 py-3 border-t border-slate-100">
                            <div className="pl-8 py-2">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                                <ArrowUpDown className="w-3 h-3" /> Data Changes
                              </h4>
                              <AuditDiffViewer oldData={log.old_data} newData={log.new_data} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-auto px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 text-center">
          Showing up to {RESULTS_PER_PAGE} most recent matching logs.
        </div>
      </div>
    </div>
  );
}
