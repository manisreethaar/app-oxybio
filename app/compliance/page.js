'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { MessageSquare, Calendar, FolderCheck, Plus, Link2, Shield, Edit, Trash2, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Users, Flag, AlertTriangle, Clock, Search, ClipboardList, ArrowRight, Loader2, LayoutList, Columns, Table as TableIcon } from 'lucide-react';
import Link from 'next/link';
import { differenceInDays, format, addMonths, addYears, addWeeks } from 'date-fns';
import dynamic from 'next/dynamic';
import CreatorBadge from '@/components/ui/CreatorBadge';
import { useAuditReason } from '@/components/useAuditReason';

const CapaSection = dynamic(() => import('./CapaSection'), { ssr: false });

export default function CompliancePage() {
  const { requestReason, modal: auditModal } = useAuditReason();
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('due_asc');
  const [activeTab, setActiveTab] = useState('calendar');
  const [viewMode, setViewMode] = useState('list');

  useEffect(() => {
    const saved = localStorage.getItem('compliance_view_mode');
    if (saved && ['kanban', 'list', 'table'].includes(saved)) {
      setViewMode(saved);
    }
  }, []);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('compliance_view_mode', mode);
  };

  // A-11: Customer Complaints
  const [complaints,       setComplaints]       = useState([]);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [complaintForm,    setComplaintForm]    = useState({ customer_name: '', complaint_details: '', status: 'Open' });
  const [savingComplaint,  setSavingComplaint]  = useState(false);

  // A-12: Internal Audits
  const [audits,        setAudits]        = useState([]);
  const [showAuditForm, setShowAuditForm] = useState(false);
  const [auditForm,     setAuditForm]     = useState({ audit_title: '', audit_date: new Date().toISOString().slice(0,10), status: 'Planned', findings: '' });
  const [savingAudit,   setSavingAudit]   = useState(false);

  // A-13: Regulatory Milestones
  const [milestones,       setMilestones]       = useState([]);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm,    setMilestoneForm]    = useState({ title: '', category: 'FSSAI', deadline: '', status: 'Pending', priority: 'Medium', description: '' });
  const [savingMilestone,  setSavingMilestone]  = useState(false);
  
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(1, 'Title required'),
      category: z.string(),
      due_date: z.string().min(1, 'Date required'),
      responsible_person: z.string().optional(),
      is_recurring: z.boolean(),
      recurrence: z.string().optional()
    })),
    defaultValues: { title: '', category: 'FSSAI', due_date: '', responsible_person: '', is_recurring: false, recurrence: 'monthly' }
  });
  
  const watchedRecurring = watch('is_recurring');
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'capa') setActiveTab('capa');
  }, []);

  useEffect(() => {
    if (!employeeProfile) return;
    fetchCompliance();

    const channel = supabase.channel('compliance_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compliance_items' }, () => fetchCompliance())
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeProfile]);

  const fetchCompliance = async () => {
    setLoading(true);
    try {
      const fetchPromises = [
        supabase.from('compliance_items').select('*, employees(full_name)').order('due_date', { ascending: true }).limit(500)
      ];
      if (['admin', 'ceo', 'cto'].includes(role)) {
        fetchPromises.push(supabase.from('employees').select('id, full_name').eq('is_active', true));
      }

      const results = await withTimeout(Promise.all(fetchPromises), 20000, 'Compliance load timed out');
      const compItems = results[0].data || [];

      const processedItems = compItems.map(i => {
        if (!i.due_date) return { ...i, calculated_status: i.status };
        const isOverdueState = i.status !== 'done' && differenceInDays(new Date(i.due_date), new Date()) < 0;
        return { ...i, calculated_status: isOverdueState ? 'overdue' : i.status };
      });
      
      setItems(processedItems);

      if (['admin', 'ceo', 'cto'].includes(role) && results[1]) {
        setEmployees(results[1].data || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchComplaints = async () => {
    const { data } = await supabase.from('customer_complaints').select('*, batches(batch_id)').order('created_at', { ascending: false }).limit(500);
    setComplaints(data || []);
  };

  const fetchAudits = async () => {
    const { data } = await supabase.from('internal_audits').select('*, employees!internal_audits_auditor_id_fkey(full_name, initials)').order('audit_date', { ascending: false }).limit(500);
    setAudits(data || []);
  };

  const fetchMilestones = async () => {
    const { data } = await supabase.from('regulatory_milestones').select('*, creator:employees!regulatory_milestones_created_by_fkey(full_name)').order('deadline', { ascending: true }).limit(500);
    setMilestones(data || []);
  };

  useEffect(() => {
    if (!employeeProfile) return;
    fetchComplaints();
    fetchAudits();
    fetchMilestones();
  }, [employeeProfile]); // eslint-disable-line

  const handleSaveComplaint = async () => {
    if (!complaintForm.customer_name || !complaintForm.complaint_details) {
      const missing = [];
      if (!complaintForm.customer_name) missing.push('Customer Name');
      if (!complaintForm.complaint_details) missing.push('Complaint Details');
      toast.warn(`Cannot save complaint. Missing mandatory details: ${missing.join(', ')}.`);
      return;
    }
    setSavingComplaint(true);
    try {
      const { error } = await supabase.from('customer_complaints').insert({
        customer_name: complaintForm.customer_name,
        complaint_details: complaintForm.complaint_details,
        status: complaintForm.status,
        logged_by: employeeProfile?.id,
      });
      if (error) throw error;
      toast.success('Complaint logged.');
      setShowComplaintForm(false);
      setComplaintForm({ customer_name: '', complaint_details: '', status: 'Open' });
      fetchComplaints();
    } catch (err) { toast.error(err.message); }
    finally { setSavingComplaint(false); }
  };

  const handleSaveAudit = async () => {
    if (!auditForm.audit_title || !auditForm.audit_date) {
      const missing = [];
      if (!auditForm.audit_title) missing.push('Audit Title');
      if (!auditForm.audit_date) missing.push('Audit Date');
      toast.warn(`Cannot save audit. Missing mandatory details: ${missing.join(', ')}.`);
      return;
    }
    setSavingAudit(true);
    try {
      const { error } = await supabase.from('internal_audits').insert({
        audit_title: auditForm.audit_title,
        auditor_id: employeeProfile?.id,
        audit_date: auditForm.audit_date,
        status: auditForm.status,
        findings: auditForm.findings || null,
      });
      if (error) throw error;
      toast.success('Audit record created.');
      setShowAuditForm(false);
      setAuditForm({ audit_title: '', audit_date: new Date().toISOString().slice(0,10), status: 'Planned', findings: '' });
      fetchAudits();
    } catch (err) { toast.error(err.message); }
    finally { setSavingAudit(false); }
  };

  const handleSaveMilestone = async () => {
    if (!milestoneForm.title || !milestoneForm.deadline) {
      const missing = [];
      if (!milestoneForm.title) missing.push('Milestone Title');
      if (!milestoneForm.deadline) missing.push('Deadline');
      toast.warn(`Cannot save milestone. Missing mandatory details: ${missing.join(', ')}.`);
      return;
    }
    setSavingMilestone(true);
    try {
      const { error } = await supabase.from('regulatory_milestones').insert({
        ...milestoneForm,
        created_by: employeeProfile?.id,
      });
      if (error) throw error;
      toast.success('Regulatory milestone added.');
      setShowMilestoneForm(false);
      setMilestoneForm({ title: '', category: 'FSSAI', deadline: '', status: 'Pending', priority: 'Medium', description: '' });
      fetchMilestones();
    } catch (err) { toast.error(err.message); }
    finally { setSavingMilestone(false); }
  };

  const handleCreate = async (data) => {
    if (actionLoading) return; setActionLoading(true);
    try {
      const res = await fetch('/api/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create item');
      setShowAdd(false); 
      reset(); 
      toast.success("Compliance item created.");
      fetchCompliance();
    } catch (error) {
      toast.error('Failed to save item: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const markDone = async (item) => {
    try {
      const reason = await requestReason().catch(() => null);
      if (!reason) return;
      const res = await fetch('/api/compliance', { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ action: 'mark_done', item_id: item.id, reason }) 
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to mark done');
      toast.success("Item marked as done.");
      fetchCompliance();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const overdue = items.filter(i => i.calculated_status === 'overdue');
  const thisWeek = items.filter(i => i.calculated_status !== 'done' && i.calculated_status !== 'overdue' && differenceInDays(new Date(i.due_date), new Date()) <= 7);
  const thisMonth = items.filter(i => i.calculated_status !== 'done' && i.calculated_status !== 'overdue' && differenceInDays(new Date(i.due_date), new Date()) > 7 && differenceInDays(new Date(i.due_date), new Date()) <= 30);
  const onTrack = items.filter(i => i.calculated_status !== 'done' && i.calculated_status !== 'overdue' && differenceInDays(new Date(i.due_date), new Date()) > 30);
  const filteredItems = items
    .filter(item => {
      const q = searchTerm.trim().toLowerCase();
      const matchesStatus = statusFilter === 'All' || item.calculated_status === statusFilter;
      const matchesSearch = !q || [
        item.title, item.category, item.recurrence, item.calculated_status, item.employees?.full_name
      ].some(value => String(value || '').toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      if (sortOrder === 'due_desc') return new Date(b.due_date) - new Date(a.due_date);
      if (sortOrder === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortOrder === 'category') return (a.category || '').localeCompare(b.category || '');
      return new Date(a.due_date) - new Date(b.due_date);
    });

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Compliance & CAPA</h1>
          <p className="text-slate-500 mt-1">Regulatory deadlines, renewals, and non-conformance actions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/compliance/audit" className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-colors">
            <Shield className="w-5 h-5 mr-1" /> View Audit Logs
          </Link>
          {activeTab === 'calendar' && ['admin', 'ceo', 'cto'].includes(role) && (
            <button onClick={() => setShowAdd(!showAdd)} className="flex items-center px-4 py-2 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 shadow-sm transition-colors">
              <Plus className="w-5 h-5 mr-1" /> Add Compliance Item
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'calendar' ? 'border-slate-600 text-slate-700' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <CalendarDays className="w-4 h-4" /> Regulatory Calendar
        </button>
        <button onClick={() => setActiveTab('capa')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'capa' ? 'border-slate-600 text-slate-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
          <AlertTriangle className="w-4 h-4" /> CAPA Tracker
        </button>
        <button onClick={() => setActiveTab('audits')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'audits' ? 'border-slate-600 text-slate-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
          <ClipboardList className="w-4 h-4" /> Internal Audits
          {audits.filter(a=>a.status==='Planned'||a.status==='In Progress').length > 0 && <span className="text-xs bg-amber-100 text-amber-700 font-black px-1.5 py-0.5 rounded-full">{audits.filter(a=>a.status==='Planned'||a.status==='In Progress').length}</span>}
        </button>
        <button onClick={() => setActiveTab('complaints')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'complaints' ? 'border-slate-600 text-slate-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
          <MessageSquare className="w-4 h-4" /> Complaints
          {complaints.filter(c=>c.status==='Open').length > 0 && <span className="text-xs bg-red-100 text-red-700 font-black px-1.5 py-0.5 rounded-full">{complaints.filter(c=>c.status==='Open').length}</span>}
        </button>
        <button onClick={() => setActiveTab('milestones')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'milestones' ? 'border-slate-600 text-slate-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
          <Flag className="w-4 h-4" /> Regulatory Milestones
        </button>
      </div>

      {activeTab === 'calendar' && (
        <>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading compliance data...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm">
                  <p className="text-sm font-bold text-red-800 uppercase tracking-wider mb-2">Overdue</p>
                  <p className="text-4xl font-black text-red-600">{overdue.length}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
                  <p className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-2">&lt; 7 Days</p>
                  <p className="text-4xl font-black text-amber-600">{thisWeek.length}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <p className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">&lt; 30 Days</p>
                  <p className="text-4xl font-black text-slate-600">{thisMonth.length}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm">
                  <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider mb-2">On Track</p>
                  <p className="text-4xl font-black text-emerald-600">{onTrack.length}</p>
                </div>
              </div>

              {showAdd && ['admin', 'ceo', 'cto'].includes(role) && (
                <form onSubmit={handleSubmit(handleCreate)} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:w-2/3">
                  <h2 className="text-xl font-bold text-slate-900 mb-6">New Compliance Requirement</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Title *</label>
                      <input type="text" {...register('title')} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-slate-500" placeholder="e.g. FSSAI License Renewal" />
                      {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Category & Dept *</label>
                      <select {...register('category')} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-slate-500">
                        {['FSSAI', 'TIIC', 'PF', 'ESI', 'Patent', 'NABL', 'Equipment', 'Lease', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Due Date *</label>
                      <input type="date" {...register('due_date')} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-slate-500" />
                      {errors.due_date && <p className="text-red-500 text-xs mt-1">{errors.due_date.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Responsible Person</label>
                      <select {...register('responsible_person')} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-slate-500">
                        <option value="">Unassigned</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2 flex items-center space-x-6 mt-2 pb-4 border-b border-slate-100">
                      <label className="flex items-center space-x-2 text-sm font-semibold text-slate-700">
                        <input type="checkbox" {...register('is_recurring')} className="rounded text-slate-600 focus:ring-slate-500" />
                        <span>Is Recurring?</span>
                      </label>
                      {watchedRecurring && (
                        <select {...register('recurrence')} className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-slate-500">
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annually</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button type="button" onClick={() => { setShowAdd(false); reset(); }} className="px-5 py-2 hover:bg-slate-100 border border-transparent rounded-lg text-sm font-medium text-slate-700">Cancel</button>
                    <button type="submit" disabled={actionLoading} className="px-5 py-2 bg-slate-800 text-white font-medium rounded-lg text-sm shadow-sm hover:bg-slate-900 disabled:opacity-50">Save Item</button>
                  </div>
                </form>
              )}

              <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="flex gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-sm h-10 lg:h-[42px] shrink-0">
                  {[
                    { id: 'kanban', icon: Columns, label: 'Kanban' },
                    { id: 'list',   icon: LayoutList, label: 'List' },
                    { id: 'table',  icon: TableIcon, label: 'Table' },
                  ].map(v => {
                    const Icon = v.icon;
                    return (
                      <button
                        key={v.id}
                        onClick={() => handleViewModeChange(v.id)}
                        className={`flex items-center justify-center px-3 rounded-lg transition-all h-full ${
                          viewMode === v.id
                            ? 'bg-slate-100 text-slate-800'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                        title={v.label}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search compliance title, category, or owner..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-100 focus:border-slate-500" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 uppercase outline-none">
                  <option value="All">All Statuses</option>
                  <option value="overdue">Overdue</option>
                  <option value="open">Open</option>
                  <option value="done">Done</option>
                </select>
                <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 uppercase outline-none">
                  <option value="due_asc">Due Soon</option>
                  <option value="due_desc">Due Later</option>
                  <option value="title">Title A-Z</option>
                  <option value="category">Category</option>
                </select>
              </div>

              {viewMode === 'kanban' && (
                <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                  {['overdue', 'open', 'done'].map(statusColumn => {
                    const columnItems = filteredItems.filter(item => {
                      if (statusColumn === 'overdue') return item.calculated_status === 'overdue';
                      if (statusColumn === 'open') return item.calculated_status !== 'overdue' && item.calculated_status !== 'done';
                      if (statusColumn === 'done') return item.calculated_status === 'done';
                      return false;
                    });
                    
                    return (
                      <div key={statusColumn} className="w-80 shrink-0 snap-start flex flex-col max-h-[calc(100vh-200px)]">
                        <div className={`rounded-t-xl p-3 border border-b-0 flex flex-col gap-1.5 shrink-0 ${
                          statusColumn === 'done' ? 'bg-emerald-50 border-emerald-200' :
                          statusColumn === 'open' ? 'bg-amber-50 border-amber-200' :
                          'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 truncate uppercase">{statusColumn}</span>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border bg-white shadow-sm ${
                              statusColumn === 'done' ? 'text-emerald-700' :
                              statusColumn === 'open' ? 'text-amber-700' :
                              'text-red-700'
                            }`}>{columnItems.length}</span>
                          </div>
                        </div>
                        
                        <div className="bg-slate-100/50 rounded-b-xl border border-t-0 border-slate-200 p-2 flex-1 overflow-y-auto space-y-3">
                          {columnItems.length === 0 ? (
                            <div className="text-center p-4 text-xs font-bold text-slate-400">No {statusColumn} items</div>
                          ) : columnItems.map(item => {
                            const daysTo = differenceInDays(new Date(item.due_date), new Date());
                            const badgeColor = 
                              item.calculated_status === 'overdue' ? 'bg-red-100 text-red-800' :
                              item.calculated_status === 'done' ? 'bg-slate-200 text-slate-600' :
                              daysTo <= 7 ? 'bg-amber-100 text-amber-800' :
                              daysTo <= 30 ? 'bg-slate-100 text-slate-800' :
                              'bg-emerald-100 text-emerald-800';
                            
                            return (
                              <div key={item.id} className={`bg-white p-3 rounded-lg border shadow-sm hover:shadow-md transition-all flex flex-col gap-2 ${
                                item.calculated_status === 'overdue' ? 'border-red-300 bg-red-50/20' : 
                                item.calculated_status === 'done' ? 'border-slate-200 bg-slate-50/50 opacity-80' : 'border-slate-200'
                              }`}>
                                <div className="flex justify-between items-start gap-2">
                                  <h3 className={`text-sm font-black ${item.calculated_status === 'done' ? 'line-through text-slate-500' : 'text-slate-900'}`}>{item.title}</h3>
                                  <span className={`shrink-0 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded ${badgeColor}`}>
                                    {item.calculated_status === 'overdue' ? 'OVERDUE' : item.calculated_status === 'done' ? 'DONE' : `${daysTo}d`}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">{item.category}</span>
                                  {item.is_recurring && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">{item.recurrence}</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-slate-50">
                                  <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Due Date</p>
                                    <p className={`text-[10px] font-bold ${item.calculated_status === 'overdue' ? 'text-red-600' : 'text-slate-700'}`}>{format(new Date(item.due_date), 'MMM d, yyyy')}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Owner</p>
                                    <p className="text-[10px] font-bold text-slate-700 truncate">{item.employees?.full_name || 'Unassigned'}</p>
                                  </div>
                                </div>
                                {['admin', 'ceo', 'cto'].includes(role) && item.calculated_status !== 'done' && (
                                  <button onClick={() => markDone(item)} className="mt-2 py-1.5 w-full bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 rounded text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Done
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === 'table' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Task Title</th>
                        <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Category</th>
                        <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Due Date</th>
                        <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Owner</th>
                        <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Status</th>
                        <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-8 text-center text-sm font-bold text-slate-400">No compliance items match the current search.</td>
                        </tr>
                      ) : (
                        filteredItems.map(item => {
                          const daysTo = differenceInDays(new Date(item.due_date), new Date());
                          const isOverdue = item.calculated_status === 'overdue';
                          const isDone = item.calculated_status === 'done';
                          
                          return (
                            <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${isOverdue ? 'bg-red-50/20' : isDone ? 'opacity-70 bg-slate-50/50' : ''}`}>
                              <td className="px-4 py-3">
                                <div className={`text-sm font-bold ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>{item.title}</div>
                                {item.is_recurring && <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.recurrence}</div>}
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">{item.category}</td>
                              <td className="px-4 py-3">
                                <div className={`text-sm font-medium ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-700'}`}>
                                  {format(new Date(item.due_date), 'MMM d, yyyy')}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-slate-700">{item.employees?.full_name || 'Unassigned'}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded ${
                                  isOverdue ? 'bg-red-100 text-red-700' :
                                  isDone ? 'bg-slate-200 text-slate-600' :
                                  daysTo <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {isOverdue ? 'OVERDUE' : isDone ? 'DONE' : `${daysTo} days`}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {['admin', 'ceo', 'cto'].includes(role) && !isDone && (
                                  <button onClick={() => markDone(item)} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 rounded text-[10px] font-black uppercase tracking-widest transition-colors inline-flex items-center">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {viewMode === 'list' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {filteredItems.length === 0 ? (
                    <div className="py-16 text-center text-sm font-bold text-slate-400">No compliance items match the current search.</div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {filteredItems.map((item) => {
                        const daysTo = differenceInDays(new Date(item.due_date), new Date());
                        const statusColor = 
                          item.calculated_status === 'overdue' ? 'bg-red-50' :
                          item.calculated_status === 'done' ? 'bg-slate-50 opacity-60' : '';
                        const badgeColor = 
                          item.calculated_status === 'overdue' ? 'bg-red-100 text-red-800 border-red-200' :
                          item.calculated_status === 'done' ? 'bg-slate-200 text-slate-600 border-slate-300' :
                          daysTo <= 7 ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          daysTo <= 30 ? 'bg-slate-100 text-slate-800 border-slate-200' :
                          'bg-emerald-100 text-emerald-800 border-emerald-200';
                        return (
                          <li key={item.id} className={`p-6 transition-colors hover:bg-slate-50 flex flex-col md:flex-row justify-between md:items-center ${statusColor}`}>
                            <div className="mb-4 md:mb-0">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded border ${badgeColor}`}>
                                  {item.calculated_status === 'overdue' ? 'OVERDUE' : item.calculated_status === 'done' ? 'DONE' : `${daysTo} days left`}
                                </span>
                                {item.is_recurring && <span className="text-xs font-bold uppercase text-slate-700 tracking-widest bg-slate-50 px-2 py-0.5 rounded">{item.recurrence}</span>}
                              </div>
                              <h3 className={`text-lg font-bold ${item.calculated_status === 'done' ? 'line-through text-slate-500' : 'text-slate-900'}`}>{item.title}</h3>
                              <div className="flex flex-wrap items-center mt-2 text-sm text-slate-500 gap-4">
                                <div className="flex items-center"><CalendarDays className="w-4 h-4 mr-1.5" /> Due: {format(new Date(item.due_date), 'MMM d, yyyy')}</div>
                                {item.employees && <div className="flex items-center border-l border-slate-300 pl-4 text-slate-700">Assigned: <strong className="ml-1">{item.employees.full_name}</strong></div>}
                              </div>
                            </div>
                            {['admin', 'ceo', 'cto'].includes(role) && item.calculated_status !== 'done' && (
                              <button onClick={() => markDone(item)} className="px-4 py-2 mt-2 md:mt-0 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-emerald-700 font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Mark Done
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
      {auditModal}

      {activeTab === 'capa' && <CapaSection />}

      {/* A-12: Internal Audits */}
      {activeTab === 'audits' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">{audits.length} audit records</p>
            {['admin','ceo','cto'].includes(role) && (
              <button onClick={() => setShowAuditForm(v=>!v)} className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white font-bold rounded-lg text-xs uppercase tracking-wider hover:bg-navy-hover">
                <Plus className="w-3.5 h-3.5"/>New Audit
              </button>
            )}
          </div>
          {showAuditForm && (
            <div className="card p-5 space-y-3 border-l-4 border-l-indigo-500">
              <h3 className="text-sm font-black text-slate-900">Log Internal Audit</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">Audit Title *</label><input value={auditForm.audit_title} onChange={e=>setAuditForm(p=>({...p,audit_title:e.target.value}))} className="field-input" placeholder="e.g. Production Area GMP Audit Q2"/></div>
                <div><label className="field-label">Audit Date *</label><input type="date" value={auditForm.audit_date} onChange={e=>setAuditForm(p=>({...p,audit_date:e.target.value}))} className="field-input"/></div>
                <div><label className="field-label">Status</label>
                  <select value={auditForm.status} onChange={e=>setAuditForm(p=>({...p,status:e.target.value}))} className="field-input bg-white">
                    {['Planned','In Progress','Completed','Closed'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="field-label">Findings / Observations</label>
                <textarea value={auditForm.findings} onChange={e=>setAuditForm(p=>({...p,findings:e.target.value}))} rows={3} placeholder="Summarise key findings, non-conformances observed..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveAudit} disabled={savingAudit} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-lg text-xs uppercase disabled:opacity-50">{savingAudit?'Saving...':'Save Audit'}</button>
                <button onClick={()=>setShowAuditForm(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs">Cancel</button>
              </div>
            </div>
          )}
          {audits.length === 0 ? (
            <div className="card p-12 text-center text-slate-400"><ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30"/><p className="font-semibold">No internal audit records yet.</p></div>
          ) : (
            <div className="space-y-3">
              {audits.map(a => (
                <div key={a.id} className="card p-4 flex items-start gap-4">
                  <div className="flex-1">
                    <p className="font-black text-slate-900 text-sm">{a.audit_title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.audit_date} · Auditor: {a.employees?.full_name || '—'}</p>
                    {a.findings && <p className="text-xs text-slate-600 mt-2 border-t border-slate-100 pt-2">{a.findings}</p>}
                  </div>
                  <span className={`text-xs font-black px-2 py-1 rounded-lg border uppercase ${a.status==='Completed'||a.status==='Closed'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* A-11: Customer Complaints */}
      {activeTab === 'complaints' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">{complaints.length} complaints · {complaints.filter(c=>c.status==='Open').length} open</p>
            <button onClick={()=>setShowComplaintForm(v=>!v)} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white font-bold rounded-lg text-xs uppercase tracking-wider hover:bg-red-700">
              <Plus className="w-3.5 h-3.5"/>Log Complaint
            </button>
          </div>
          {showComplaintForm && (
            <div className="card p-5 space-y-3 border-l-4 border-l-red-500">
              <h3 className="text-sm font-black text-slate-900">Log Customer Complaint</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">Customer Name *</label><input value={complaintForm.customer_name} onChange={e=>setComplaintForm(p=>({...p,customer_name:e.target.value}))} className="field-input" placeholder="Customer / distributor name"/></div>
                <div><label className="field-label">Status</label>
                  <select value={complaintForm.status} onChange={e=>setComplaintForm(p=>({...p,status:e.target.value}))} className="field-input bg-white">
                    {['Open','Investigating','Resolved','Closed'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="field-label">Complaint Details *</label>
                <textarea value={complaintForm.complaint_details} onChange={e=>setComplaintForm(p=>({...p,complaint_details:e.target.value}))} rows={3} placeholder="Describe the complaint — product issue, packaging, labelling, efficacy concern..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveComplaint} disabled={savingComplaint} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs uppercase disabled:opacity-50">{savingComplaint?'Saving...':'Log Complaint'}</button>
                <button onClick={()=>setShowComplaintForm(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs">Cancel</button>
              </div>
            </div>
          )}
          {complaints.length === 0 ? (
            <div className="card p-12 text-center text-slate-400"><MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30"/><p className="font-semibold">No customer complaints logged.</p></div>
          ) : (
            <div className="space-y-3">
              {complaints.map(c => (
                <div key={c.id} className={`card p-4 border-l-4 ${c.status==='Open'?'border-l-red-500':c.status==='Resolved'||c.status==='Closed'?'border-l-emerald-500':'border-l-amber-400'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-900 text-sm">{c.customer_name}</p>
                      <p className="text-xs text-slate-600 mt-1">{c.complaint_details}</p>
                      {c.batches && <p className="text-xs text-slate-400 mt-1">Batch: {c.batches.batch_id}</p>}
                      <p className="text-xs text-slate-400 mt-1">{new Date(c.created_at).toLocaleDateString('en-IN')}</p>
                    </div>
                    <span className={`text-xs font-black px-2 py-1 rounded-lg border uppercase shrink-0 ${c.status==='Open'?'bg-red-50 text-red-700 border-red-200':c.status==='Resolved'||c.status==='Closed'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{c.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* A-13: Regulatory Milestones */}
      {activeTab === 'milestones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">{milestones.length} milestones</p>
            {['admin','ceo','cto'].includes(role) && (
              <button onClick={()=>setShowMilestoneForm(v=>!v)} className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white font-bold rounded-lg text-xs uppercase tracking-wider hover:bg-navy-hover">
                <Plus className="w-3.5 h-3.5"/>Add Milestone
              </button>
            )}
          </div>
          {showMilestoneForm && (
            <div className="card p-5 space-y-3 border-l-4 border-l-blue-500">
              <h3 className="text-sm font-black text-slate-900">Add Regulatory Milestone</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">Milestone Title *</label><input value={milestoneForm.title} onChange={e=>setMilestoneForm(p=>({...p,title:e.target.value}))} className="field-input" placeholder="e.g. FSSAI Licence Renewal"/></div>
                <div><label className="field-label">Category</label>
                  <select value={milestoneForm.category} onChange={e=>setMilestoneForm(p=>({...p,category:e.target.value}))} className="field-input bg-white">
                    {['FSSAI','ISO 22000','GMP','NABL','MSME','Legal','Other'].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="field-label">Deadline *</label><input type="date" value={milestoneForm.deadline} onChange={e=>setMilestoneForm(p=>({...p,deadline:e.target.value}))} className="field-input"/></div>
                <div><label className="field-label">Priority</label>
                  <select value={milestoneForm.priority} onChange={e=>setMilestoneForm(p=>({...p,priority:e.target.value}))} className="field-input bg-white">
                    {['Low','Medium','High','Critical'].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div><label className="field-label">Status</label>
                  <select value={milestoneForm.status} onChange={e=>setMilestoneForm(p=>({...p,status:e.target.value}))} className="field-input bg-white">
                    {['Pending','In Progress','Completed','Overdue'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="field-label">Description</label>
                <textarea value={milestoneForm.description} onChange={e=>setMilestoneForm(p=>({...p,description:e.target.value}))} rows={2} placeholder="What needs to be done, who's responsible, documents needed..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveMilestone} disabled={savingMilestone} className="px-5 py-2 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg text-xs uppercase disabled:opacity-50">{savingMilestone?'Saving...':'Save Milestone'}</button>
                <button onClick={()=>setShowMilestoneForm(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs">Cancel</button>
              </div>
            </div>
          )}
          {milestones.length === 0 ? (
            <div className="card p-12 text-center text-slate-400"><Flag className="w-10 h-10 mx-auto mb-3 opacity-30"/><p className="font-semibold">No regulatory milestones tracked yet.</p></div>
          ) : (
            <div className="space-y-3">
              {milestones.map(m => {
                const daysLeft = m.deadline ? differenceInDays(new Date(m.deadline), new Date()) : null;
                const isOverdue = daysLeft !== null && daysLeft < 0 && m.status !== 'Completed';
                return (
                  <div key={m.id} className={`card p-4 flex items-start gap-4 ${isOverdue?'border-l-4 border-l-red-500':daysLeft !== null && daysLeft <= 30 && m.status!=='Completed'?'border-l-4 border-l-amber-400':''}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">{m.category}</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded uppercase ${m.priority==='Critical'?'bg-red-100 text-red-700':m.priority==='High'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-500'}`}>{m.priority}</span>
                      </div>
                      <p className="font-black text-slate-900 text-sm">{m.title}</p>
                      {m.description && <p className="text-xs text-slate-600 mt-1">{m.description}</p>}
                      <p className={`text-xs font-bold mt-1 ${isOverdue?'text-red-600':daysLeft!==null&&daysLeft<=30?'text-amber-600':'text-slate-400'}`}>
                        {m.deadline ? `Deadline: ${new Date(m.deadline).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}` : '—'}
                        {daysLeft !== null && m.status !== 'Completed' && ` (${isOverdue?`${Math.abs(daysLeft)}d overdue`:`${daysLeft}d left`})`}
                      </p>
                    </div>
                    <span className={`text-xs font-black px-2 py-1 rounded-lg border uppercase shrink-0 ${m.status==='Completed'?'bg-emerald-50 text-emerald-700 border-emerald-200':isOverdue?'bg-red-50 text-red-700 border-red-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{m.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
