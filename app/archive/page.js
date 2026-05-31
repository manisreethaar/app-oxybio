'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, Activity, FlaskConical, Loader2, Trash2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function ArchivePage() {
  const { role, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState('batches');
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [activities, setActivities] = useState([]);

  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  const fetchArchive = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [batchRes, activityRes] = await Promise.all([
        supabase
          .from('batches')
          .select('id, batch_id, experiment_type, sku_target, status, current_stage, archived_at, created_at, formulations(name, code, version)')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('activity_log')
          .select('id, created_at, archived_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, severity, employees(full_name)')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
      ]);

      if (batchRes.error) throw batchRes.error;
      if (activityRes.error) throw activityRes.error;
      setBatches(batchRes.data || []);
      setActivities(activityRes.data || []);
    } catch (err) {
      toast.error('Failed to load archive: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, supabase, toast]);

  useEffect(() => {
    if (!authLoading) fetchArchive();
  }, [authLoading, fetchArchive]);

  const deleteArchivedBatch = async (id) => {
    try {
      const res = await fetch(`/api/batches?id=${id}&permanent=true`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete archived batch.');
      setBatches(prev => prev.filter(item => item.id !== id));
      toast.success(data.message || 'Archived batch permanently deleted.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteArchivedActivity = async (id) => {
    try {
      const res = await fetch(`/api/activity?id=${id}&permanent=true`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete archived activity.');
      setActivities(prev => prev.filter(item => item.id !== id));
      toast.success(data.message || 'Archived activity permanently deleted.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[50vh] text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading archive...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-container">
        <div className="surface p-8 text-center">
          <Archive className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <h1 className="text-xl font-black text-gray-900">Archive</h1>
          <p className="text-sm text-gray-500 mt-1">Only admins, CEO, and CTO can access archived records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Archive className="w-7 h-7 text-slate-500" />
          Archive
        </h1>
        <p className="text-sm text-gray-500 mt-1">Archived records are kept here before any permanent deletion.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'batches', label: 'Batches', count: batches.length, icon: FlaskConical },
          { id: 'activity', label: 'Activity', count: activities.length, icon: Activity },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-2 ${tab === item.id ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === item.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'batches' && (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Batch</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Recipe</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Archived</th>
                  <th className="px-5 py-3 text-right text-[10px] font-black text-gray-400 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {batches.map(batch => (
                  <tr key={batch.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-xs font-mono font-black text-gray-900">{batch.batch_id}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-700">{batch.formulations?.name || '-'}</td>
                    <td className="px-5 py-3 text-xs font-bold text-gray-500">{batch.status || '-'}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{new Date(batch.archived_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <Link href={`/batches/${batch.id}`} className="text-xs font-bold text-accent hover:underline">View</Link>
                      <button onClick={() => deleteArchivedBatch(batch.id)} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline">
                        <Trash2 className="w-3.5 h-3.5" /> Delete permanently
                      </button>
                    </td>
                  </tr>
                ))}
                {batches.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">No archived batches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-3">
          {activities.map(item => (
            <div key={item.id} className="surface p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-black text-gray-900">{item.employees?.full_name || 'Unknown'}</span>
                  <span className="text-xs text-gray-400">{item.start_time} - {item.end_time}</span>
                  {item.issue_observed && <span className="text-[10px] font-black text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">ISSUE</span>}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.activity_description}</p>
                <p className="text-[11px] text-gray-400 mt-2">Archived {new Date(item.archived_at).toLocaleString()}</p>
              </div>
              <button onClick={() => deleteArchivedActivity(item.id)} className="shrink-0 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-100 text-xs font-bold hover:bg-red-100">
                <Trash2 className="w-3.5 h-3.5" /> Delete permanently
              </button>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="surface p-10 text-center text-sm text-gray-400">No archived activity.</div>
          )}
        </div>
      )}
    </div>
  );
}
