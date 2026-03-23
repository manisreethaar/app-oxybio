'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Users, Star, ClipboardList, Plus, ChevronRight, Loader2, Award, Zap, TrendingUp, X } from 'lucide-react';
import Skeleton from '@/components/Skeleton';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

export default function ConsumerResearchPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      session_title: z.string().min(1, 'Title required'),
      panelist_count: z.preprocess((val) => Number(val), z.number().min(1)),
      sample_ids: z.string().optional()
    })),
    defaultValues: { session_title: '', panelist_count: 5, sample_ids: '' }
  });

  const supabase = useMemo(() => createClient(), []);


  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('taste_panels').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSessions(data || []);
    } catch (err) { console.error('Fetch sessions error:', err); }
    finally { setLoading(false); }
  }, [supabase]);


  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleCreateSession = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, test_criteria: ['Taste', 'Texture', 'Smell'] })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to start session.');
      setShowNew(false); reset(); fetchSessions();
    } catch (err) { alert(err.message); }
    finally { setSubmitting(false); }
  };


  if (authLoading) return <div className="page-container space-y-6"><div className="flex justify-between items-center"><Skeleton width={200} height={32}/> <Skeleton width={150} height={40}/></div><Skeleton className="h-64 w-full rounded-2xl"/></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Consumer Insights</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Sensory Validation & Taste Panel Data</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> New Panel Session
        </button>
      </div>

      {sessions.length >= 2 && (
        <div className="surface p-6 mb-6">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-navy" /> Sensory Score Trend</h2>
          <p className="text-xs text-gray-500 font-medium mb-5">7.0+ threshold = consumer-ready formulation</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={[...sessions].reverse().map((s, i) => ({ name: `S${i + 1}`, score: parseFloat(s.avg_score || 0), label: s.session_title })).filter(d => !isNaN(d.score))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/><XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }}/><YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#9ca3af' }} unit="/10"/><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }}/><ReferenceLine y={7} stroke="#0f766e" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="score" stroke="#1F3A5F" strokeWidth={2.5} dot={(props) => <circle key={`dot-${props.payload.name}`} cx={props.cx} cy={props.cy} r={5} fill={props.payload.score >= 7 ? '#1F3A5F' : '#f87171'} stroke="white" strokeWidth={2} />} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full rounded-xl"/>
            <Skeleton className="h-48 w-full rounded-xl"/>
            <Skeleton className="h-48 w-full rounded-xl"/>
          </div>
        ) : sessions.length === 0 ? <div className="col-span-full py-16 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm font-medium text-gray-400">No panel data recorded.</div> : sessions.map(s => (
          <div key={s.id} className="surface p-6 hover:shadow-md transition-all group relative overflow-hidden">
             <div className="flex items-center justify-between mb-6"><span className="px-2 py-0.5 bg-blue-50 text-navy rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100 flex items-center gap-1"><Users className="w-3 h-3"/> {s.panelist_count} Panelists</span><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{new Date(s.created_at).toLocaleDateString()}</p></div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{s.session_title}</h3><p className="text-xs font-bold text-navy font-mono mb-6">{s.sample_ids || 'V1 / V2 / V3 Comparison'}</p>
              
              {/* Innovation 5: Sensory Spider Charts */}
              <div className="h-48 w-full mb-6 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={
                    (s.test_criteria || ['Taste', 'Aroma', 'Texture', 'Aftertaste', 'Visual']).map(crit => {
                      // Calculate average score for this specific criteria from the panel
                      const rawScores = (s.scores || []);
                      const avgForCrit = rawScores.length > 0 
                        ? (rawScores.reduce((acc, curr) => acc + (curr[crit] || 0), 0) / rawScores.length)
                        : (s.avg_score || 0); // fallback to composite if no per-criteria logs

                      return { subject: crit, A: parseFloat(avgForCrit.toFixed(1)) };
                    })
                  }>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                    <Radar name="Score" dataKey="A" stroke="#1F3A5F" fill="#1F3A5F" fillOpacity={0.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>


              <div className="flex items-end justify-between">
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Composite Score</p><div className="flex items-baseline gap-2"><span className={`text-3xl font-black tracking-tight ${s.avg_score >= 7.0 ? 'text-navy' : 'text-red-600'}`}>{s.avg_score || '—'}</span><span className="text-xs font-semibold text-gray-400">/ 10</span></div></div>
                {s.avg_score >= 7.0 ? <span className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100"><Award className="w-6 h-6"/></span> : <span className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100"><Zap className="w-6 h-6"/></span>}
             </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowNew(false)} className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 transition-all"><X className="w-5 h-5 text-gray-400"/></button>
             <div className="p-6 pb-28">
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Panel Setup</h2>
                <form onSubmit={handleSubmit(handleCreateSession)} className="mt-4 space-y-4">
                   <div><label className="block text-xs font-bold text-gray-700 mb-1">Session Target</label><input placeholder="e.g. Kavuni Pro v3.1 Blind Test" {...register('session_title')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />{errors.session_title && <p className="text-red-500 text-xs mt-1">{errors.session_title.message}</p>}</div>
                   <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-bold text-gray-700 mb-1">Panelists</label><input type="number" min="1" {...register('panelist_count')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" /></div>
                      <div><label className="block text-xs font-bold text-gray-700 mb-1">Version/IDs</label><input placeholder="e.g. V1, V2" {...register('sample_ids')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" /></div>
                   </div>
                   <button type="submit" disabled={submitting} className="w-full py-2.5 bg-navy border border-navy hover:bg-navy-hover text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-sm active:scale-95 transition-all">{submitting ? 'Starting...' : 'Start Session'}</button>
                </form>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
