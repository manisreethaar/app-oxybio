'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { 
  Beaker, Plus, History, ChevronRight, Loader2, Save, X, FlaskConical, 
  GitCompare, CheckCircle2, Clock, Send, ShieldCheck, XCircle, AlertTriangle, Trash2
} from 'lucide-react';
import FormulaDiff from '@/components/science/FormulaDiff';
import Skeleton from '@/components/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

// Status config
const STATUS_CONFIG = {
  'Draft':     { label: 'Draft',       color: 'bg-gray-100 text-gray-600 border-gray-200',       dot: 'bg-gray-400' },
  'In Review': { label: 'In Review',   color: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-400' },
  'Approved':  { label: 'Approved',    color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  'Archived':  { label: 'Archived',    color: 'bg-slate-100 text-slate-400 border-slate-200',    dot: 'bg-slate-400' },
  // Legacy values
  'active':    { label: 'Draft',       color: 'bg-gray-100 text-gray-600 border-gray-200',       dot: 'bg-gray-400' },
  'archived':  { label: 'Archived',    color: 'bg-slate-100 text-slate-400 border-slate-200',    dot: 'bg-slate-400' },
};

const APPROVER_ROLES = ['admin', 'ceo', 'cto'];

export default function FormulationsPage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [formulations, setFormulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // id of recipe being actioned
  const [items, setItems] = useState([]);
  const [newForm, setNewForm] = useState({ code: '', name: '', ingredients: [], notes: '', base_version_id: null });
  
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedQty, setSelectedQty] = useState('');
  const [compareIds, setCompareIds] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [scaleFactors, setScaleFactors] = useState({});
  const [statusFilter, setStatusFilter] = useState('All');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null); // replaces window.confirm

  const supabase = useMemo(() => createClient(), []);
  const isApprover = APPROVER_ROLES.includes(role?.toLowerCase());

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
    }
  };

  const addIngredient = () => {
    if (!selectedItem || !selectedQty) return;
    const qtyValue = parseFloat(selectedQty);
    if (isNaN(qtyValue) || qtyValue <= 0) { toast.warn("Quantity must be a number greater than 0"); return; }
    const item = items.find(i => i.id === selectedItem);
    if (!item) return;
    if (newForm.ingredients.some(ing => ing.item_id === item.id)) {
      toast.warn(`"${item.name}" is already in the recipe.`); return;
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
      const { data, error } = await supabase
        .from('formulations')
        .select('*, approver:employees!formulations_approved_by_fkey(full_name)')
        .neq('status', 'Archived')
        .order('created_at', { ascending: false });
      if (!error) setFormulations(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleForwardRevision = (f) => {
    let parsedIng = [];
    try { parsedIng = typeof f.ingredients === 'string' ? JSON.parse(f.ingredients) : (f.ingredients || []); } catch(e) { parsedIng = []; }
    setNewForm({ code: f.code, name: f.name, ingredients: parsedIng, notes: '', base_version_id: f.id });
    setShowNew(true);
  };

  const handleStatusChange = async (id, newStatus, reason) => {
    if (newStatus === 'Draft' && isApprover && !rejectingId) {
        // This is a "Recall" or a "Reject" trigger from an approver
        setRejectingId(id);
        return;
    }
    
    if (newStatus === 'Draft' && isApprover && rejectingId) {
        if (!reason || reason.trim().length < 5) {
            toast.warn("Please provide a mandatory rejection reason (min 5 chars).");
            return;
        }
    }

    setActionLoading(id);
    try {
      const res = await fetch('/api/formulations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, rejection_reason: reason })
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Action failed'); return; }

      setRejectingId(null);
      setRejectionReason('');
      setFormulations(prev => prev.map(f => f.id === id ? { ...f, ...data } : f));
    } catch (err) { toast.error('Network Error'); }
    finally { setActionLoading(null); }
  };

  const handleDeleteRecipe = async (id) => {
    // Fix: window.confirm() is silently blocked in PWA/standalone mode and some browsers.
    // Use state-driven inline confirmation instead.
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id); // shows inline confirm strip
      return;
    }
    // User confirmed
    setPendingDeleteId(null);
    setActionLoading(id);
    try {
      const res = await fetch(`/api/formulations?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFormulations(prev => prev.filter(f => f.id !== id));
        toast.success('Recipe deleted.');
      } else {
        const errData = await res.json();
        toast.error(`Delete failed: ${errData.error || 'Unknown error'}`);
      }
    } catch (err) { toast.error('Network Error'); }
    finally { setActionLoading(null); }
  };

  const handleEditRecipe = (f) => {
    let parsedIng = [];
    try { parsedIng = typeof f.ingredients === 'string' ? JSON.parse(f.ingredients) : (f.ingredients || []); } catch(e) { parsedIng = []; }
    setNewForm({ id: f.id, code: f.code, name: f.name, ingredients: parsedIng, notes: f.notes || '', base_version_id: f.base_version_id });
    setShowNew(true);
  };

  const handleArchive = (id) => {
    if (!confirm("Archive this formulation? It will be hidden.")) return;
    handleStatusChange(id, 'Archived');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newForm.ingredients.length === 0) { toast.warn("Add at least one ingredient."); return; }
    if (newForm.base_version_id && !newForm.notes?.trim()) {
      toast.warn("Notes explaining the reason for this revision are mandatory."); return;
    }
    setSubmitting(true);
    try {
      const isEdit = !!newForm.id;
      const res = await fetch('/api/formulations', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...newForm, 
          ingredients: typeof newForm.ingredients === 'string' 
            ? newForm.ingredients 
            : JSON.stringify(newForm.ingredients) 
        })
      });
      if (res.ok) {
        setShowNew(false);
        setNewForm({ id: null, code: '', name: '', ingredients: [], notes: '', base_version_id: null });
        fetchFormulations();
      } else { 
        const errData = await res.json();
        toast.error(`Failed: ${errData.error || 'Unknown error'}`);
      }
    } catch (err) { toast.error('Network Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  // Pending approvals visible to approvers
  const pendingReview = formulations.filter(f => f.status === 'In Review');

  const filteredFormulations = statusFilter === 'All'
    ? formulations
    : formulations.filter(f => {
        const s = f.status === 'active' ? 'Draft' : f.status;
        return s === statusFilter;
      });

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

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Recipe Management</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Scientific Formula Registry & Version Control</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> New Recipe
        </button>
      </div>

      {/* Pending Approval Banner — shown to approvers only */}
      {isApprover && pendingReview.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-amber-800">{pendingReview.length} recipe{pendingReview.length > 1 ? 's' : ''} pending your approval</p>
            <p className="text-xs text-amber-600 mt-0.5">Review and approve below to unlock batch production.</p>
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {['All', 'Draft', 'In Review', 'Approved'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
              statusFilter === s 
                ? 'bg-navy text-white border-navy' 
                : 'bg-white text-gray-500 border-gray-200 hover:border-navy hover:text-navy'
            }`}
          >
            {s}
            {s === 'In Review' && pendingReview.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{pendingReview.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Formula Diff */}
      {compareIds.length === 2 && (
        <div className="max-w-xl mx-auto relative">
           <button onClick={() => setCompareIds([])} className="absolute -top-3 -right-3 bg-white border border-gray-200 rounded-full p-1 shadow-md z-10 hover:text-red-500"><X className="w-4 h-4"/></button>
           <FormulaDiff 
             v1={formulations.find(f => f.id === compareIds[0])} 
             v2={formulations.find(f => f.id === compareIds[1])} 
           />
        </div>
      )}

      {/* Recipe Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6">
             {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl"/>)}
          </div>
        ) : filteredFormulations.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 text-sm font-medium text-gray-400">
            {statusFilter === 'All' ? 'No recipes registered yet.' : `No recipes with status "${statusFilter}".`}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredFormulations.map((f, i) => {
              let parsedIng = [];
              try { parsedIng = typeof f.ingredients === 'string' ? JSON.parse(f.ingredients) : (f.ingredients || []); } catch(e) { parsedIng = []; }
              const statusKey = f.status in STATUS_CONFIG ? f.status : 'Draft';
              const statusCfg = STATUS_CONFIG[statusKey];
              const isLoading = actionLoading === f.id;

              return (
                <motion.div 
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="surface p-6 hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><FlaskConical className="w-20 h-20 text-navy"/></div>
                    
                    {/* Top row: version + status badge */}
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-navy rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">V{f.version}</span>
                      <div className="flex items-center gap-1">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusCfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`}/>
                          {statusCfg.label}
                        </span>
                        {/* Edit + Delete icons for Draft and In Review (approvers only for In Review) */}
                        {/* Delete also available for Approved — approvers can delete approved recipes */}
                        {(f.status === 'Draft' || f.status === 'active' || (f.status === 'In Review' && isApprover) || (f.status === 'Approved' && isApprover)) && (
                           <div className="flex gap-1 ml-1">
                              {/* Edit: author can edit their own Draft; admin can edit any Draft or In Review */}
                              {(f.status === 'Draft' || f.status === 'active' || isApprover) && (
                                <button onClick={() => handleEditRecipe(f)} className="p-1 rounded bg-gray-100 text-gray-400 hover:text-navy hover:bg-gray-200 transition-all" title="Edit Recipe">
                                  <Plus className="w-3 h-3 rotate-45"/>
                                </button>
                              )}
                              {/* Delete: only for Draft/In Review - not Approved */}
                              <button onClick={() => handleDeleteRecipe(f.id)} className="p-1 rounded bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete Recipe">
                                <Trash2 className="w-3 h-3"/>
                              </button>
                           </div>
                        )}
                      </div>
                      {/* Inline delete confirm strip — replaces window.confirm() */}
                      {pendingDeleteId === f.id && (
                        <div className="flex items-center gap-2 mt-1 p-2 bg-red-50 border border-red-200 rounded-lg animate-in fade-in duration-150">
                          <span className="text-[10px] font-bold text-red-700 flex-1">Permanently delete this recipe?</span>
                          <button
                            onClick={() => handleDeleteRecipe(f.id)}
                            className="px-2 py-1 bg-red-600 text-white text-[10px] font-black rounded hover:bg-red-700"
                          >Yes, Delete</button>
                          <button
                            onClick={() => setPendingDeleteId(null)}
                            className="px-2 py-1 bg-white border border-gray-200 text-gray-500 text-[10px] font-black rounded hover:bg-gray-50"
                          >Cancel</button>
                        </div>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 mb-0.5">{f.name}</h3>
                    <p className="text-xs font-bold text-navy mb-3 font-mono">{f.code}</p>

                    {/* Ingredients */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Ingredients</p>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-gray-400">Scale:</span>
                          <input type="number" value={scaleFactors[f.id] || 1} onChange={e => setScaleFactors({...scaleFactors, [f.id]: parseFloat(e.target.value) || 1})} step="0.5" min="0.5" className="w-10 px-1 py-0.5 text-center border border-gray-200 rounded bg-white text-[10px] font-black"/>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {parsedIng.length > 0 ? parsedIng.map((ing, idx) => (
                          <span key={idx} className="bg-white px-2 py-0.5 border border-slate-200 rounded text-[10px] font-bold text-slate-700">
                            {ing.name}: {((parseFloat(ing.quantity) || 0) * (scaleFactors[f.id] || 1)).toFixed(1)}{ing.unit}
                          </span>
                        )) : <p className="text-xs font-semibold text-gray-400 italic">No components linked.</p>}
                      </div>
                    </div>

                    {/* Approved by info */}
                    {f.status === 'Approved' && f.approver && (
                      <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0"/>
                        <p className="text-[10px] font-bold text-emerald-700">
                          Approved by {f.approver.full_name} · {f.approved_at ? new Date(f.approved_at).toLocaleDateString() : ''}
                        </p>
                      </div>
                    )}

                    {f.notes && (
                      <p className="text-[10px] text-gray-400 italic mb-3 line-clamp-2">&quot;{f.notes}&quot;</p>
                    )}

                    {f.rejection_reason && f.status === 'Draft' && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Rejection Remark
                        </p>
                        <p className="text-[11px] text-red-700 font-medium italic">&quot;{f.rejection_reason}&quot;</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-auto space-y-2">
                      
                      {/* Compare + Revision row */}
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

                      {/* ── APPROVAL WORKFLOW BUTTONS ── */}

                      {/* Draft: Show "Submit for Review" */}
                      {(f.status === 'Draft' || f.status === 'active') && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusChange(f.id, 'In Review')}
                          className="w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5"/>}
                          Submit for Review
                        </button>
                      )}

                      {/* In Review: Approve (approvers only) + Recall/Reject (anyone/approvers) */}
                      {f.status === 'In Review' && (
                        <div className="grid grid-cols-2 gap-2">
                          {isApprover ? (
                            <>
                              <button
                                disabled={isLoading}
                                onClick={() => handleStatusChange(f.id, 'Approved')}
                                className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle2 className="w-3.5 h-3.5"/>}
                                Approve
                              </button>
                              <button
                                disabled={isLoading}
                                onClick={() => handleStatusChange(f.id, 'Draft')}
                                className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5"/> Reject
                              </button>
                            </>
                          ) : (
                            <button
                                disabled={isLoading}
                                onClick={() => handleStatusChange(f.id, 'Draft')}
                                className="col-span-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                <ArrowRight className="w-3.5 h-3.5 rotate-180"/> Recall to Draft
                            </button>
                          )}
                        </div>
                      )}

                      {/* Approved: Show Launch Batch + Archive option for approvers */}
                      {f.status === 'Approved' && (
                        <div className={`grid gap-2 ${isApprover ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          <Link 
                            href={`/batches?formula_code=${f.code}`} 
                            className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-emerald-600 text-white hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
                          >
                            Launch Batch
                          </Link>
                          {isApprover && (
                            <button
                              onClick={() => handleArchive(f.id)}
                              className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 bg-white text-gray-400 hover:text-red-500 hover:border-red-200 transition-all flex items-center justify-center"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      )}

                      {/* Non-approved: Show disabled Launch Batch as hint */}
                      {f.status !== 'Approved' && (
                        <div className="w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-dashed border-gray-200 text-center text-gray-300 cursor-not-allowed select-none">
                          Batch locked until Approved
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* New Recipe Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowNew(false)} className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 transition-all"><X className="w-5 h-5 text-gray-400"/></button>
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">{newForm.id ? 'Edit Formulation Details' : 'New Formulation Version'}</h2>
              <p className="text-xs font-medium text-gray-500 mt-1">
                {newForm.base_version_id ? (
                  <span className="text-emerald-600 font-bold">Iterating from base version — changes saved as new Draft</span>
                ) : 'New recipe will be saved as Draft for review'}
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

              {fetchError && <div className="p-2 bg-red-50 text-red-600 font-bold text-[10px] rounded-lg border border-red-100">{fetchError}</div>}

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Bill of Materials (BOM)</label>
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
                    <span key={idx} className="flex items-center gap-1.5 bg-white px-2 py-1 border border-gray-200 rounded-md text-[10px] font-black text-slate-700 shadow-sm">
                      {ing.name}: {ing.quantity}{ing.unit}
                      <button type="button" onClick={() => setNewForm(p => ({...p, ingredients: p.ingredients.filter((_, i) => i !== idx)}))} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                    </span>
                  ))}
                  {newForm.ingredients.length === 0 && <p className="text-[10px] text-gray-400 italic">No ingredients added yet.</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Scientific Notes / Rationale</label>
                <textarea rows="2" placeholder="Reason for this version or iteration..." value={newForm.notes} onChange={e => setNewForm({...newForm, notes: e.target.value})} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all resize-none" />
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2">
                <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/>
                <p className="text-[10px] font-bold text-blue-700">Recipe will be saved as <strong>Draft</strong>. Submit for Review → get it Approved → then launch batches.</p>
              </div>

              <button disabled={submitting} type="submit" className="w-full py-2.5 bg-navy text-white font-bold rounded-lg shadow-sm hover:bg-navy-hover transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Save className="w-4 h-4"/> Save as Draft</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Formulation</h3>
            <p className="text-xs text-gray-500 mb-4">You must provide a reason for sending this recipe back to Draft.</p>
            
            <textarea 
              autoFocus
              value={rejectionReason} 
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g. Yield calculation in Phase 2 seems incorrect..."
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium h-32 outline-none focus:ring-1 focus:ring-red-500 resize-none mb-4"
            />

            <div className="flex gap-3">
              <button 
                onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleStatusChange(rejectingId, 'Draft', rejectionReason)}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
