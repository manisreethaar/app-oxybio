'use client';
import { useState, useEffect, useMemo } from 'react';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { 
  Beaker, Plus, History, ChevronRight, Loader2, Save, X, FlaskConical, 
  GitCompare, CheckCircle2, Clock, Send, ShieldCheck, XCircle, AlertTriangle, Trash2, ArrowRight,
  Search, ArrowUpDown, ArrowDownAZ, ArrowUpAZ, CalendarDays
} from 'lucide-react';
import FormulaDiff from '@/components/science/FormulaDiff';
import Skeleton from '@/components/Skeleton';
import CreatorBadge from '@/components/ui/CreatorBadge';
import EditRequestButton from '@/components/ui/EditRequestButton';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import RecipeFormModal from './components/RecipeFormModal';
import ConfirmDialogs from './components/ConfirmDialogs';

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
  const [newForm, setNewForm] = useState({ code: '', name: '', ingredients: [], notes: '', base_version_id: null, category: 'Fermentation', base_volume_ml: 1000 });
  
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedQty, setSelectedQty] = useState('');
  const [compareIds, setCompareIds] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [scaleFactors, setScaleFactors] = useState({});
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null); // replaces window.confirm
  const [pendingArchiveId, setPendingArchiveId] = useState(null);
  const [batchCounts, setBatchCounts] = useState({});
  const [expandedBatchHistory, setExpandedBatchHistory] = useState(null);
  const [batchHistory, setBatchHistory] = useState({});
  const [pendingIds, setPendingIds] = useState(new Set());

  const supabase = useMemo(() => createClient(), []);
  const isApprover = APPROVER_ROLES.includes(role?.toLowerCase());

  const fetchPendingIds = async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  };

  useEffect(() => {
    fetchFormulations(); fetchInventoryItems(); fetchPendingIds();

    // Subscribe to realtime formulation updates to prevent stale statuses (e.g. Approved vs In Review)
    const channel = supabase.channel('formulations_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'formulations' }, () => {
        fetchFormulations();
      })
      .subscribe();

    // Fallback: refresh on window focus in case realtime is disconnected or missing table publication
    const handleFocus = () => fetchFormulations();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchFormulations();
    });

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .select('*, approver:employees!formulations_approved_by_fkey(full_name), creator:employees!formulations_created_by_fkey(id, full_name, initials)')
        .neq('status', 'Archived')
        .order('created_at', { ascending: false });
      if (!error) setFormulations(data || []);
      if (!error && data?.length > 0) {
        const ids = data.map(f => f.id);
        const { data: batchData } = await supabase
          .from('batches')
          .select('formulation_id')
          .in('formulation_id', ids);
        const counts = {};
        (batchData || []).forEach(b => {
          counts[b.formulation_id] = (counts[b.formulation_id] || 0) + 1;
        });
        setBatchCounts(counts);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchBatchHistory = async (formulationId) => {
    const { data } = await supabase
      .from('batches')
      .select('id, batch_id, status, experiment_type, start_time, current_stage')
      .eq('formulation_id', formulationId)
      .order('created_at', { ascending: false })
      .limit(10);
    setBatchHistory(prev => ({ ...prev, [formulationId]: data || [] }));
  };

  const handleForwardRevision = (f) => {
    let parsedIng = [];
    try { parsedIng = typeof f.ingredients === 'string' ? JSON.parse(f.ingredients) : (f.ingredients || []); } catch(e) { parsedIng = []; }
    setNewForm({ code: f.code, name: f.name, ingredients: parsedIng, notes: '', base_version_id: f.id, category: f.category || 'Fermentation', base_volume_ml: f.base_volume_ml || 1000 });
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
    setNewForm({ id: f.id, code: f.code, name: f.name, ingredients: parsedIng, notes: f.notes || '', base_version_id: f.base_version_id, category: f.category || 'Fermentation', base_volume_ml: f.base_volume_ml || 1000 });
    setShowNew(true);
  };

  const handleOpenNewRecipe = async () => {
    // Auto-suggest next R-code based on existing formulations
    const { data } = await supabase.from('formulations').select('code');
    let maxNum = 0;
    (data || []).forEach(f => {
      const m = (f.code || '').match(/^R(\d+)$/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    const nextCode = `R${String(maxNum + 1).padStart(2, '0')}`;
    setNewForm({ code: nextCode, name: '', ingredients: [], notes: '', base_version_id: null, category: 'Fermentation', base_volume_ml: 1000 });
    setShowNew(true);
  };

  const handleArchive = (id) => {
    setPendingArchiveId(id);
  };

  const confirmArchive = () => {
    if (!pendingArchiveId) return;
    handleStatusChange(pendingArchiveId, 'Archived');
    setPendingArchiveId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate recipe code: 1â€“5 uppercase letters, optionally followed by up to 3 digits (R01, RKU, RKU01)
    const codeVal = (newForm.code || '').trim().toUpperCase();
    if (!/^[A-Z]{1,5}\d{0,3}$/.test(codeVal)) {
      toast.warn('Recipe code must be 1â€“5 uppercase letters optionally followed by up to 3 digits (e.g. R01, RKU, RKU01).'); return;
    }
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
        setNewForm({ id: null, code: '', name: '', ingredients: [], notes: '', base_version_id: null, category: 'Fermentation', base_volume_ml: 1000 });
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

  const filteredFormulations = formulations.filter(f => {
    const s = f.status === 'active' ? 'Draft' : f.status;
    const matchesStatus = statusFilter === 'All' || s === statusFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q || (f.name || '').toLowerCase().includes(q) || (f.code || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  }).sort((a, b) => {
    if (sortOrder === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (sortOrder === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sortOrder === 'name_desc') return (b.name || '').localeCompare(a.name || '');
    return 0;
  });

  if (loading && formulations.length === 0) {
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
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Recipe Management</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Scientific Formula Registry & Version Control</p>
        </div>
        <button onClick={handleOpenNewRecipe} className="flex items-center px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-1.5" /> New Recipe
        </button>
      </div>

      {/* Pending Approval Banner â€” shown to approvers only */}
      {isApprover && pendingReview.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-bold text-amber-800">{pendingReview.length} recipe{pendingReview.length > 1 ? 's' : ''} pending your approval</p>
            <p className="text-xs text-amber-600 mt-0.5">Review and approve below to unlock batch production.</p>
          </div>
        </div>
      )}

      {/* Controls: Search, Sort, Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by recipe name or code..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-navy focus:ring-1 focus:ring-navy transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4"/>
            </button>
          )}
        </div>

        {/* Sort & Filter */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {[
              { key: 'newest', label: 'Newest', Icon: CalendarDays },
              { key: 'oldest', label: 'Oldest', Icon: CalendarDays },
              { key: 'name_asc', label: 'A-Z', Icon: ArrowDownAZ },
              { key: 'name_desc', label: 'Z-A', Icon: ArrowUpAZ },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setSortOrder(key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sortOrder === key ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Icon className="w-3 h-3"/> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {['All', 'Draft', 'In Review', 'Approved'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  statusFilter === s 
                    ? 'bg-white text-navy shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s}
                {s === 'In Review' && pendingReview.length > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{pendingReview.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
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
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none"><FlaskConical className="w-20 h-20 text-navy"/></div>
                    
                    {/* Top row: version + status badge */}
                    <div className="flex justify-between items-start mb-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-navy rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">V{f.version}</span>
                      <div className="flex items-center gap-1">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusCfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`}/>
                          {statusCfg.label}
                        </span>
                        {/* Admin: direct edit/delete; owners: edit-request flow */}
                        {isApprover ? (
                          (f.status === 'Draft' || f.status === 'active' || (f.status === 'In Review' && isApprover) || (f.status === 'Approved' && isApprover)) && (
                            <div className="flex gap-1 ml-1">
                              {(f.status === 'Draft' || f.status === 'active' || isApprover) && (
                                <button onClick={() => handleEditRecipe(f)} className="p-1 rounded bg-gray-100 text-gray-400 hover:text-navy hover:bg-gray-200 transition-all" title="Edit Recipe">
                                  <Plus className="w-3 h-3 rotate-45"/>
                                </button>
                              )}
                              <button onClick={() => handleDeleteRecipe(f.id)} className="p-1 rounded bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete Recipe">
                                <Trash2 className="w-3 h-3"/>
                              </button>
                            </div>
                          )
                        ) : f.created_by === employeeProfile?.id ? (
                          <div className="ml-1">
                            <EditRequestButton
                              tableName="formulations"
                              recordId={f.id}
                              moduleLabel="Formulations"
                              fields={[
                                { key: 'name', label: 'Name' },
                                { key: 'notes', label: 'Notes', type: 'textarea' },
                                { key: 'category', label: 'Category', type: 'select', options: [
                                  { value: 'Fermentation', label: 'Fermentation' },
                                  { value: 'Media', label: 'Media' },
                                  { value: 'Buffer', label: 'Buffer' },
                                  { value: 'Other', label: 'Other' },
                                ]},
                              ]}
                              currentData={f}
                              hasPending={pendingIds.has(f.id)}
                              allowDelete={f.status === 'Draft' || f.status === 'active'}
                              onSuccess={() => { fetchFormulations(); fetchPendingIds(); }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {batchCounts[f.id] > 0 && (
                      <div className="mb-2">
                        <button
                          onClick={() => {
                            const isExpanding = expandedBatchHistory !== f.id;
                            setExpandedBatchHistory(isExpanding ? f.id : null);
                            if (isExpanding && !batchHistory[f.id]) {
                              fetchBatchHistory(f.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors"
                        >
                          <FlaskConical className="w-2.5 h-2.5"/>
                          {batchCounts[f.id]} Batch{batchCounts[f.id] !== 1 ? 'es' : ''} â†’
                        </button>
                      </div>
                    )}

                    <h3 className="text-lg font-bold text-gray-900 mb-0.5">{f.name}</h3>
                    <p className="text-xs font-bold text-navy mb-3 font-mono">{f.code}</p>

                    {/* Ingredients */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Ingredients</p>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-gray-400">Vol (mL):</span>
                          <input type="number" value={scaleFactors[f.id] || f.base_volume_ml || 1000} onChange={e => setScaleFactors({...scaleFactors, [f.id]: parseFloat(e.target.value) || f.base_volume_ml || 1000})} step="10" min="1" className="w-16 px-1 py-0.5 text-center border border-gray-200 rounded bg-white text-[10px] font-black"/>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {parsedIng.length > 0 ? parsedIng.map((ing, idx) => {
                          const baseVol = f.base_volume_ml || 1000;
                          const targetVol = scaleFactors[f.id] || baseVol;
                          const factor = targetVol / baseVol;
                          return (
                            <span key={idx} className="bg-white px-2 py-0.5 border border-slate-200 rounded text-[10px] font-bold text-slate-700">
                              {ing.name}: {((parseFloat(ing.quantity) || 0) * factor).toFixed(2)}{ing.unit}
                            </span>
                          );
                        }) : <p className="text-xs font-semibold text-gray-400 italic">No components linked.</p>}
                      </div>
                    </div>

                    {/* Creator badge */}
                    {f.creator && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <CreatorBadge initials={f.creator.initials} fullName={f.creator.full_name} size="sm"/>
                        <span className="text-[10px] text-gray-400 font-medium">by {f.creator.full_name}</span>
                      </div>
                    )}

                    {/* Approved by info */}
                    {f.status === 'Approved' && f.approver && (
                      <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0"/>
                        <p className="text-[10px] font-bold text-emerald-700">
                          Approved by {f.approver.full_name} Â· {f.approved_at ? new Date(f.approved_at).toLocaleDateString() : ''}
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

                      {/* â”€â”€ APPROVAL WORKFLOW BUTTONS â”€â”€ */}

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

                      {/* Approved: Show Launch Batch + Archive + Delete for approvers */}
                      {f.status === 'Approved' && (
                        <div className={`grid gap-2 ${isApprover ? 'grid-cols-3' : 'grid-cols-1'}`}>
                          <Link
                            href={`/batches?formula_code=${f.code}`}
                            className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-emerald-600 text-white hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 ${isApprover ? '' : 'col-span-1'}`}
                          >
                            Launch Batch
                          </Link>
                          {isApprover && (
                            <button
                              onClick={() => handleArchive(f.id)}
                              className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 bg-white text-gray-400 hover:text-amber-600 hover:border-amber-200 transition-all flex items-center justify-center"
                            >
                              Archive
                            </button>
                          )}
                          {isApprover && (
                            <button
                              onClick={() => handleDeleteRecipe(f.id)}
                              className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200 bg-white text-gray-400 hover:text-red-600 hover:border-red-200 transition-all flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-3 h-3"/> Delete
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

                    {/* Batch History Panel */}
                    <AnimatePresence>
                      {expandedBatchHistory === f.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden mt-3"
                        >
                          <div className="border-t border-slate-100 pt-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1">
                              <History className="w-3 h-3"/> Batch History
                            </p>
                            {!batchHistory[f.id] ? (
                              <div className="flex justify-center py-3">
                                <Loader2 className="w-4 h-4 animate-spin text-gray-300"/>
                              </div>
                            ) : batchHistory[f.id].length === 0 ? (
                              <p className="text-[10px] text-gray-400 italic text-center py-2">No batches yet.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {batchHistory[f.id].map(b => {
                                  const bStatus = (b.status || '').toLowerCase();
                                  const bStatusColor =
                                    bStatus === 'released'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    bStatus === 'rejected'   ? 'bg-red-50 text-red-600 border-red-200' :
                                    bStatus === 'active'     ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    bStatus === 'scheduled'  ? 'bg-navy/5 text-navy border-navy/20' :
                                                               'bg-gray-50 text-gray-500 border-gray-200';
                                  return (
                                    <Link
                                      key={b.id}
                                      href={`/batches/${b.id}`}
                                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100 hover:border-navy/30 hover:bg-blue-50/40 transition-all group/batch"
                                    >
                                      <span className="font-mono text-[10px] font-bold text-gray-800 truncate">{b.batch_id || b.id.slice(0, 8)}</span>
                                      <span className={`shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${bStatusColor}`}>
                                        {b.status || 'Unknown'}
                                      </span>
                                      <span className="shrink-0 text-[9px] text-gray-400">
                                        {b.start_time ? new Date(b.start_time).toLocaleDateString() : 'â€”'}
                                      </span>
                                      <ChevronRight className="w-3 h-3 text-gray-300 group-hover/batch:text-navy shrink-0 transition-colors"/>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <RecipeFormModal
        showNew={showNew}
        newForm={newForm}
        setNewForm={setNewForm}
        items={items}
        fetchError={fetchError}
        submitting={submitting}
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        selectedQty={selectedQty}
        setSelectedQty={setSelectedQty}
        onAddIngredient={addIngredient}
        onSubmit={handleSubmit}
        onClose={() => setShowNew(false)}
      />

      <ConfirmDialogs
        rejectingId={rejectingId}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        onConfirmReject={() => handleStatusChange(rejectingId, 'Draft', rejectionReason)}
        onCancelReject={() => { setRejectingId(null); setRejectionReason(''); }}
        pendingDeleteId={pendingDeleteId}
        actionLoading={actionLoading}
        onConfirmDelete={() => handleDeleteRecipe(pendingDeleteId)}
        onCancelDelete={() => setPendingDeleteId(null)}
        pendingArchiveId={pendingArchiveId}
        onConfirmArchive={confirmArchive}
        onCancelArchive={() => setPendingArchiveId(null)}
      />
    </div>
  );
}
