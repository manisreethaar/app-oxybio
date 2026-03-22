'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import {
  AlertTriangle, Plus, X, ShieldCheck, Loader2, ChevronRight,
  FlaskConical, Wrench, ClipboardList, CheckCircle2, ArrowLeft,
  FileWarning, Microscope, BadgeAlert, BarChart2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const SOURCES = ['Internal Audit', 'Batch Deviation', 'Equipment Failure', 'Customer Complaint', 'Regulatory Inspection', 'Other'];
const SEVERITIES = ['Minor', 'Major', 'Critical']; // Refined for GMP compliance
const ACTION_TYPES = ['Corrective', 'Preventive'];

const SEVERITY_STYLE = {
  Minor:    'bg-sky-50 text-sky-800 border-sky-200',
  Major:    'bg-amber-50 text-amber-800 border-amber-200',
  Critical: 'bg-red-50 text-red-800 border-red-200',
};

const STATUS_STYLE = {
  Open:            'bg-slate-100 text-slate-600',
  Investigating:   'bg-purple-100 text-purple-700',
  'CAPA Assigned': 'bg-amber-100 text-amber-700',
  Closed:          'bg-emerald-100 text-emerald-700',
};

export default function CapaPage() {
  const { role, canDo, employeeProfile } = useAuth();
  const supabase = createClient();
  const [deviations, setDeviations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // active deviation detail
  const [investigation, setInvestigation] = useState(null); // investigation record
  const [capaActions, setCapaActions] = useState([]); // actions for this deviation

  // Modals
  const [showRaise, setShowRaise] = useState(false);
  const [raising, setRaising] = useState(false);
  const [raiseForm, setRaiseForm] = useState({ title: '', severity: 'Major', source: 'Internal Audit', description: '' });

  const [showInvestigate, setShowInvestigate] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [whyForm, setWhyForm] = useState({ why_1: '', why_2: '', why_3: '', why_4: '', why_5: '', root_cause_identified: '' });

  const [showAction, setShowAction] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [actionForm, setActionForm] = useState({ action_type: 'Corrective', title: '', description: '', assigned_to: '', due_date: '' });

  const isAdmin = (canDo && canDo('capa', 'manage')) || role === 'admin';

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: devs }, { data: emps }] = await Promise.all([
      supabase.from('deviations').select('*, reporter:employees!deviations_reported_by_fkey(full_name)').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name').eq('is_active', true)
    ]);
    setDeviations(devs || []);
    setEmployees(emps || []);
    setLoading(false);
  };

  const loadDetail = async (dev) => {
    // Clear stale investigation state immediately before loading new one
    setSelected(dev);
    setInvestigation(null);
    setCapaActions([]);
    const [{ data: inv }, { data: actions }] = await Promise.all([
      supabase.from('investigations').select('*').eq('deviation_id', dev.id).maybeSingle(),
      supabase.from('capa_actions').select('*, task:tasks(title, status)').eq('investigation_id', dev.id)
    ]);
    setInvestigation(inv || null);
    setCapaActions(actions || []);
    setWhyForm(inv ? {
      why_1: inv.why_1 || '', why_2: inv.why_2 || '', why_3: inv.why_3 || '',
      why_4: inv.why_4 || '', why_5: inv.why_5 || '', root_cause_identified: inv.root_cause_identified || ''
    } : { why_1: '', why_2: '', why_3: '', why_4: '', why_5: '', root_cause_identified: '' });
  };

  // ─── Raise NCR ──────────────────────────────────────────────────────────────
  const handleRaise = async (e) => {
    e.preventDefault();
    setRaising(true);
    const { data, error } = await supabase.from('deviations').insert({
      ...raiseForm,
      reported_by: employeeProfile.id,
      status: 'Open'
    }).select().single();
    if (!error && data) {
      setRaiseForm({ title: '', severity: 'Major', source: 'Internal Audit', description: '' });
      setShowRaise(false);
      await fetchAll();
    } else if (error) {
      alert('Failed to submit NCR: ' + error.message);
    }
    setRaising(false);
  };

  // ─── Save 5-Why Investigation ─────────────────────────────────────────────
  const handleSaveInvestigation = async (e) => {
    e.preventDefault();
    setInvestigating(true);
    let saveError = null;
    if (investigation) {
      const { error } = await supabase.from('investigations').update({ ...whyForm, investigator_id: employeeProfile.id }).eq('id', investigation.id);
      saveError = error;
    } else {
      const { data, error } = await supabase.from('investigations').insert({
        deviation_id: selected.id,
        investigator_id: employeeProfile.id,
        ...whyForm
      }).select().single();
      saveError = error;
      if (!error) setInvestigation(data);
    }
    if (saveError) {
      alert('Failed to save investigation: ' + saveError.message);
      setInvestigating(false);
      return;
    }
    await supabase.from('deviations').update({ status: 'Investigating' }).eq('id', selected.id);
    setSelected(s => ({ ...s, status: 'Investigating' }));
    setShowInvestigate(false);
    setInvestigating(false);
  };

  // ─── Spawn CAPA Action Task ────────────────────────────────────────────────
  const handleSpawnAction = async (e) => {
    e.preventDefault();
    if (!investigation) return alert('Complete the 5-Why Investigation first before assigning a Corrective Action.');
    setActioning(true);
    // 1. Create task in tasks table
    const { data: task, error: taskErr } = await supabase.from('tasks').insert({
      title: `[CAPA] ${actionForm.title}`,
      description: actionForm.description,
      assigned_to: actionForm.assigned_to,
      assigned_by: employeeProfile.id,
      due_date: actionForm.due_date,
      priority: 'high',
      status: 'open',
      approval_status: 'not_required',
      checklist: [],
      logged_minutes: 0,
      is_personal_reminder: false
    }).select().single();

    if (taskErr) {
      alert('Failed to create task: ' + taskErr.message);
      setActioning(false);
      return;
    }

    // 2. Record in capa_actions
    await supabase.from('capa_actions').insert({
      investigation_id: investigation.id,
      action_type: actionForm.action_type,
      task_id: task.id,
      effectiveness_verified: false
    });

    // 3. Update deviation status
    await supabase.from('deviations').update({ status: 'CAPA Assigned' }).eq('id', selected.id);
    setSelected(s => ({ ...s, status: 'CAPA Assigned' }));

    // 4. Send push to assignee
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assigned_to: actionForm.assigned_to,
        title: `CAPA Task: ${actionForm.action_type} Action Required`,
        body: actionForm.title,
        url: '/tasks'
      })
    }).catch(() => {});

    setActionForm({ action_type: 'Corrective', title: '', description: '', assigned_to: '', due_date: '' });
    setShowAction(false);

    // Refresh actions
    const { data: reloaded } = await supabase.from('capa_actions').select('*, task:tasks(title, status)').eq('investigation_id', investigation.id);
    setCapaActions(reloaded || []);
    setActioning(false);
  };

  const handleVerifyEffectiveness = async (actionId) => {
    if (!confirm('Mark this corrective action as Effectiveness Verified?')) return;
    const { error } = await supabase.from('capa_actions').update({ effectiveness_verified: true, verified_by: employeeProfile.id }).eq('id', actionId);
    if (error) {
      alert('Verification failed: ' + error.message);
      return;
    }
    const { data: reloaded } = await supabase.from('capa_actions').select('*, task:tasks(title, status)').eq('investigation_id', investigation.id);
    setCapaActions(reloaded || []);
  };

  // ─── Close Deviation ──────────────────────────────────────────────────────
  const handleClose = async () => {
    // 🛡️ STAGE 3 REMEDIATION: Prevent closure if actions are pending verification
    const pendingCount = capaActions.filter(a => !a.effectiveness_verified).length;
    if (pendingCount > 0) {
      alert(`GMP Violation: Cannot close NCR. There are ${pendingCount} Corrective Actions that have not been Effectiveness Verified.`);
      return;
    }

    if (!confirm('Mark this NCR as Closed? This action indicates all corrective measures have been verified effective.')) return;
    await supabase.from('deviations').update({ status: 'Closed' }).eq('id', selected.id);
    setSelected(s => ({ ...s, status: 'Closed' }));
    fetchAll();
  };

  if (loading) return (
    <div className="p-8 text-center text-slate-400 font-medium animate-pulse">Loading CAPA Engine...</div>
  );

  // ─── Detail View ─────────────────────────────────────────────────────────
  if (selected) return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-teal-700 transition-colors">
        <ArrowLeft className="w-4 h-4"/> Back to All NCRs
      </button>

      {/* Header */}
      <div className="glass-card rounded-3xl p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-widest ${SEVERITY_STYLE[selected.severity]}`}>{selected.severity}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${STATUS_STYLE[selected.status]}`}>{selected.status}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{selected.title}</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">{selected.source} · Reported by {selected.reporter?.full_name} · {new Date(selected.created_at).toLocaleDateString('en-IN')}</p>
          </div>
          {isAdmin && selected.status !== 'Closed' && (
            <button onClick={handleClose} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 transition-colors">
              <CheckCircle2 className="w-4 h-4"/> Close NCR
            </button>
          )}
        </div>
        <p className="text-slate-600 font-medium text-sm leading-relaxed bg-slate-50 rounded-2xl p-4 border border-slate-100">{selected.description}</p>
      </div>

      {/* 5-Why Investigation */}
      <div className="glass-card rounded-3xl p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Microscope className="w-5 h-5 text-purple-600"/> 5-Why Root Cause Analysis</h2>
          {isAdmin && selected.status !== 'Closed' && (
            <button onClick={() => setShowInvestigate(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-bold rounded-xl text-sm hover:bg-purple-700 transition-colors">
              {investigation ? 'Update Analysis' : 'Begin Investigation'}
            </button>
          )}
        </div>
        {investigation ? (
          <div className="space-y-3">
            {['why_1','why_2','why_3','why_4','why_5'].map((k, i) => investigation[k] && (
              <div key={k} className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-black text-xs flex items-center justify-center shrink-0">W{i+1}</span>
                <p className="text-sm text-slate-700 font-medium flex-1 pt-1">{investigation[k]}</p>
              </div>
            ))}
            {investigation.root_cause_identified && (
              <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-1">Root Cause Identified</p>
                <p className="text-sm text-amber-900 font-bold">{investigation.root_cause_identified}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400 font-medium text-center py-6">No investigation started yet.</p>
        )}
      </div>

      {/* CAPA Actions */}
      <div className="glass-card rounded-3xl p-7">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Wrench className="w-5 h-5 text-teal-600"/> Corrective &amp; Preventive Actions</h2>
          {isAdmin && selected.status !== 'Closed' && (
            <button onClick={() => setShowAction(true)} disabled={!investigation} title={!investigation ? 'Complete the investigation first' : ''}
              className="flex items-center gap-2 px-4 py-2 bg-teal-800 text-white font-bold rounded-xl text-sm hover:bg-teal-900 transition-colors disabled:opacity-40">
              <Plus className="w-4 h-4"/> Spawn Action
            </button>
          )}
        </div>
        {capaActions.length === 0 ? (
          <p className="text-sm text-slate-400 font-medium text-center py-6">No actions assigned yet.</p>
        ) : (
          <div className="space-y-3">
            {capaActions.map(a => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${a.action_type === 'Corrective' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}>{a.action_type}</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${a.task?.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{a.task?.status || '—'}</span>
                    {a.effectiveness_verified && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-700 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Verified</span>}
                  </div>
                  <span className="text-sm font-bold text-slate-700">{a.task?.title?.replace('[CAPA] ','')}</span>
                </div>
                {isAdmin && a.task?.status === 'done' && !a.effectiveness_verified && (
                  <button onClick={() => handleVerifyEffectiveness(a.id)} className="px-3 py-1.5 bg-white border border-slate-200 shadow-sm rounded-lg text-xs font-bold text-teal-700 hover:bg-slate-100 transition-colors flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 mr-1"/> Verify Effectiveness
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5-Why Modal */}
      {showInvestigate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveInvestigation} className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-slate-800">5-Why Analysis</h3>
              <button type="button" onClick={() => setShowInvestigate(false)}><X className="w-5 h-5 text-slate-400"/></button>
            </div>
            {['why_1','why_2','why_3','why_4','why_5'].map((k,i) => (
              <div key={k}>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Why {i+1}</label>
                <input value={whyForm[k]} onChange={e => setWhyForm(f => ({...f, [k]: e.target.value}))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500"
                  placeholder={i === 0 ? `Why did "${selected.title.slice(0,40)}..." happen?` : 'Why?'}/>
              </div>
            ))}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Root Cause Identified *</label>
              <textarea required value={whyForm.root_cause_identified} onChange={e => setWhyForm(f => ({...f, root_cause_identified: e.target.value}))}
                rows="2" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500"
                placeholder="State the final verified root cause..."/>
            </div>
            <button type="submit" disabled={investigating} className="w-full py-3 bg-purple-700 text-white font-black rounded-2xl hover:bg-purple-800 disabled:opacity-60 flex items-center justify-center gap-2">
              {investigating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Microscope className="w-4 h-4"/>}
              {investigating ? 'Saving...' : 'Save Root Cause Analysis'}
            </button>
          </form>
        </div>
      )}

      {/* Spawn Action Modal */}
      {showAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSpawnAction} className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-slate-800">Spawn CAPA Action</h3>
              <button type="button" onClick={() => setShowAction(false)}><X className="w-5 h-5 text-slate-400"/></button>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Action Type</label>
              <select value={actionForm.action_type} onChange={e => setActionForm(f => ({...f, action_type: e.target.value}))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500">
                {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Action Title *</label>
              <input required value={actionForm.title} onChange={e => setActionForm(f => ({...f, title: e.target.value}))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500"
                placeholder="e.g., Recalibrate pH Probe SN-2024-01"/>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Description</label>
              <textarea value={actionForm.description} onChange={e => setActionForm(f => ({...f, description: e.target.value}))}
                rows="2" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500"
                placeholder="Steps required to complete this action..."/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Assign To *</label>
                <select required value={actionForm.assigned_to} onChange={e => setActionForm(f => ({...f, assigned_to: e.target.value}))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500">
                  <option value="">Select staff</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Due Date *</label>
                <input required type="date" value={actionForm.due_date} onChange={e => setActionForm(f => ({...f, due_date: e.target.value}))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500"/>
              </div>
            </div>
            <button type="submit" disabled={actioning} className="w-full py-3 bg-teal-800 text-white font-black rounded-2xl hover:bg-teal-900 disabled:opacity-60 flex items-center justify-center gap-2">
              {actioning ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wrench className="w-4 h-4"/>}
              {actioning ? 'Spawning...' : 'Create CAPA Task'}
            </button>
          </form>
        </div>
      )}
    </div>
  );

  // ─── Main Dashboard ──────────────────────────────────────────────────────
  const openCount = deviations.filter(d => d.status === 'Open').length;
  const criticalCount = deviations.filter(d => d.severity === 'Critical' && d.status !== 'Closed').length;
  const capaCount = deviations.filter(d => d.status === 'CAPA Assigned').length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">CAPA Engine</h1>
          <p className="text-slate-500 mt-1 font-medium">Corrective &amp; Preventive Action — GMP / FDA 21 CFR Part 11</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowRaise(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-700 text-white font-bold rounded-xl hover:bg-rose-800 transition-colors shadow-sm text-sm uppercase tracking-wide">
            <BadgeAlert className="w-4 h-4"/> Raise NCR
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open NCRs', value: openCount, color: 'text-rose-700 bg-rose-50 border-rose-100' },
          { label: 'Critical', value: criticalCount, color: 'text-red-800 bg-red-50 border-red-200' },
          { label: 'CAPA Assigned', value: capaCount, color: 'text-amber-700 bg-amber-50 border-amber-100' },
        ].map(k => (
          <div key={k.label} className={`glass-card rounded-2xl p-5 border ${k.color}`}>
            <p className="text-3xl font-black">{k.value}</p>
            <p className="text-xs font-black uppercase tracking-widest mt-1 opacity-70">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Analytics Panel — Admin only */}
      {isAdmin && deviations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Severity Bar Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-teal-600"/>Deviation by Severity</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={[
                { name: 'Minor', count: deviations.filter(d => d.severity === 'Minor').length, fill: '#38bdf8' },
                { name: 'Major', count: deviations.filter(d => d.severity === 'Major').length, fill: '#f59e0b' },
                { name: 'Critical', count: deviations.filter(d => d.severity === 'Critical').length, fill: '#ef4444' },
              ]} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}/>
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }}/>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }}/>
                <Bar dataKey="count" radius={[6,6,0,0]}>
                  {[{ fill: '#38bdf8' }, { fill: '#f59e0b' }, { fill: '#ef4444' }].map((e, i) => <Cell key={i} fill={e.fill}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status Donut */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Status Breakdown</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Open', value: deviations.filter(d => d.status === 'Open').length, fill: '#f87171' },
                    { name: 'Investigating', value: deviations.filter(d => d.status === 'Investigating').length, fill: '#a78bfa' },
                    { name: 'CAPA Assigned', value: deviations.filter(d => d.status === 'CAPA Assigned').length, fill: '#fbbf24' },
                    { name: 'Closed', value: deviations.filter(d => d.status === 'Closed').length, fill: '#34d399' },
                  ].filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  dataKey="value" nameKey="name"
                >
                  {[{ fill: '#f87171' },{ fill: '#a78bfa' },{ fill: '#fbbf24' },{ fill: '#34d399' }].map((e, i) => <Cell key={i} fill={e.fill}/>)}
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 700 }}/>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* NCR List */}
      {deviations.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <ShieldCheck className="w-14 h-14 mx-auto mb-4 opacity-20"/>
          <p className="font-bold">No Non-Conformance Reports yet. All systems compliant.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deviations.map(dev => (
            <button key={dev.id} onClick={() => loadDetail(dev)}
              className="w-full glass-card rounded-2xl p-5 flex items-center justify-between hover:shadow-md hover:-translate-y-0.5 transition-all text-left border border-white/60">
              <div className="flex items-center gap-4">
                <div className={`w-2 h-12 rounded-full shrink-0 ${dev.severity === 'Critical' ? 'bg-red-500' : dev.severity === 'Major' ? 'bg-amber-500' : 'bg-sky-400'}`}/>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest ${SEVERITY_STYLE[dev.severity]}`}>{dev.severity}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${STATUS_STYLE[dev.status]}`}>{dev.status}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{dev.source}</span>
                  </div>
                  <h3 className="text-base font-black text-slate-800">{dev.title}</h3>
                  <p className="text-xs font-medium text-slate-500">{dev.reporter?.full_name} · {new Date(dev.created_at).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 shrink-0"/>
            </button>
          ))}
        </div>
      )}

      {/* Raise NCR Modal */}
      {showRaise && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleRaise} className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><FileWarning className="w-5 h-5 text-rose-600"/> Raise Non-Conformance Report</h3>
              <button type="button" onClick={() => setShowRaise(false)}><X className="w-5 h-5 text-slate-400"/></button>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Title *</label>
              <input required value={raiseForm.title} onChange={e => setRaiseForm(f => ({...f, title: e.target.value}))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500"
                placeholder="e.g., pH Probe SN-2024 out of calibration range"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Severity *</label>
                <select value={raiseForm.severity} onChange={e => setRaiseForm(f => ({...f, severity: e.target.value}))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500">
                  {SEVERITIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Source *</label>
                <select value={raiseForm.source} onChange={e => setRaiseForm(f => ({...f, source: e.target.value}))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500">
                  {SOURCES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Description *</label>
              <textarea required value={raiseForm.description} onChange={e => setRaiseForm(f => ({...f, description: e.target.value}))}
                rows="3" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500"
                placeholder="Describe what happened, when it was discovered, and which batch or equipment was affected..."/>
            </div>
            <button type="submit" disabled={raising} className="w-full py-3 bg-rose-700 text-white font-black rounded-2xl hover:bg-rose-800 disabled:opacity-60 flex items-center justify-center gap-2">
              {raising ? <Loader2 className="w-4 h-4 animate-spin"/> : <BadgeAlert className="w-4 h-4"/>}
              {raising ? 'Raising NCR...' : 'Submit Non-Conformance Report'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
