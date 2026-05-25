'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { Plus, FlaskConical, Beaker, Clock, CheckCircle2, AlertCircle, Edit2, Search, Trash2 } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import IncubationFormModal from './components/IncubationFormModal';

export default function SampleIncubationPage() {
  const { employeeProfile, role, loading: authLoading } = useAuth();
  const toast = useToast();
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());

      const res = await fetch(`/api/research/incubation?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch samples');
      setSamples(json.data || []);
    } catch (err) { 
        toast.error(err.message); 
    } finally { 
        setLoading(false); 
    }
  }, [categoryFilter, searchTerm, statusFilter, toast]);

  useEffect(() => { fetchSamples(); }, [fetchSamples]);

  const stats = useMemo(() => {
    const now = Date.now();
    return samples.reduce((acc, sample) => {
      const isOngoing = !sample.end_time;
      const hoursOpen = sample.start_time ? (now - new Date(sample.start_time).getTime()) / 36e5 : 0;

      acc.total += 1;
      if (isOngoing) acc.ongoing += 1;
      if (sample.sterility_status === 'Contaminated') acc.contaminated += 1;
      if (isOngoing && hoursOpen > 72) acc.overdue += 1;
      return acc;
    }, { total: 0, ongoing: 0, contaminated: 0, overdue: 0 });
  }, [samples]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this incubation record? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/research/incubation?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
      toast.success('Record deleted.');
      fetchSamples();
    } catch (err) { toast.error(err.message); }
    finally { setDeletingId(null); }
  };

  const openNewRecord = () => {
    setEditData(null);
    setShowModal(true);
  };

  if (authLoading) return <div className="page-container space-y-6"><Skeleton className="h-64 w-full rounded-2xl"/></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-navy" /> Sample Incubation
          </h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Track R&D plates, broths, and cell bank preparations</p>
        </div>
        <button onClick={openNewRecord} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> Log New Sample
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          ['Total Records', stats.total, 'text-gray-900'],
          ['Ongoing', stats.ongoing, 'text-blue-700'],
          ['Over 72h Open', stats.overdue, stats.overdue ? 'text-amber-700' : 'text-gray-900'],
          ['Contaminated', stats.contaminated, stats.contaminated ? 'text-red-700' : 'text-gray-900']
        ].map(([label, value, color]) => (
          <div key={label} className="surface p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
            <p className={`mt-1 text-2xl font-black font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="surface p-3 mb-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search sample name..."
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold outline-none focus:border-navy focus:ring-1 focus:ring-navy"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold outline-none focus:border-navy">
          <option value="all">All statuses</option>
          <option value="ongoing">Ongoing only</option>
          <option value="completed">Completed only</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold outline-none focus:border-navy">
          <option value="all">All categories</option>
          <option value="Fermentation IPC">Fermentation IPC</option>
          <option value="Cell Bank">Cell Bank</option>
          <option value="Passage">Passage</option>
          <option value="Subculture">Subculture</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Sample / Category</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Type / Batch</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Incubation Start</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Results</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-4 text-center text-gray-400">Loading records...</td>
                </tr>
              ) : samples.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-400 font-medium">No samples recorded yet.</td>
                </tr>
              ) : samples.map(sample => (
                <tr key={sample.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-gray-900">{sample.sample_name}</div>
                    <div className="text-[10px] uppercase font-bold text-gray-400 mt-0.5">{sample.sample_category}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center text-xs font-medium text-gray-700">
                        {sample.sample_type === 'Agar Plate' ? <Beaker className="w-3.5 h-3.5 mr-1.5 text-orange-500" /> : <FlaskConical className="w-3.5 h-3.5 mr-1.5 text-blue-500" />}
                        {sample.sample_type}
                    </div>
                    {sample.batches && (
                      <Link href={`/batches/${sample.batch_id}`} className="text-[10px] font-mono text-navy hover:underline mt-1 block" onClick={e => e.stopPropagation()}>
                        Batch: {sample.batches.batch_id}
                      </Link>
                    )}
                    {sample.batch_flasks && <div className="text-[10px] font-mono text-gray-500 mt-1">Trial: {sample.batch_flasks.flask_label}</div>}
                    {sample.batch_flask_qc_samples && <div className="text-[10px] font-mono text-gray-500 mt-1">QC: {sample.batch_flask_qc_samples.sample_id}</div>}
                    {sample.source_stage && <div className="text-[10px] uppercase font-bold text-gray-400 mt-1">Stage: {sample.source_stage.replace(/_/g, ' ')}</div>}
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{sample.start_time ? new Date(sample.start_time).toLocaleString() : 'Not set'}</div>
                    <div className="text-xs text-gray-500">{sample.incubation_temp_c ?? '-'} C</div>
                  </td>
                  <td className="p-4">
                    {!sample.end_time ? (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                            <Clock className="w-3 h-3 mr-1" /> Ongoing
                        </span>
                    ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider border border-gray-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Completed ({Number(sample.duration_hours || 0).toFixed(1)}h)
                        </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                        {sample.sterility_status === 'Pending' ? (
                            <span className="text-xs text-gray-400">Pending Sterility</span>
                        ) : sample.sterility_status === 'Sterile' ? (
                            <span className="text-xs font-medium text-emerald-600 flex items-center"><CheckCircle2 className="w-3 h-3 mr-1"/> Sterile</span>
                        ) : (
                            <span className="text-xs font-medium text-red-600 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/> Contaminated</span>
                        )}
                        {sample.od_value && <span className="text-[10px] text-gray-500 font-mono">OD: {sample.od_value}</span>}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditData(sample); setShowModal(true); }} className="p-2 text-gray-400 hover:text-navy hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(sample.id)}
                          disabled={deletingId === sample.id}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                          title="Delete record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
