'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useRouter } from 'next/navigation';
import {
  FlaskConical, Plus, BarChart2, Activity, Beaker,
  ChevronRight, Loader2, X, Clock, CheckCircle, Settings, Search
} from 'lucide-react';
import CreatorBadge from '@/components/ui/CreatorBadge';

const TYPE_META = {
  pbd: { label: 'Plackett-Burman Design', shortLabel: 'PBD', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: BarChart2, runs: 12, desc: 'Screen up to 11 factors in 12 runs to identify significant variables' },
  rsm: { label: 'Response Surface Methodology', shortLabel: 'RSM', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Activity, runs: 15, desc: 'Box-Behnken design (3 factors, 15 runs) to find optimal conditions' },
  kinetics: { label: 'Fermentation Kinetics', shortLabel: 'Kinetics', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Beaker, runs: null, desc: 'Fit Monod, Michaelis-Menten, or Luedeking-Piret kinetic models' },
};

const STATUS_META = {
  setup:      { label: 'Setup',      color: 'bg-slate-100 text-slate-600',    icon: Settings },
  collecting: { label: 'Collecting', color: 'bg-blue-50 text-blue-700',       icon: Clock },
  complete:   { label: 'Complete',   color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
};

const createSchema = z.object({
  title:             z.string().min(1, 'Title required'),
  description:       z.string().optional(),
  type:              z.enum(['pbd', 'rsm', 'kinetics']),
  response_variable: z.string().min(1, 'Response variable required'),
  response_unit:     z.string().optional(),
});

export default function BioprocessPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { title: '', description: '', type: 'pbd', response_variable: 'OD600 at 24h', response_unit: '' },
  });
  const watchedType = watch('type');

  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bioprocess');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setExperiments(json.data || []);
    } catch (e) {
      toast.error('Failed to load experiments: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);

  const onSubmit = async (data) => {
    try {
      const res = await fetch('/api/bioprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Experiment created');
      reset();
      setShowCreate(false);
      router.push(`/bioprocess/${json.data.id}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return experiments
      .filter(e => {
        const matchesType = typeFilter === 'all' || e.type === typeFilter;
        const matchesSearch = !q || [
          e.title,
          e.description,
          e.response_variable,
          e.response_unit,
          e.status,
          TYPE_META[e.type]?.label,
          e.creator?.full_name
        ].some(value => String(value || '').toLowerCase().includes(q));
        return matchesType && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortOrder === 'title') return (a.title || '').localeCompare(b.title || '');
        if (sortOrder === 'status') return (a.status || '').localeCompare(b.status || '');
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [experiments, typeFilter, searchTerm, sortOrder]);

  if (authLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-navy animate-spin" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Bioprocess Lab</h1>
          <p className="text-sm text-gray-500 mt-1">PBD screening · RSM optimisation · Fermentation kinetics</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-navy text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-navy/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Experiment
        </button>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[['all', 'All'], ['pbd', 'PBD'], ['rsm', 'RSM'], ['kinetics', 'Kinetics']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTypeFilter(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${typeFilter === v ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search experiments, response, creator..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
          />
        </div>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 outline-none">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="title">Title A-Z</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Experiment Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 text-navy animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <FlaskConical className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">{experiments.length === 0 ? 'No experiments yet' : 'No matching experiments'}</p>
          <p className="text-sm text-gray-400 mt-1">{experiments.length === 0 ? 'Create your first bioprocess experiment to get started' : 'Adjust search, type, or sort controls'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(exp => {
            const tm = TYPE_META[exp.type];
            const sm = STATUS_META[exp.status] || STATUS_META.setup;
            const Icon = tm.icon;
            const StatusIcon = sm.icon;
            return (
              <button
                key={exp.id}
                onClick={() => router.push(`/bioprocess/${exp.id}`)}
                className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all p-5 group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${tm.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {tm.shortLabel}
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${sm.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {sm.label}
                  </div>
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1 group-hover:text-navy transition-colors line-clamp-2">{exp.title}</h3>
                {exp.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{exp.description}</p>}
                <div className="flex items-center justify-between text-xs text-gray-400 mt-3">
                  <span>{exp.response_variable}</span>
                  <span className="flex items-center gap-1 text-navy font-semibold">
                    Open <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
                {exp.creator && (
                  <div className="flex items-center gap-1.5 mt-2 border-t border-gray-50 pt-2">
                    <CreatorBadge initials={exp.creator.initials} fullName={exp.creator.full_name} />
                    <p className="text-[11px] text-gray-400">
                      {exp.creator.full_name} · {new Date(exp.created_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
          <div className="h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900">New Experiment</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors">
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Experiment Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {Object.entries(TYPE_META).map(([v, m]) => {
                    const Icon = m.icon;
                    return (
                      <label key={v} className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${watchedType === v ? 'border-navy bg-navy/5' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" value={v} {...register('type')} className="sr-only" />
                        <Icon className={`w-5 h-5 mb-1.5 ${watchedType === v ? 'text-navy' : 'text-gray-400'}`} />
                        <div className={`text-xs font-bold ${watchedType === v ? 'text-navy' : 'text-gray-600'}`}>{m.shortLabel}</div>
                      </label>
                    );
                  })}
                </div>
                {watchedType && (
                  <p className="text-xs text-gray-500 mt-2 ml-1">{TYPE_META[watchedType].desc}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Experiment Title</label>
                <input {...register('title')} placeholder="e.g. LAB Media Optimisation Run 1" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy" />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Description (optional)</label>
                <textarea {...register('description')} rows={2} placeholder="Brief objective or notes" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy resize-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Response Variable</label>
                  <input {...register('response_variable')} placeholder="OD600 at 24h" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy" />
                  {errors.response_variable && <p className="text-xs text-red-500 mt-1">{errors.response_variable.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Unit</label>
                  <input {...register('response_unit')} placeholder="AU, g/L, mM/min…" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 bg-navy text-white rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
