'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { Shield, Search, Filter, Download, ArrowLeft, Eye } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Link from 'next/link';

export default function AuditLogsPage() {
  const { role } = useAuth();
  const supabase = createClient();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [tableFilter, setTableFilter] = useState('ALL');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Fetch logs joined with employee data
      const { data } = await withTimeout(supabase
        .from('system_audit_logs')
        .select('*, employees(id, first_name, last_name, email, role)')
        .order('changed_at', { ascending: false })
        .limit(500), // cap at 500 for UI performance
        45000, 'Audit log load timed out');

      if (data) setLogs(data);
    } catch (err) {
      console.error('Audit log fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
    if (tableFilter !== 'ALL' && log.table_name !== tableFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const emp = log.employees;
      const empName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : '';
      if (!log.table_name.toLowerCase().includes(q) && 
          !log.record_id.toLowerCase().includes(q) && 
          !empName.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const uniqueTables = Array.from(new Set(logs.map(l => l.table_name))).sort();

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Action', 'Table', 'Record ID', 'User', 'Role'];
    const rows = filteredLogs.map(l => [
      new Date(l.changed_at).toISOString(),
      l.action,
      l.table_name,
      l.record_id,
      l.employees ? `${l.employees.first_name} ${l.employees.last_name}` : 'System/Unknown',
      l.employees?.role || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  if (!['admin', 'ceo', 'cto', 'qa'].includes(role)) {
    return <div className="p-8 text-center font-bold text-red-600">Access Restricted. You do not have permission to view Audit Logs.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/compliance" className="text-slate-400 hover:text-navy transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <PageHeader title="System Audit Logs" description="Part 11 Compliant immutable event stream" icon={Shield} />
      </div>

      <div className="card p-4 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50 border border-slate-200">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input 
              value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
              placeholder="Search user, table, or ID..." 
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm w-full sm:w-64 outline-none focus:border-navy"
            />
          </div>
          <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none">
            <option value="ALL">All Actions</option>
            <option value="INSERT">INSERT (Create)</option>
            <option value="UPDATE">UPDATE (Modify)</option>
            <option value="DELETE">DELETE (Remove)</option>
          </select>
          <select value={tableFilter} onChange={e=>setTableFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none">
            <option value="ALL">All Tables</option>
            {uniqueTables.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-navy text-white font-bold rounded-xl text-sm shrink-0 hover:bg-navy-hover transition-all">
          <Download className="w-4 h-4"/> Export CSV
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs w-48">Timestamp</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs w-24">Action</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Table / Module</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Record ID</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading audit logs...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No logs found matching criteria.</td></tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-xs">
                      {new Date(log.changed_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                        log.action === 'INSERT' ? 'bg-emerald-100 text-emerald-700' :
                        log.action === 'UPDATE' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">{log.table_name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{log.record_id.substring(0,8)}...</td>
                    <td className="px-4 py-3">
                      {log.employees ? (
                        <div>
                          <p className="font-bold text-slate-800 text-xs">{log.employees.first_name} {log.employees.last_name}</p>
                          <p className="text-[10px] text-slate-500 uppercase">{log.employees.role}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">System / Unknown</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
