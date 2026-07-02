'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { FlaskConical, Plus, CheckCircle2, Activity, Search, ArrowUpDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import EditRequestButton from '@/components/ui/EditRequestButton';
import CreatorBadge from '@/components/ui/CreatorBadge';

const STATUS_META = {
  setup:     { label: 'Setup',     color: 'bg-slate-100 text-slate-600 border-slate-200' },
  active:    { label: 'Active',    color: 'bg-slate-50 text-slate-700 border-slate-200' },
  completed: { label: 'Completed', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  analysed:  { label: 'Analysed',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const TYPE_META = {
  growth_curve:  { label: 'Growth Curve',  color: 'bg-slate-50 text-slate-700 border-slate-200' },
  fermentation:  { label: 'Fermentation',  color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function elapsedLabel(inocTime) {
  if (!inocTime) return null;
  const h = (Date.now() - new Date(inocTime).getTime()) / 3600000;
  if (h < 1) return `${Math.round(h * 60)}m elapsed`;
  return `${h.toFixed(1)}h elapsed`;
}

const SORT_OPTIONS = [
  { value: 'newest',  label: 'Newest First' },
  { value: 'oldest',  label: 'Oldest First' },
  { value: 'name_az', label: 'Name A → Z' },
  { value: 'name_za', label: 'Name Z → A' },
  { value: 'status',  label: 'By Status' },
];

export default function GrowthStudiesPage() {
  const { employeeProfile, role } = useAuth();
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [pendingIds, setPendingIds] = useState(new Set());
  const supabase = useMemo(() => createClient(), []);

  const fetchStudies = () => {
    fetch('/api/growth-studies')
      .then(r => r.json())
      .then(d => { setStudies(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchPendingIds = async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  };

  useEffect(() => { fetchStudies(); fetchPendingIds(); }, []);

  const filtered = useMemo(() => {
    let result = studies;

    // Filter by status/type
    if (filter !== 'all') result = result.filter(s => s.status === filter || s.study_type === filter);

    // Search by name, study_code, isolate, media
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.study_code?.toLowerCase().includes(q) ||
        s.cell_bank_strains?.name?.toLowerCase().includes(q) ||
        s.cell_bank_preparations?.prep_code?.toLowerCase().includes(q) ||
        s.formulations?.name?.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result];
    if (sort === 'newest') result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sort === 'oldest') result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sort === 'name_az') result.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'name_za') result.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === 'status') {
      const order = { active: 0, setup: 1, completed: 2, analysed: 3 };
      result.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
    }

    return result;
  }, [studies, filter, search, sort]);

  const counts = useMemo(() => ({
    active: studies.filter(s => s.status === 'active').length,
    setup: studies.filter(s => s.status === 'setup').length,
    completed: studies.filter(s => ['completed', 'analysed'].includes(s.status)).length,
  }), [studies]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading studies…</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Growth Studies</h1>
          <p className="text-slate-500 mt-1 font-medium">Growth curve characterisation & fermentation monitoring.</p>
        </div>
        <Link
          href="/growth-studies/new"
          className="inline-flex items-center px-5 py-3 bg-slate-700 hover:bg-slate-800 text-white font-black rounded-2xl shadow-lg shadow-slate-500/20 transition-all text-sm uppercase tracking-widest"
        >
          <Plus className="w-4 h-4 mr-2" /> New Study
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active', value: counts.active, icon: Activity, color: 'text-slate-600 bg-slate-50' },
          { label: 'In Setup', value: counts.setup, icon: FlaskConical, color: 'text-slate-600 bg-slate-100' },
          { label: 'Completed', value: counts.completed, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
        ].map(c => (
          <div key={c.label} className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-800">{c.value}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 placeholder:text-slate-400"
            placeholder="Search by name, code, isolate, media…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
          )}
        </div>
        <div className="relative">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 appearance-none"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'active', 'setup', 'completed', 'growth_curve', 'fermentation'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-colors ${
              filter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f === 'all' ? 'All' : f === 'growth_curve' ? 'Growth Curve' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        {(search || filter !== 'all') && (
          <button onClick={() => { setSearch(''); setFilter('all'); }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center">
          <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No studies found.</p>
          <Link href="/growth-studies/new" className="mt-4 inline-block text-slate-600 font-bold text-sm hover:underline">
            Create your first study →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {filtered.map(study => {
            const isolateName = study.cell_bank_strains?.name || study.cell_bank_preparations?.prep_code || '—';
            const mediaName = study.formulations?.name || '—';
            const tp = study.growth_study_time_points || [];
            const done = tp.filter(t => t.status === 'completed').length;
            const total = tp.length;
            const sm = STATUS_META[study.status] || STATUS_META.setup;
            const tm = TYPE_META[study.study_type] || TYPE_META.growth_curve;

            return (
              <div key={study.id} className="glass-card rounded-2xl overflow-hidden hover:shadow-lg transition-all group">
                <Link href={`/growth-studies/${study.id}`} className="p-6 block">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider border ${sm.color}`}>{sm.label}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider border ${tm.color}`}>{tm.label}</span>
                    </div>
                    {study.status === 'active' && (
                      <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                        {elapsedLabel(study.inoculation_time)}
                      </span>
                    )}
                  </div>

                  <h3 className="font-black text-slate-800 text-base group-hover:text-slate-700 transition-colors mb-1">{study.name}</h3>
                  <p className="text-xs font-mono text-slate-400 mb-0.5">{study.study_code || '—'}</p>
                  <p className="text-xs text-slate-500 font-medium mb-4">{isolateName} · {mediaName}</p>

                  {study.temperature_c && (
                    <div className="flex gap-3 text-xs font-bold text-slate-500 mb-4">
                      <span>{study.temperature_c}°C</span>
                      {study.agitation_rpm && <span>{study.agitation_rpm} rpm</span>}
                      {study.vessel_type && <span>{study.vessel_type.replace(/_/g, ' ')}</span>}
                    </div>
                  )}

                  {total > 0 && (
                    <div>
                      <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                        <span>Time points</span>
                        <span>{done}/{total}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-500 rounded-full transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                </Link>

                {/* Creator + edit actions below the link area */}
                {(study.creator || (!isAdmin && study.created_by === employeeProfile?.id)) && (
                  <div className="px-6 pb-4 flex items-center justify-between border-t border-white/40 pt-3">
                    <div className="flex items-center gap-1.5">
                      {study.creator && <CreatorBadge initials={study.creator.initials} fullName={study.creator.full_name} size="sm" showTooltip={false}/>}
                      {study.creator && <span className="text-xs text-slate-400 font-medium">{study.creator.full_name}</span>}
                    </div>
                    {!isAdmin && study.created_by === employeeProfile?.id && (
                      <EditRequestButton
                        tableName="growth_studies"
                        recordId={study.id}
                        moduleLabel="Growth Studies"
                        fields={[
                          { key: 'name', label: 'Study Name' },
                          { key: 'vessel_type', label: 'Vessel Type' },
                          { key: 'temperature_c', label: 'Temperature (°C)', type: 'number' },
                        ]}
                        currentData={study}
                        hasPending={pendingIds.has(study.id)}
                        allowDelete={study.status === 'setup'}
                        onSuccess={() => { fetchStudies(); fetchPendingIds(); }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
