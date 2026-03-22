'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Users, Star, ClipboardList, Plus, ChevronRight, Loader2, Award, Zap } from 'lucide-react';

export default function ConsumerResearchPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [newSession, setNewSession] = useState({
    session_title: '',
    panelist_count: 5,
    sample_ids: '',
    test_criteria: ['Taste', 'Texture', 'Aroma', 'Appearance']
  });

  const supabase = createClient();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    const { data } = await supabase.from('taste_panels').select('*').order('created_at', { ascending: false });
    setSessions(data || []);
    setLoading(false);
  };

  const calculateScore = (scores) => {
    if (!scores || scores.length === 0) return 0;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return avg.toFixed(1);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase font-mono italic">Consumer Insights</h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Sensory Validation & Taste Panel Data</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-6 py-3 bg-amber-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-900/10 hover:bg-amber-600 transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-2" /> New Panel Session
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-amber-500" /></div>
        ) : sessions.length === 0 ? (
          <div className="col-span-full p-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 italic text-slate-400">No panel data recorded. Create a sensory session to begin collecting consumer feedback.</div>
        ) : sessions.map(s => (
          <div key={s.id} className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
             <div className="flex items-center justify-between mb-6">
                <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-1">
                   <Users className="w-3 h-3"/> {s.panelist_count} Panelists
                </span>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(s.created_at).toLocaleDateString()}</p>
             </div>
             <h3 className="text-xl font-black text-slate-800 mb-1">{s.session_title}</h3>
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{s.sample_ids || 'V1 / V2 / V3 Comparison'}</p>
             
             <div className="flex items-end justify-between">
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1">Composite Score</p>
                   <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-black italic tracking-tighter ${s.avg_score >= 7.0 ? 'text-emerald-600' : 'text-rose-600'}`}>{s.avg_score || '—'}</span>
                      <span className="text-xs font-bold text-slate-300">/ 10</span>
                   </div>
                </div>
                {s.avg_score >= 7.0 ? (
                   <span className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Award className="w-6 h-6"/></span>
                ) : (
                   <span className="p-3 bg-slate-50 text-slate-300 rounded-2xl"><Zap className="w-6 h-6"/></span>
                )}
             </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in duration-200 overflow-hidden">
             <div className="p-10">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight italic">Panel Setup</h2>
                <p className="text-xs font-black text-amber-500 uppercase tracking-widest mt-1">Initialize Sensory Data Capture</p>
                
                <form className="mt-8 space-y-6">
                   <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Session Target</label>
                      <input placeholder="e.g. Kavuni Pro v3.1 Blind Test" className="w-full px-5 py-4 bg-slate-50 rounded-2xl font-bold text-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-amber-500 transition-all outline-none" />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Panelist Count</label>
                         <input type="number" defaultValue="5" className="w-full px-5 py-4 bg-slate-50 rounded-2xl font-bold text-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-amber-500 transition-all outline-none" />
                      </div>
                      <div>
                         <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Test Criteria</label>
                         <div className="flex flex-wrap gap-2">
                            {['Taste', 'Texture', 'Smell'].map(c => (
                               <span key={c} className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-black uppercase tracking-widest">{c}</span>
                            ))}
                         </div>
                      </div>
                   </div>
                   <div className="pt-4 flex gap-3">
                      <button type="button" onClick={() => setShowNew(false)} className="flex-1 py-4 bg-slate-100 text-slate-400 font-black uppercase tracking-widest text-[10px] rounded-2xl">Cancel</button>
                      <button className="flex-[2] py-4 bg-amber-500 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-amber-900/20 active:scale-95 transition-all">Start Session</button>
                   </div>
                </form>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
