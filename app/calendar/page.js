'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Calendar as CalendarIcon, Flag, Clock, CheckCircle2, AlertTriangle, Plus, ChevronRight, Loader2, Info } from 'lucide-react';

export default function RegulatoryCalendarPage() {
  const { role } = useAuth();
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    category: 'Grant (SISFS/DPIIT)',
    deadline: '',
    status: 'Pending',
    priority: 'High'
  });

  const supabase = createClient();

  useEffect(() => {
    fetchMilestones();
  }, []);

  const fetchMilestones = async () => {
    setLoading(true);
    const { data } = await supabase.from('regulatory_milestones').select('*').order('deadline', { ascending: true });
    setMilestones(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from('regulatory_milestones').insert(newMilestone);
    if (!error) {
      setShowNew(false);
      setNewMilestone({ title: '', category: 'Grant (SISFS/DPIIT)', deadline: '', status: 'Pending', priority: 'High' });
      fetchMilestones();
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase font-mono italic">Compliance Calendar</h2>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Institutional Grants & Regulatory Filings</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-6 py-3 bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-900/20 hover:bg-rose-700 transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-2" /> Add Milestone
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-rose-600" /></div>
        ) : milestones.length === 0 ? (
          <div className="p-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 italic text-slate-400">No active milestones. Add SISFS, DPIIT, or FSSAI deadlines to begin institutional tracking.</div>
        ) : milestones.map(m => (
          <div key={m.id} className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-all group">
            <div className="flex items-center gap-6 flex-1">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all ${m.status === 'Completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                {m.status === 'Completed' ? <CheckCircle2 className="w-6 h-6"/> : <CalendarIcon className="w-6 h-6"/>}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${m.category === 'Grant (SISFS/DPIIT)' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>{m.category}</span>
                  {m.priority === 'High' && <span className="flex items-center text-[10px] font-black text-rose-600 uppercase tracking-widest"><AlertTriangle className="w-3 h-3 mr-1"/> Critical</span>}
                </div>
                <h3 className="text-lg font-black text-slate-800">{m.title}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-1">
                  <Clock className="w-3.5 h-3.5"/> Pipeline Status: <span className="text-slate-600 underline underline-offset-4 decoration-slate-200">{m.status}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-10">
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1">Deadline</p>
                <p className={`text-sm font-black italic ${new Date(m.deadline) < new Date() && m.status !== 'Completed' ? 'text-rose-600 animate-pulse' : 'text-slate-800'}`}>
                  {new Date(m.deadline).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-rose-400 transition-colors"/>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in duration-200 overflow-hidden">
             <div className="bg-rose-600 p-8 text-white flex justify-between items-center">
               <div>
                  <h2 className="text-2xl font-black tracking-tight italic">New Compliance Event</h2>
                  <p className="text-xs font-bold text-rose-200 uppercase tracking-widest mt-1">Institutional Deadline Logger</p>
               </div>
               <button onClick={() => setShowNew(false)} className="p-2 bg-rose-500 rounded-full hover:bg-rose-400"><Plus className="w-5 h-5 rotate-45"/></button>
             </div>
             <form onSubmit={handleSubmit} className="p-10 space-y-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Event Title</label>
                  <input required placeholder="e.g. SISFS Phase 2 Submission" value={newMilestone.title} onChange={e => setNewMilestone({...newMilestone, title: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-xl font-bold text-sm border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-rose-600 transition-all outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Category</label>
                    <select value={newMilestone.category} onChange={e => setNewMilestone({...newMilestone, category: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-xl font-bold text-sm border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-rose-600 transition-all outline-none">
                      <option>Grant (SISFS/DPIIT)</option>
                      <option>Regulatory (FSSAI/GST)</option>
                      <option>Internal Audit</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Deadline Date</label>
                    <input required type="date" value={newMilestone.deadline} onChange={e => setNewMilestone({...newMilestone, deadline: e.target.value})} className="w-full px-5 py-4 bg-slate-50 rounded-xl font-bold text-sm border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-rose-600 transition-all outline-none" />
                  </div>
                </div>
                <button disabled={submitting} type="submit" className="w-full py-4 mt-4 bg-rose-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-rose-900/20 hover:bg-rose-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Commit to Pipeline'}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
