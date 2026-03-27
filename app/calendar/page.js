'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Calendar as CalendarIcon, Flag, Clock, CheckCircle2, AlertTriangle, Plus, ChevronRight, Loader2, Info } from 'lucide-react';

export default function RegulatoryCalendarPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset } = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(1, 'Title required'),
      category: z.string().min(1, 'Category required'),
      deadline: z.string().min(1, 'Deadline required')
    })),
    defaultValues: { title: '', category: 'Grant (SISFS/DPIIT)', deadline: '', status: 'Pending', priority: 'High' }
  });

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    fetchMilestones();
  }, []);

  const fetchMilestones = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('regulatory_milestones').select('*').order('deadline', { ascending: true });
      if (error) throw error;
      setMilestones(data || []);
    } catch (err) { console.error('Fetch milestones error:', err); }
    finally { setLoading(false); }
  };


  const handleSubmitForm = async (data) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add milestone');
      setShowNew(false); reset(); fetchMilestones();
    } catch (err) { alert(err.message); }
    finally { setSubmitting(false); }
  };


  if (authLoading) return <div className="flex justify-center items-center h-full min-h-[50vh]"><Loader2 className="w-10 h-10 animate-spin text-navy" /></div>;
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Compliance Calendar</h2>
          <p className="text-sm font-medium text-gray-500 mt-1">Institutional Grants & Regulatory Filings</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> Add Milestone
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-navy" /></div>
        ) : milestones.length === 0 ? (
          <div className="py-16 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm font-medium text-gray-400">No active milestones. Add SISFS, DPIIT, or FSSAI deadlines to begin institutional tracking.</div>
        ) : milestones.map(m => (
          <div key={m.id} className="surface p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-all group">
            <div className="flex items-center gap-6 flex-1">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${m.status === 'Completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-navy'}`}>
                {m.status === 'Completed' ? <CheckCircle2 className="w-6 h-6"/> : <CalendarIcon className="w-6 h-6"/>}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${m.category === 'Grant (SISFS/DPIIT)' ? 'bg-blue-50 text-navy' : 'bg-gray-50 text-gray-600'}`}>{m.category}</span>
                  {m.priority === 'High' && <span className="flex items-center text-[10px] font-bold text-red-600 uppercase tracking-wider"><AlertTriangle className="w-3 h-3 mr-1"/> Critical</span>}
                </div>
                <h3 className="text-lg font-bold text-gray-900">{m.title}</h3>
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-2 mt-1">
                  <Clock className="w-3.5 h-3.5"/> Pipeline Status: <span className="text-gray-700">{m.status}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-10">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Deadline</p>
                <p className={`text-sm font-semibold ${new Date(m.deadline) < new Date() && m.status !== 'Completed' ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                  {new Date(m.deadline).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
             <div className="p-6 pb-28">
               <div className="flex justify-between items-start">
                <div>
                   <h2 className="text-lg font-bold text-gray-900 tracking-tight">New Compliance Event</h2>
                   <p className="text-xs font-medium text-gray-500 mt-1">Institutional Deadline Logger</p>
                </div>
                <button type="button" onClick={() => setShowNew(false)} className="text-gray-400 hover:bg-gray-100 rounded-md p-1 transition-all"><Plus className="w-5 h-5 rotate-45"/></button>
               </div>
             <form onSubmit={handleSubmit(handleSubmitForm)} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Event Title</label>
                  <input placeholder="e.g. SISFS Phase 2 Submission" {...register('title')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Category</label>
                    <select {...register('category')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all">
                      <option>Grant (SISFS/DPIIT)</option>
                      <option>Regulatory (FSSAI/GST)</option>
                      <option>Internal Audit</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Deadline Date</label>
                    <input type="date" {...register('deadline')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowNew(false); reset(); }} className="flex-1 py-2.5 bg-gray-100 text-gray-500 font-bold uppercase tracking-wider text-xs rounded-lg hover:bg-gray-200 transition-all">Cancel</button>
                  <button disabled={submitting} type="submit" className="flex-[2] py-2.5 bg-navy text-white font-bold uppercase tracking-wider text-[10px] rounded-lg shadow-sm hover:bg-navy-hover transition-all active:scale-95 flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Commit to Pipeline'}
                  </button>
                </div>
             </form>
           </div>
          </div>
        </div>
      )}
    </div>
  );
}
