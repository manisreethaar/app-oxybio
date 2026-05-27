'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { FlaskConical, Plus, Clock, CheckCircle2, Activity, BarChart2, AlertCircle } from 'lucide-react';

const STATUS_META = {
  setup:     { label: 'Setup',     color: 'bg-slate-100 text-slate-600 border-slate-200' },
  active:    { label: 'Active',    color: 'bg-teal-50 text-teal-700 border-teal-200' },
  completed: { label: 'Completed', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  analysed:  { label: 'Analysed',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};
const TYPE_META = {
  growth_curve:  { label: 'Growth Curve',  color: 'bg-violet-50 text-violet-700 border-violet-200' },
  fermentation:  { label: 'Fermentation',  color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function elapsedLabel(inocTime) {
  if (!inocTime) return null;
  const h = (Date.now() - new Date(inocTime).getTime()) / 3600000;
  if (h < 1) return `${Math.round(h * 60)}m elapsed`;
  return `${h.toFixed(1)}h elapsed`;
}

export default function GrowthStudiesPage() {
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetch('/api/growth-studies')
      .then(r => r.json())
      .then(d => { setStudies(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return studies;
    return studies.filter(s => s.status === filter || s.study_type === filter);
  }, [studies, filter]);

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
          className="inline-flex items-center px-5 py-3 bg-teal-700 hover:bg-teal-800 text-white font-black rounded-2xl shadow-lg shadow-teal-500/20 transition-all text-sm uppercase tracking-widest"
        >
          <Plus className="w-4 h-4 mr-2" /> New Study
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active', value: counts.active, icon: Activity, color: 'text-teal-600 bg-teal-50' },
          { label: 'In Setup', value: counts.setup, icon: FlaskConical, color: 'text-slate-600 bg-slate-100' },
          { label: 'Completed', value: counts.completed, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
        ].map(c => (
          <div key={c.label} className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-800">{c.value}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{c.label}</p>
            </div>
          </div>
        ))}
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
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center">
          <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No studies found.</p>
          <Link href="/growth-studies/new" className="mt-4 inline-block text-teal-600 font-bold text-sm hover:underline">
            Create your first study →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(study => {
            const isolateName = study.cell_bank_strains?.name || study.cell_bank_preparations?.prep_code || '—';
            const mediaName = study.formulations?.name || '—';
            const tp = study.growth_study_time_points || [];
            const done = tp.filter(t => t.status === 'completed').length;
            const total = tp.length;
            const sm = STATUS_META[study.status] || STATUS_META.setup;
            const tm = TYPE_META[study.study_type] || TYPE_META.growth_curve;

            return (
              <Link key={study.id} href={`/growth-studies/${study.id}`}
                className="glass-card rounded-2xl p-6 hover:shadow-lg transition-all group block"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${sm.color}`}>{sm.label}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${tm.color}`}>{tm.label}</span>
                  </div>
                  {study.status === 'active' && (
                    <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                      {elapsedLabel(study.inoculation_time)}
                    </span>
                  )}
                </div>

                <h3 className="font-black text-slate-800 text-base group-hover:text-teal-700 transition-colors mb-1">{study.name}</h3>
                <p className="text-[10px] font-mono text-slate-400 mb-0.5">{study.study_code || '—'}</p>
                <p className="text-xs text-slate-500 font-medium mb-4">{isolateName} · {mediaName}</p>

                {study.temperature_c && (
                  <div className="flex gap-3 text-[11px] font-bold text-slate-500 mb-4">
                    <span>{study.temperature_c}°C</span>
                    {study.agitation_rpm && <span>{study.agitation_rpm} rpm</span>}
                    {study.vessel_type && <span>{study.vessel_type.replace(/_/g, ' ')}</span>}
                  </div>
                )}

                {total > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                      <span>Time points</span>
                      <span>{done}/{total}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
