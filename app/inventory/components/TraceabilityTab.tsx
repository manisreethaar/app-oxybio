'use client';
import { useState, useEffect, useCallback } from 'react';
import { Link2, Search, ArrowRight, Loader2, Download } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function TraceabilityTab({ initialRecords }: { initialRecords: any[] }) {
  const [records, setRecords] = useState(initialRecords || []);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const toast = useToast();

  const fetchRecords = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/traceability?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (json.success) setRecords(json.data);
      else toast.error(json.error || 'Failed to load records');
    } catch (e) { toast.error('Network error'); }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // Skip initial fetch if there's no search term and we already have records from SSR
    if (!searchTerm && records.length > 0 && records === initialRecords) return;
    
    const timer = setTimeout(() => fetchRecords(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchRecords, records, initialRecords]);

  const handleExport = () => {
    const headers = ['Date', 'Item Name', 'Lot Number', 'Quantity Used', 'Context', 'Details', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...records.map(r => [
        new Date(r.date).toLocaleString(),
        `"${r.item_name}"`,
        `"${r.lot_number}"`,
        r.quantity_used,
        `"${r.context}"`,
        `"${r.context_label}"`,
        `"${r.notes || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Lot_Traceability_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">Lot Traceability Report</h2>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Raw Material to Usage Context Linkage</p>
        </div>
        <button onClick={handleExport} className="flex items-center justify-center px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 shadow-sm text-sm">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Search by lot number, item name, or context label..."
          className="block w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 shadow-sm focus:ring-4 focus:ring-slate-50 focus:border-slate-500 font-bold transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-slate-600" />
            <p className="font-bold">Loading traceability data...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Link2 className="w-12 h-12 mb-4 text-slate-200" />
            <p className="font-black text-slate-500 uppercase tracking-widest">No Records Found</p>
            <p className="text-sm font-semibold mt-2">Try adjusting your search criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-500">Date Logged</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-500">Raw Material (Lot)</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-500 text-center">Link</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-500">Usage Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-700">{new Date(r.date).toLocaleDateString()}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{new Date(r.date).toLocaleTimeString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-900">{r.item_name}</p>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Lot: {r.lot_number}</p>
                      <p className="text-xs font-semibold text-slate-500 mt-1">Used: {r.quantity_used}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-300 group-hover:text-slate-400 transition-colors">
                        <ArrowRight className="w-5 h-5" />
                        <Link2 className="w-3 h-3 mt-1" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-800">{r.context_label}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200 text-[10px] font-black uppercase tracking-wider">
                        {r.context}
                      </span>
                      {r.notes && (
                        <p className="text-[11px] font-semibold text-slate-400 mt-1 italic truncate max-w-[200px]" title={r.notes}>{r.notes}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
