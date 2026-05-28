'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { notifyEmployee } from '@/lib/notifyEmployee';
import {
  AlertTriangle, Plus, X, ShieldCheck, Loader2, ChevronRight,
  Wrench, CheckCircle2, ArrowLeft, FileWarning, Microscope, BadgeAlert, BarChart2, FlaskConical, Search
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import EditRequestButton from '@/components/ui/EditRequestButton';
import CreatorBadge from '@/components/ui/CreatorBadge';
const CapaSeverityChart = dynamic(() => import('@/components/charts/CapaCharts').then(m => ({ default: m.CapaSeverityChart })), { ssr: false });
const CapaStatusChart = dynamic(() => import('@/components/charts/CapaCharts').then(m => ({ default: m.CapaStatusChart })), { ssr: false });

const SOURCES = ['Internal Audit', 'Batch Deviation', 'Equipment Failure', 'Customer Complaint', 'Regulatory Inspection', 'Other'];
const SEVERITIES = ['Minor', 'Major', 'Critical'];
const ACTION_TYPES = ['Corrective', 'Preventive'];

const SEVERITY_STYLE = { Minor: 'bg-blue-50 text-blue-700 border-blue-100', Major: 'bg-amber-50 text-amber-700 border-amber-100', Critical: 'bg-red-50 text-red-700 border-red-100' };
const STATUS_STYLE = { Open: 'bg-gray-100 text-gray-600', Investigating: 'bg-indigo-50 text-indigo-700 border-indigo-100', 'CAPA Assigned': 'bg-amber-50 text-amber-700 border-amber-100', Closed: 'bg-emerald-50 text-emerald-700 border-emerald-100' };

export default function CapaPage() {
  const { role, canDo, employeeProfile } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [deviations, setDeviations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [investigation, setInvestigation] = useState(null);
  const [capaActions, setCapaActions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('newest');

  const [pendingIds, setPendingIds] = useState(new Set());
  const [showRaise, setShowRaise] = useState(false);
  const [raising, setRaising] = useState(false);
  const { register: regRaise, handleSubmit: handRaise, formState: { errors: raiseErrors }, reset: resetRaise } = useForm({
    resolver: zodResolver(z.object({ title: z.string().min(1), severity: z.enum(['Minor', 'Major', 'Critical']), source: z.string(), description: z.string().min(1) })),
    defaultValues: { title: '', severity: 'Major', source: 'Internal Audit', description: '' }
  });

  const [showInvestigate, setShowInvestigate] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const { register: regWhy, handleSubmit: handWhy, formState: { errors: whyErrors }, reset: resetWhy, setValue: setWhyValue } = useForm({
    resolver: zodResolver(z.object({ why_1: z.string().optional(), why_2: z.string().optional(), why_3: z.string().optional(), why_4: z.string().optional(), why_5: z.string().optional(), root_cause_identified: z.string().min(1) })),
    defaultValues: { why_1: '', why_2: '', why_3: '', why_4: '', why_5: '', root_cause_identified: '' }
  });

  const [showAction, setShowAction] = useState(false);
  const [actioning, setActioning] = useState(false);
  const { register: regAction, handleSubmit: handAction, formState: { errors: actionErrors }, reset: resetAction } = useForm({
    resolver: zodResolver(z.object({ action_type: z.enum(['Corrective', 'Preventive']), title: z.string().min(1), description: z.string().optional(), assigned_to: z.string().min(1), due_date: z.string().min(1) })),
    defaultValues: { action_type: 'Corrective', title: '', description: '', assigned_to: '', due_date: '' }
  });

  const isAdmin = role === 'admin' || role === 'ceo' || role === 'cto';

  const fetchPendingIds = async () => {
    const res = await fetch('/api/edit-request');
    if (res.ok) {
      const d = await res.json();
      setPendingIds(new Set((d.data || []).filter(r => r.status === 'pending').map(r => r.record_id)));
    }
  };

  useEffect(() => { fetchAll(); fetchPendingIds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: devs }, { data: emps }] = await Promise.all([
        supabase.from('deviations').select('*, reported_by, created_by, reporter:employees!deviations_reported_by_fkey(full_name), creator:employees!deviations_created_by_fkey(id, full_name, initials), batches(id, batch_id)').order('created_at', { ascending: false }),
        supabase.from('employees').select('id, full_name').eq('is_active', true)
      ]);
      setDeviations(devs || []); setEmployees(emps || []);
    } catch (err) { console.error('CAPA fetch error:', err); }
    finally { setLoading(false); }
  };


  const loadDetail = async (dev) => {
    setSelected(dev); setInvestigation(null); setCapaActions([]);
    const [{ data: inv }, { data: actions }] = await Promise.all([
      supabase.from('investigations').select('*').eq('deviation_id', dev.id).maybeSingle(),
      supabase.from('capa_actions').select('*, task:tasks(title, status)').eq('investigation_id', dev.id)
    ]);
    setInvestigation(inv || null); setCapaActions(actions || []);
    if (inv) {
      ['why_1','why_2','why_3','why_4','why_5','root_cause_identified'].forEach(k => setWhyValue(k, inv[k] || ''));
    } else {
      resetWhy();
    }
  };

  const executeApi = async (method, action, payload = {}) => {
    try {
      const res = await fetch('/api/capa', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
      if (!res.ok) throw new Error((await res.json()).error || `Failed: ${action}`);
      return await res.json();
    } catch (err) { toast.error(err.message); return null; }
  };

  const handleRaise = async (data) => {
    setRaising(true);
    const res = await executeApi('POST', 'raise', data);
    if (res?.success) { resetRaise(); setShowRaise(false); fetchAll(); }
    setRaising(false);
  };

  const handleSaveInvestigation = async (data) => {
    setInvestigating(true);
    const res = await executeApi('POST', 'investigate', { deviation_id: selected.id, investigation_id: investigation?.id, ...data });
    if (res?.success) { setInvestigation(res.data); setSelected(s => ({ ...s, status: 'Investigating' })); setShowInvestigate(false); }
    setInvestigating(false);
  };

  const handleSpawnAction = async (data) => {
    if (!investigation) return; setActioning(true);
    const res = await executeApi('POST', 'spawn_action', { deviation_id: selected.id, investigation_id: investigation.id, ...data });
    if (res?.success) {
      fetch('/api/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_to: data.assigned_to, title: `CAPA: ${data.action_type}`, body: data.title, url: '/tasks' }) }).catch(() => {});
      resetAction(); setShowAction(false); setSelected(s => ({ ...s, status: 'CAPA Assigned' }));
      const { data: reloaded } = await supabase.from('capa_actions').select('*, task:tasks(title, status)').eq('investigation_id', investigation.id); setCapaActions(reloaded || []);
    }
    setActioning(false);
  };

  const handleVerifyEffectiveness = async (actionId) => {
    const res = await executeApi('PATCH', 'verify_effectiveness', { action_id: actionId });
    if (res?.success) { const { data: reloaded } = await supabase.from('capa_actions').select('*, task:tasks(title, status)').eq('investigation_id', investigation.id); setCapaActions(reloaded || []); }
  };

  const handleClose = async () => {
    if (capaActions.some(a => !a.effectiveness_verified)) { toast.warn("Cannot close. Unverified actions exist."); return; }
    const res = await executeApi('PATCH', 'close_deviation', { deviation_id: selected.id });
    if (res?.success) { setSelected(s => ({ ...s, status: 'Closed' })); fetchAll(); }
  };


  if (loading) return <div className="p-8 text-center text-gray-400 font-medium">Synchronizing CAPA Registry...</div>;

  if (selected) return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-navy transition-colors"><ArrowLeft className="w-4 h-4"/> Back to NCR Dashboard</button>
      <div className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border uppercase tracking-wider ${SEVERITY_STYLE[selected.severity]}`}>{selected.severity}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border tracking-wider ${STATUS_STYLE[selected.status]}`}>{selected.status}</span>
            </div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">{selected.title}</h1>
            <p className="text-[11px] text-gray-400 font-bold uppercase mt-0.5">{selected.source} · Reported by {selected.reporter?.full_name} · {new Date(selected.created_at).toLocaleDateString()}</p>
          </div>
          {isAdmin && selected.status !== 'Closed' && <button onClick={handleClose} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"><CheckCircle2 className="w-3.5 h-3.5"/> Close NCR</button>}
        </div>
        <p className="text-gray-700 font-medium text-xs leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">{selected.description}</p>
      </div>

      <div className="surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Microscope className="w-4 h-4 text-indigo-600"/> Root Cause Analysis</h2>
          {isAdmin && selected.status !== 'Closed' && <button onClick={() => setShowInvestigate(true)} className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-100">{investigation ? 'Update' : 'Investigate'}</button>}
        </div>
        {investigation ? (
          <div className="space-y-2">
            {['why_1','why_2','why_3','why_4','why_5'].map((k, i) => investigation[k] && (
              <div key={k} className="flex gap-2 items-start text-xs text-gray-700 font-medium"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-black text-[10px] flex items-center justify-center shrink-0">{i+1}</span><p className="pt-0.5">{investigation[k]}</p></div>
            ))}
            {investigation.root_cause_identified && <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100"><p className="text-[9px] font-black text-amber-700 uppercase mb-0.5">Root Cause</p><p className="text-xs text-amber-900 font-bold">{investigation.root_cause_identified}</p></div>}
          </div>
        ) : <p className="text-xs text-gray-400 font-medium text-center py-4">No analysis recorded.</p>}
      </div>

      <div className="surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Wrench className="w-4 h-4 text-navy"/> Actions</h2>
          {isAdmin && selected.status !== 'Closed' && <button onClick={() => setShowAction(true)} disabled={!investigation} className="px-3 py-1 bg-navy text-white font-bold rounded-lg text-xs hover:bg-navy-hover disabled:opacity-40"><Plus className="w-3.5 h-3.5 inline"/> Spawn</button>}
        </div>
        {capaActions.length === 0 ? <p className="text-xs text-gray-400 font-medium text-center py-4">No actions assigned.</p> : (
          <div className="space-y-2">
            {capaActions.map(a => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 gap-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${a.action_type === 'Corrective' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{a.action_type}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{a.task?.status}</span>
                    {a.effectiveness_verified && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-0.5"><ShieldCheck className="w-3 h-3"/> Verified</span>}
                  </div>
                  <span className="text-xs font-bold text-gray-800">{a.task?.title?.replace('[CAPA] ','')}</span>
                </div>
                {isAdmin && a.task?.status === 'done' && !a.effectiveness_verified && (
                  <button onClick={() => handleVerifyEffectiveness(a.id)} className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-bold text-navy hover:bg-gray-50 flex items-center justify-center shrink-0 gap-0.5">Verify Effectiveness</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvestigate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handWhy(handleSaveInvestigation)} className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-gray-900">5-Why Analysis</h3><button type="button" onClick={() => setShowInvestigate(false)}><X className="w-4 h-4 text-gray-400"/></button></div>
            {['why_1','why_2','why_3','why_4','why_5'].map((k,i) => (
              <div key={k}><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Why {i+1}</label><input {...regWhy(k)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none" /></div>
            ))}
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Root Cause *</label><textarea {...regWhy('root_cause_identified')} rows="2" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold resize-none" placeholder="Statement..." />{whyErrors.root_cause_identified && <p className="text-red-500 text-[10px]">{whyErrors.root_cause_identified.message}</p>}</div>
            <button type="submit" disabled={investigating} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1"><Microscope className="w-4 h-4"/> Save Analysis</button>
          </form>
        </div>
      )}

      {showAction && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handAction(handleSpawnAction)} className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-gray-900">Assign Action</h3><button type="button" onClick={() => setShowAction(false)}><X className="w-4 h-4 text-gray-400"/></button></div>
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Type</label><select {...regAction('action_type')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white font-semibold outline-none">{ACTION_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Title *</label><input {...regAction('title')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none" />{actionErrors.title && <p className="text-red-500 text-[10px] mt-1">{actionErrors.title.message}</p>}</div>
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Description</label><textarea {...regAction('description')} rows="2" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold resize-none" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Assign To</label><select {...regAction('assigned_to')} className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs bg-white font-semibold"><option value="">Select...</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}</select>{actionErrors.assigned_to && <p className="text-red-500 text-[10px] mt-1">{actionErrors.assigned_to.message}</p>}</div>
              <div><label className="block text-[10px] font-bold text-gray-400 mb-1">Due</label><input type="date" {...regAction('due_date')} className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs" />{actionErrors.due_date && <p className="text-red-500 text-[10px] mt-1">{actionErrors.due_date.message}</p>}</div>
            </div>
            <button type="submit" disabled={actioning} className="w-full py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg text-xs uppercase shadow-sm">Spawn Task</button>
          </form>
        </div>
      )}
    </div>
  );

  const openCount = deviations.filter(d => d.status === 'Open').length;
  const criticalCount = deviations.filter(d => d.severity === 'Critical' && d.status !== 'Closed').length;
  const pieData = [{ name: 'Open', value: openCount, fill: '#ef4444' }, { name: 'Investigation', value: deviations.filter(d => d.status === 'Investigating').length, fill: '#8b5cf6' }, { name: 'Assigned', value: deviations.filter(d => d.status === 'CAPA Assigned').length, fill: '#f59e0b' }, { name: 'Closed', value: deviations.filter(d => d.status === 'Closed').length, fill: '#10b981' }].filter(d => d.value > 0);
  const filteredDeviations = deviations
    .filter(dev => {
      const q = searchTerm.trim().toLowerCase();
      const matchesStatus = statusFilter === 'All' || dev.status === statusFilter;
      const matchesSeverity = severityFilter === 'All' || dev.severity === severityFilter;
      const matchesSearch = !q || [
        dev.title,
        dev.description,
        dev.source,
        dev.status,
        dev.severity,
        dev.reporter?.full_name,
        dev.batches?.batch_id
      ].some(value => String(value || '').toLowerCase().includes(q));
      return matchesStatus && matchesSeverity && matchesSearch;
    })
    .sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortOrder === 'severity') return (SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity));
      return new Date(b.created_at) - new Date(a.created_at);
    });

  return (
    <div className="page-container">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900 tracking-tight">CAPA Manager</h1><p className="text-sm text-gray-500 mt-1">Non-Conformance & Action items.</p></div>
        {isAdmin && <button onClick={() => setShowRaise(true)} className="flex items-center gap-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider"><BadgeAlert className="w-4 h-4"/> Raise NCR</button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {[{ label: 'Open NCRs', value: openCount, bg: 'bg-red-50 text-red-600 border-red-100' }, { label: 'Critical', value: criticalCount, bg: 'bg-red-50 text-red-700 border-red-100' }, { label: 'Assigned', value: deviations.filter(d => d.status === 'CAPA Assigned').length, bg: 'bg-amber-50 text-amber-700 border-amber-100' }].map(k => (
          <div key={k.label} className={`surface p-4 border ${k.bg}`}>
            <p className="text-2xl font-black">{k.value}</p>
            <p className="text-[9px] font-black uppercase tracking-wider mt-1 opacity-80">{k.label}</p>
          </div>
        ))}
      </div>

      {isAdmin && deviations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="surface p-4"><h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Severity Breakdown</h3><CapaSeverityChart deviations={deviations} /></div>
          <div className="surface p-4"><h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Status Breakdown</h3><CapaStatusChart pieData={pieData} /></div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search NCR title, source, reporter, or batch..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 outline-none">
            <option value="All">All Statuses</option>
            {Object.keys(STATUS_STYLE).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 outline-none">
            <option value="All">All Severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white font-bold text-gray-600 outline-none">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="severity">Severity</option>
          </select>
        </div>
      </div>

      {deviations.length === 0 ? <div className="text-center py-16 text-gray-400 text-sm">No NCRs recorded.</div> : filteredDeviations.length === 0 ? <div className="text-center py-16 text-gray-400 text-sm">No NCRs match the current search.</div> : (
        <div className="space-y-2">
          {filteredDeviations.map(dev => (
            <div key={dev.id} role="button" tabIndex={0} onClick={() => loadDetail(dev)} onKeyDown={e => e.key === 'Enter' && loadDetail(dev)} className="w-full surface p-4 flex items-center justify-between hover:border-gray-300 transition-colors text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={`w-1 h-10 rounded-full shrink-0 ${dev.severity === 'Critical' ? 'bg-red-500' : dev.severity === 'Major' ? 'bg-amber-500' : 'bg-blue-400'}`}/>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${SEVERITY_STYLE[dev.severity]}`}>{dev.severity}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${STATUS_STYLE[dev.status]}`}>{dev.status}</span>
                    <span className="text-[9px] font-bold text-gray-400 uppercase">{dev.source}</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-800">{dev.title}</h3>
                  <p className="text-[10px] text-gray-400 font-semibold">{dev.reporter?.full_name} · {new Date(dev.created_at).toLocaleDateString()}</p>
                  {dev.batches && (
                    <Link href={`/batches/${dev.batches.id}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded hover:bg-indigo-100 transition-colors">
                      <FlaskConical className="w-3 h-3"/> {dev.batches.batch_id}
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {dev.creator && (
                  <CreatorBadge initials={dev.creator.initials} fullName={dev.creator.full_name} size="sm"/>
                )}
                {!isAdmin && dev.created_by === employeeProfile?.id && dev.status === 'Open' && (
                  <div onClick={e => e.stopPropagation()}>
                    <EditRequestButton
                      tableName="deviations"
                      recordId={dev.id}
                      moduleLabel="Deviations"
                      fields={[
                        { key: 'title', label: 'Title' },
                        { key: 'description', label: 'Description', type: 'textarea' },
                        { key: 'severity', label: 'Severity', type: 'select', options: SEVERITIES.map(s => ({ value: s, label: s })) },
                        { key: 'source', label: 'Source', type: 'select', options: SOURCES.map(s => ({ value: s, label: s })) },
                      ]}
                      currentData={dev}
                      hasPending={pendingIds.has(dev.id)}
                      onSuccess={() => { fetchAll(); fetchPendingIds(); }}
                    />
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400"/>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRaise && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handRaise(handleRaise)} className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-gray-900 flex items-center gap-1"><FileWarning className="w-4 h-4 text-red-600"/> Raise NCR</h3><button type="button" onClick={() => setShowRaise(false)}><X className="w-4 h-4 text-gray-400"/></button></div>
            <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Title *</label><input {...regRaise('title')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none" />{raiseErrors.title && <p className="text-red-500 text-[10px] mt-1">{raiseErrors.title.message}</p>}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="block text-[10px] font-bold text-gray-400 mb-1">Severity</label><select {...regRaise('severity')} className="w-full px-2 py-1.5 border border-gray-200 rounded-md bg-white text-xs font-semibold">{SEVERITIES.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-gray-400 mb-1">Source</label><select {...regRaise('source')} className="w-full px-2 py-1.5 border border-gray-200 rounded-md bg-white text-xs font-semibold">{SOURCES.map(s => <option key={s}>{s}</option>)}</select></div>
            </div>
            <div><label className="block text-[10px] font-bold text-gray-400 mb-1">Description *</label><textarea {...regRaise('description')} rows="3" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold resize-none" />{raiseErrors.description && <p className="text-red-500 text-[10px] mt-1">{raiseErrors.description.message}</p>}</div>
            <button type="submit" disabled={raising} className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs uppercase shadow-sm">Submit NCR</button>
          </form>
        </div>
      )}
    </div>
  );
}
