'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Beaker, Plus, History, ChevronRight, Loader2, Save, X, FlaskConical, GitCompare } from 'lucide-react';
import FormulaDiff from '@/components/science/FormulaDiff';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

export default function FormulationsPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [formulations, setFormulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [newForm, setNewForm] = useState({ code: '', name: '', ingredients: [], notes: '', base_version_id: null });
  
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedQty, setSelectedQty] = useState('');
  const [compareIds, setCompareIds] = useState([]);
  const [fetchError, setFetchError] = useState(null);

  const supabase = useMemo(() => createClient(), []);


  useEffect(() => {
    fetchFormulations(); fetchInventoryItems();
  }, []);

  const fetchInventoryItems = async () => {
    try {
      const { data, error } = await supabase.from('inventory_items').select('id, name, unit').order('name');
      if (error) throw error;
      setItems(data || []);
    } catch (err) { 
      setFetchError("Failed to load ingredients dropdown list.");
      console.error('Fetch items error:', err); 
    }
  };

  const addIngredient = () => {
    if (!selectedItem || !selectedQty) return;
    const qtyValue = parseFloat(selectedQty);
    if (isNaN(qtyValue) || qtyValue <= 0) {
      return alert("Quantity must be a number greater than 0");
    }
    const item = items.find(i => i.id === selectedItem);
    if (!item) return;

    // Deduplication Guard
    if (newForm.ingredients.some(ing => ing.item_id === item.id)) {
      return alert(`"${item.name}" is already in the recipe. Remove it from the list to modify quantity.`);
    }

    setNewForm(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { item_id: item.id, name: item.name, quantity: qtyValue, unit: item.unit }]
    }));
    setSelectedItem(''); setSelectedQty('');
  };

  const fetchFormulations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('formulations').select('*').order('created_at', { ascending: false });
      if (!error) setFormulations(data || []);
    } catch (err) { console.error('Fetch formulations error:', err); }
    finally { setLoading(false); }
  };


  const handleForwardRevision = (f) => {
    let parsedIng = [];
    try { parsedIng = JSON.parse(f.ingredients); } catch(e) { parsedIng = []; }
    setNewForm({
      code: f.code,
      name: f.name,
      ingredients: parsedIng,
      notes: '',
      base_version_id: f.id
    });
    setShowNew(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newForm.ingredients.length === 0) return alert("Add at least one ingredient.");
    setSubmitting(true);
    try {
      // Stringify ingredients for storage if the column is TEXT, or pass as array if it's JSONB
      // master_sync.sql created it as TEXT for backwards compatibility, but let's treat it as a stringified array.
      const res = await fetch('/api/formulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newForm, ingredients: JSON.stringify(newForm.ingredients) })
      });
      if (res.ok) {
        setShowNew(false);
        setNewForm({ code: '', name: '', ingredients: [], notes: '', base_version_id: null });
        fetchFormulations();
      } else { 
        const errData = await res.json();
        alert(`Failed to submit formulation: ${errData.error || 'Unknown error'}`); 
      }
    } catch (err) { alert('Network Error: ' + err.message); }
    finally { setSubmitting(false); }
  };


  if (authLoading || (loading && formulations.length === 0)) {
    return (
      <div className="page-container space-y-8">
        <div className="flex justify-between items-center"><Skeleton width={250} height={32}/> <Skeleton width={180} height={40}/></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl"/>)}
        </div>
      </div>
    );
  }
  if (!employeeProfile) return null;

  return (
    <div className="page-container text-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Recipe Management</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Scientific Formula Registry & Version Control</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> New Recipe Version
        </button>
      </div>

      {/* Innovation 4: Formula Diff Display */}
      {compareIds.length === 2 && (
        <div className="max-w-xl mx-auto mb-8 relative">
           <button onClick={() => setCompareIds([])} className="absolute -top-3 -right-3 bg-white border border-gray-200 rounded-full p-1 shadow-md z-10 hover:text-red-500"><X className="w-4 h-4"/></button>
           <FormulaDiff 
             v1={formulations.find(f => f.id === compareIds[0])} 
             v2={formulations.find(f => f.id === compareIds[1])} 
           />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {loading ? (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6">
             {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl"/>)}
          </div>
        ) : formulations.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 text-sm font-medium text-gray-400">No scientific recipes registered. Add a formulation to begin batch linkage.</div>
        ) : (
          <AnimatePresence mode="popLayout">
            {formulations.map((f, i) => {
              let parsedIng = [];
              try { parsedIng = JSON.parse(f.ingredients); } catch(e) { parsedIng = []; }
              return (
                <motion.div 
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="surface p-6 hover:shadow-md transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><FlaskConical className="w-20 h-20 text-navy"/></div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="px-2 py-0.5 bg-blue-50 text-navy rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">V{f.version}</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{new Date(f.created_at).toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{f.name}</h3>
                    <p className="text-xs font-bold text-navy mb-4 font-mono">{f.code}</p>
                    <div className="space-y-4">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Key Components</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {parsedIng.length > 0 ? parsedIng.map((ing, idx) => (
                            <span key={idx} className="bg-white px-2 py-0.5 border border-slate-200 rounded text-[10px] font-bold text-slate-700">
                              {ing.name}: {ing.quantity}{ing.unit}
                            </span>
                          )) : <p className="text-xs font-semibold text-gray-400 italic">No components linked.</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => setCompareIds(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id].slice(-2))}
                          className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 ${
                            compareIds.includes(f.id) ? 'bg-navy text-white border-navy' : 'bg-white text-gray-400 border-gray-200 hover:border-navy hover:text-navy'
                          }`}
                        >
                          <GitCompare className="w-3.5 h-3.5"/>
                          {compareIds.includes(f.id) ? 'Selected' : 'Compare'}
                        </button>
                        <button 
                          onClick={() => handleForwardRevision(f)}
                          className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-white text-navy border-navy/20 hover:bg-navy/5 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5"/> Revision
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowNew(false)} className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 transition-all"><X className="w-5 h-5 text-gray-400"/></button>
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">New Formulation Version</h2>
              <p className="text-xs font-medium text-gray-500 mt-1">
                {newForm.base_version_id ? (
                  <span className="text-emerald-600 font-bold">Iterating from base version selection</span>
                ) : 'Immutable Recipe Entry'}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Recipe Code</label>
                  <input required type="text" placeholder="e.g. F011" value={newForm.code} onChange={e => setNewForm({...newForm, code: e.target.value})} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Common Name</label>
                  <input required type="text" placeholder="e.g. Agri-Boost" value={newForm.name} onChange={e => setNewForm({...newForm, name: e.target.value})} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all" />
                </div>
              </div>

              {fetchError && <div className="p-2 bg-red-50 text-red-600 font-bold text-[10px] rounded-lg border border-red-100 mb-2">{fetchError}</div>}

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Structured Bill of Materials (BOM)</label>
                <div className="flex gap-2 mb-3">
                  <select className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold" value={selectedItem} onChange={e => setSelectedItem(e.target.value)}>
                    <option value="">Select Ingredient...</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                  <input type="number" placeholder="Qty" className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold" value={selectedQty} onChange={e => setSelectedQty(e.target.value)}/>
                  <button type="button" onClick={addIngredient} className="p-2 bg-navy text-white rounded-lg hover:bg-navy-hover transition-all"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {newForm.ingredients.map((ing, idx) => (
                    <span key={idx} className="flex items-center gap-1.5 bg-white px-2 py-1 border border-gray-200 rounded-md text-[10px] font-black text-slate-700 shadow-sm animate-in fade-in slide-in-from-left-2 transition-all">
                      {ing.name}: {ing.quantity}{ing.unit}
                      <button type="button" onClick={() => setNewForm(p => ({...p, ingredients: p.ingredients.filter((_, i) => i !== idx)})) } className="text-red-400 hover:text-red-600 transition-colors"><X className="w-3 h-3"/></button>
                    </span>
                  ))}
                  {newForm.ingredients.length === 0 && <p className="text-[10px] text-gray-400 italic">No ingredients added yet.</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Scientific Notes / Rationale</label>
                <textarea rows="2" placeholder="Reason for this version or iteration..." value={newForm.notes} onChange={e => setNewForm({...newForm, notes: e.target.value})} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all resize-none" />
              </div>
              <button disabled={submitting} type="submit" className="w-full py-2.5 bg-navy text-white font-bold rounded-lg shadow-sm hover:bg-navy-hover transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Register Recipe Version'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
