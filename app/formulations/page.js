'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Beaker, Plus, History, ChevronRight, Loader2, Save, X, FlaskConical } from 'lucide-react';

export default function FormulationsPage() {
  const { role, employeeProfile } = useAuth();
  const [formulations, setFormulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newForm, setNewForm] = useState({ code: '', name: '', ingredients: '', notes: '' });
  
  const supabase = createClient();

  useEffect(() => {
    fetchFormulations();
  }, []);

  const fetchFormulations = async () => {
    setLoading(true);
    const { data } = await supabase.from('formulations').select('*').order('created_at', { ascending: false });
    setFormulations(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/formulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm)
    });
    if (res.ok) {
      setShowNew(false);
      setNewForm({ code: '', name: '', ingredients: '', notes: '' });
      fetchFormulations();
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-teal-950 tracking-tighter uppercase font-mono italic">Formulation Registry</h1>
          <p className="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">Scientific Version Control System (SVCS)</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-6 py-3 bg-teal-800 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-teal-900/20 hover:bg-teal-950 transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-2" /> New Recipe Version
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-teal-800" /></div>
        ) : formulations.length === 0 ? (
          <div className="col-span-full p-20 text-center bg-white rounded-3xl border-2 border-dashed border-gray-100 italic text-gray-400">No scientific recipes registered. Add a formulation to begin batch linkage.</div>
        ) : formulations.map(f => (
          <div key={f.id} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><FlaskConical className="w-20 h-20"/></div>
            <div className="flex justify-between items-start mb-4">
              <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-black uppercase tracking-widest border border-teal-100">V{f.version}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(f.created_at).toLocaleDateString()}</span>
            </div>
            <h3 className="text-xl font-black text-teal-950 mb-1">{f.name}</h3>
            <p className="text-xs font-bold text-teal-600 mb-4 font-mono">{f.code}</p>
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Key Components</p>
                <p className="text-xs font-bold text-gray-600 line-clamp-2">{f.ingredients || 'No ingredients listed'}</p>
              </div>
              <button disabled className="w-full py-3 bg-white border border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400 rounded-xl flex items-center justify-center gap-2 group-hover:text-teal-800 group-hover:border-teal-100 transition-all cursor-not-allowed">
                <History className="w-3 h-3" /> View Change-Log
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-teal-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setShowNew(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-all"><X className="w-5 h-5 text-gray-400"/></button>
            <div className="p-8 pb-0">
              <h2 className="text-2xl font-black text-teal-950 tracking-tight">New Formulation Version</h2>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Immutable Recipe Entry</p>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Recipe Code</label>
                  <input required type="text" placeholder="e.g. F011" value={newForm.code} onChange={e => setNewForm({...newForm, code: e.target.value})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-800 transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Common Name</label>
                  <input required type="text" placeholder="e.g. Agri-Boost" value={newForm.name} onChange={e => setNewForm({...newForm, name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-800 transition-all outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Critical Ingredients & Ratios</label>
                <textarea required rows="3" placeholder="List components per unit volume..." value={newForm.ingredients} onChange={e => setNewForm({...newForm, ingredients: e.target.value})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-800 transition-all outline-none resize-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Scientific Notes / Rationale</label>
                <textarea rows="2" placeholder="Reason for this version or iteration..." value={newForm.notes} onChange={e => setNewForm({...newForm, notes: e.target.value})} className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-teal-800 transition-all outline-none resize-none" />
              </div>
              <button disabled={submitting} type="submit" className="w-full py-4 bg-teal-800 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-teal-900/20 hover:bg-teal-900 transition-all active:scale-95 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Register Recipe Version'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
