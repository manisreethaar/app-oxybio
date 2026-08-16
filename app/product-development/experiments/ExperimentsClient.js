'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { Plus, Beaker, FlaskConical, Search, Clock, CheckCircle, XCircle } from 'lucide-react';
import MobilePageHeader from '@/components/ui/MobilePageHeader';
import { format } from 'date-fns';

const STATUS_BADGE = {
  pending_review: { label: 'Pending Review', icon: Clock, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved:       { label: 'Approved',       icon: CheckCircle, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected:       { label: 'Rejected',       icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
};

export default function ExperimentsClient({ initialExperiments }) {
  const { canDo } = useAuth();
  const toast = useToast();

  const [experiments, setExperiments] = useState(initialExperiments || []);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const canCreate = canDo('rnd_experiments', 'create');


  const filtered = useMemo(() => experiments.filter(e =>
    !searchTerm ||
    e.experiment_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.title?.toLowerCase().includes(searchTerm.toLowerCase())
  ), [experiments, searchTerm]);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <MobilePageHeader title="R&D Experiments" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Mode switcher */}
        <div className="flex gap-2">
          <Link href="/product-development" className="px-4 py-2 rounded-xl text-sm font-bold bg-white text-slate-600 border border-slate-200 hover:border-navy/50 hover:text-navy transition-colors flex items-center gap-1.5">
            <Beaker className="w-4 h-4" /> Batch-Linked
          </Link>
          <span className="px-4 py-2 rounded-xl text-sm font-bold bg-navy text-white shadow-sm flex items-center gap-1.5">
            <FlaskConical className="w-4 h-4" /> Standalone R&amp;D
          </span>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-navy flex items-center gap-3">
              <FlaskConical className="w-8 h-8 text-navy" />
              R&amp;D Experiments
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              Standalone formulation trials, not tied to any production batch
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search experiments..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-navy/30 outline-none"
              />
            </div>
            {canCreate && (
              <Link
                href="/product-development/experiments/new"
                className="flex items-center justify-center gap-2 bg-navy text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-navy/20 hover:bg-navy-hover transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>New Experiment</span>
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-navy border-t-transparent rounded-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">No Experiments Logged Yet</h3>
            <p className="text-slate-500 mt-1">
              {canCreate ? 'Click "New Experiment" to log a standalone R&D trial.' : 'No experiments have been logged yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(e => {
              const badge = STATUS_BADGE[e.status] || STATUS_BADGE.pending_review;
              const BadgeIcon = badge.icon;
              return (
                <Link key={e.id} href={`/product-development/experiments/${e.id}`}>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-navy/50 transition-all cursor-pointer group flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-black text-navy group-hover:text-navy transition-colors">{e.experiment_id}</h3>
                        <p className="text-xs font-bold text-slate-400 mt-1">{format(new Date(e.created_at), 'MMM d, yyyy')}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${badge.className}`}>
                        <BadgeIcon className="w-3 h-3" /> {badge.label}
                      </span>
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-600 truncate">{e.title}</span>
                      <span className="text-xs font-bold text-navy bg-navy/5 px-2 py-1 rounded-lg shrink-0 ml-2">View →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
