'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Plus, FlaskConical, Beaker, Clock, CheckCircle2, AlertCircle, Edit2 } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import IncubationFormModal from './components/IncubationFormModal';

export default function SampleIncubationPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/research/incubation');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch samples');
      setSamples(json.data || []);
    } catch (err) { 
        toast.error(err.message); 
    } finally { 
        setLoading(false); 
    }
  }, [toast]);

  useEffect(() => { fetchSamples(); }, [fetchSamples]);

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
        <button onClick={() => { setEditData(null); setShowModal(true); }} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> Log New Sample
        </button>
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
                    {sample.batches && <div className="text-[10px] font-mono text-gray-500 mt-1">Batch: {sample.batches.batch_id}</div>}
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{new Date(sample.start_time).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{sample.incubation_temp_c}°C</div>
                  </td>
                  <td className="p-4">
                    {!sample.end_time ? (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                            <Clock className="w-3 h-3 mr-1" /> Ongoing
                        </span>
                    ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider border border-gray-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Completed ({sample.duration_hours?.toFixed(1)}h)
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
                     <button onClick={() => { setEditData(sample); setShowModal(true); }} className="p-2 text-gray-400 hover:text-navy hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                     </button>
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
