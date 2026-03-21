'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { 
  Activity, AlertTriangle, MessageSquare, CheckCircle, Loader2,
  Users, Clock, CheckSquare, FlaskConical, TrendingUp, 
  CalendarCheck, Timer, Zap
} from 'lucide-react';

export default function ActivityLogPage() {
  const { employeeProfile, role, canDo, loading: authLoading } = useAuth();
  const [activities, setActivities] = useState([]);
  const [issues, setIssues] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(canDo ? 'brief' : 'feed');
  const supabase = createClient();

  // Form State (Log Activity tab)
  const [desc, setDesc] = useState('');
  const [batchId, setBatchId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hasIssue, setHasIssue] = useState(false);
  const [issueDesc, setIssueDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [activeCommentId, setActiveCommentId] = useState(null);

  // Founder Brief State
  const [brief, setBrief] = useState({
    presentToday: [],      // checked-in today
    absentToday: [],       // NOT checked in yet
    overdueTasks: [],
    pendingApprovals: [],
    openIssues: [],
    activeExperiments: [],
  });

  useEffect(() => {
    if (employeeProfile) {
      fetchData();
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      setStartTime(oneHourAgo.toTimeString().slice(0, 5));
      setEndTime(now.toTimeString().slice(0, 5));
    }
  }, [employeeProfile]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch batches for dropdown
    const { data: batches } = await supabase.from('batches').select('batch_id').eq('status', 'fermenting');
    setActiveBatches(batches || []);

    // Fetch activity log
    let query = supabase
      .from('activity_log')
      .select('*, employees(full_name)')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (role !== 'admin') {
      query = query.eq('employee_id', employeeProfile.id);
    }
    const { data: logData } = await query;
    setActivities(logData || []);
    if (role === 'admin') {
      setIssues((logData || []).filter(a => a.issue_observed));
    }

    // ── Founder Brief data (admin only) ────────────────────────────────────────
    if (role === 'admin') {
      const today = new Date().toISOString().split('T')[0];

      // 1. All active employees
      const { data: allStaff } = await supabase
        .from('employees')
        .select('id, full_name, designation, role')
        .eq('is_active', true)
        .neq('role', 'admin');

      // 2. Who checked in today
      const { data: todayLogs } = await supabase
        .from('attendance_log')
        .select('employee_id')
        .eq('date', today);

      const checkedInIds = new Set((todayLogs || []).map(l => l.employee_id));
      const present = (allStaff || []).filter(s => checkedInIds.has(s.id));
      const absent = (allStaff || []).filter(s => !checkedInIds.has(s.id));

      // 3. Overdue tasks
      const { data: overdueTasks } = await supabase
        .from('tasks')
        .select('id, title, priority, due_date, assigned_user:employees!tasks_assigned_to_fkey(full_name)')
        .neq('status', 'done')
        .neq('status', 'cancelled')
        .lt('due_date', today)
        .order('due_date', { ascending: true })
        .limit(5);

      // 4. Pending approvals
      const { data: pendingApprovals } = await supabase
        .from('tasks')
        .select('id, title, assigned_user:employees!tasks_assigned_to_fkey(full_name)')
        .eq('approval_status', 'pending_review')
        .limit(5);

      // 5. Active experiments
      const { data: activeExps } = await supabase
        .from('batches')
        .select('batch_id, product_name, status')
        .in('status', ['fermenting', 'in-progress', 'testing'])
        .limit(5);

      // 6. Open issues (unreviewed)
      const openIssues = (logData || []).filter(a => a.issue_observed && !a.founder_comment);

      setBrief({
        presentToday: present || [],
        absentToday: absent || [],
        overdueTasks: overdueTasks || [],
        pendingApprovals: pendingApprovals || [],
        activeExperiments: activeExps || [],
        openIssues,
      });
    }

    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload = {
      employee_id: employeeProfile.id,
      log_date: new Date().toISOString().split('T')[0],
      activity_description: desc,
      start_time: startTime,
      end_time: endTime,
      issue_observed: hasIssue,
      issue_description: hasIssue ? issueDesc : null,
      batch_id: batchId || null
    };
    const { error } = await supabase.from('activity_log').insert(payload);
    setIsSubmitting(false);
    if (error) {
      alert('Failed to save log.');
    } else {
      setDesc(''); setBatchId(''); setHasIssue(false); setIssueDesc('');
      setTab(role === 'admin' ? 'brief' : 'feed');
      fetchData();
    }
  };

  const handleAddComment = async (id) => {
    if (!commentText.trim()) return;
    await supabase.from('activity_log').update({ 
      founder_comment: commentText,
      reviewed_by: employeeProfile.id 
    }).eq('id', id);
    setCommentText('');
    setActiveCommentId(null);
    fetchData();
  };

  if (authLoading || loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-teal-700" /></div>;
  }

  const isAdmin = role === 'admin';
  const nowHour = new Date().getHours();
  const greeting = nowHour < 12 ? 'Good morning' : nowHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            {isAdmin ? 'Operations Center' : 'My Activity Log'}
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            {isAdmin ? `${greeting}, ${employeeProfile.full_name?.split(' ')[0]}. Here's today's operational pulse.` : 'Log your daily work and track any issues.'}
          </p>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {isAdmin && (
            <button onClick={() => setTab('brief')} 
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'brief' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <Zap className="w-4 h-4"/> Morning Brief
            </button>
          )}
          <button onClick={() => setTab('feed')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${tab === 'feed' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            {isAdmin ? 'Team Activity Feed' : 'Recent Activity'}
          </button>
          <button onClick={() => setTab('log')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${tab === 'log' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
            + Log Activity
          </button>
          {isAdmin && (
            <button onClick={() => setTab('issues')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm flex items-center gap-1.5 transition-colors ${tab === 'issues' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              Issue Tracker
              {issues.filter(i => !i.founder_comment).length > 0 && (
                <span className="bg-red-500 text-white py-0.5 px-1.5 rounded-full text-[10px] font-black">
                  {issues.filter(i => !i.founder_comment).length}
                </span>
              )}
            </button>
          )}
        </nav>
      </div>

      {/* ── FOUNDER MORNING BRIEF ─────────────────────────────────────── */}
      {tab === 'brief' && isAdmin && (
        <div className="space-y-5">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'In Today', value: brief.presentToday.length, icon: CalendarCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Not Yet In', value: brief.absentToday.length, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Overdue Tasks', value: brief.overdueTasks.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
              { label: 'Active Batches', value: brief.activeExperiments.length, icon: FlaskConical, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' },
            ].map(kpi => (
              <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4 flex items-center gap-3`}>
                <kpi.icon className={`w-7 h-7 ${kpi.color} shrink-0`}/>
                <div>
                  <p className="text-2xl font-black text-slate-800">{kpi.value}</p>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Grid: Attendance | Tasks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Who's In */}
            <div className="glass-card rounded-2xl p-5">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500"/> Inside the facility today
              </h2>
              {brief.presentToday.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No check-ins yet today.</p>
              ) : (
                <div className="space-y-2">
                  {brief.presentToday.map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="font-bold text-slate-800">{s.full_name}</span>
                      <span className="text-slate-400 text-[11px]">{s.designation || s.role}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {brief.absentToday.length > 0 && (
                <>
                  <div className="border-t border-slate-100 mt-3 pt-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Not yet checked in</p>
                    {brief.absentToday.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-sm mb-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                        <span className="font-medium text-slate-500">{s.full_name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Overdue Tasks + Pending Approvals */}
            <div className="glass-card rounded-2xl p-5 space-y-4">
              {brief.overdueTasks.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500"/> Overdue Tasks
                  </h2>
                  <div className="space-y-2">
                    {brief.overdueTasks.map(t => (
                      <div key={t.id} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-red-800 truncate max-w-[180px]">{t.title}</p>
                          <p className="text-[11px] text-red-500">{t.assigned_user?.full_name} · Due {new Date(t.due_date).toLocaleDateString()}</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${t.priority === 'urgent' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>{t.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.pendingApprovals.length > 0 && (
                <div>
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500"/> Pending Your Approval
                  </h2>
                  <div className="space-y-2">
                    {brief.pendingApprovals.map(t => (
                      <div key={t.id} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        <p className="text-sm font-bold text-amber-800 truncate">{t.title}</p>
                        <p className="text-[11px] text-amber-600">Submitted by {t.assigned_user?.full_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.overdueTasks.length === 0 && brief.pendingApprovals.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-6 text-center">
                  <TrendingUp className="w-8 h-8 text-emerald-400 mb-2"/>
                  <p className="text-sm font-bold text-slate-500">All clear! No overdue tasks or pending approvals.</p>
                </div>
              )}
            </div>
          </div>

          {/* Active Experiments */}
          {brief.activeExperiments.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-teal-500"/> Active Experiments
              </h2>
              <div className="flex flex-wrap gap-2">
                {brief.activeExperiments.map(b => (
                  <div key={b.batch_id} className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                    <span className="text-sm font-black text-teal-800 font-mono">{b.batch_id}</span>
                    {b.product_name && <span className="text-xs text-teal-600">{b.product_name}</span>}
                    <span className="text-[10px] font-bold uppercase text-teal-500 bg-teal-100 px-1.5 py-0.5 rounded">{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open Issues */}
          {brief.openIssues.length > 0 && (
            <div className="glass-card rounded-2xl p-5 border border-red-100">
              <h2 className="text-xs font-black text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4"/> Unreviewed Lab Issues
              </h2>
              <div className="space-y-2">
                {brief.openIssues.map(issue => (
                  <div key={issue.id} className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-red-800 text-sm">{issue.employees?.full_name}</span>
                      <span className="text-[10px] text-red-500">{new Date(issue.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-red-700 font-medium">{issue.issue_description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TEAM ACTIVITY FEED ─────────────────────────────────────────── */}
      {tab === 'feed' && (
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="glass-card p-8 rounded-2xl text-center text-slate-400">
              <Activity className="w-8 h-8 mx-auto text-slate-300 mb-3"/>
              <p className="font-medium">No activities recorded yet.</p>
            </div>
          ) : (
            activities.map(act => (
              <div key={act.id} className={`glass-card rounded-2xl border p-5 transition-all ${act.issue_observed ? 'border-red-200 bg-red-50/20' : 'border-white/60 hover:border-teal-200'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{isAdmin ? act.employees?.full_name : 'You'}</span>
                    <span className="text-xs text-slate-400">{new Date(act.created_at).toLocaleDateString()} · {act.start_time} – {act.end_time}</span>
                    {act.batch_id && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-mono font-bold rounded border border-blue-100">{act.batch_id}</span>}
                  </div>
                  {act.issue_observed && <span className="flex items-center text-xs font-black text-red-700 bg-red-100 px-2 py-0.5 rounded"><AlertTriangle className="w-3 h-3 mr-1"/> ISSUE</span>}
                </div>
                <p className="text-slate-700 whitespace-pre-wrap text-sm mb-2">{act.activity_description}</p>
                {act.issue_observed && <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-900"><span className="font-bold">Issue: </span>{act.issue_description}</div>}
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-start">
                    <MessageSquare className="w-4 h-4 text-teal-600 mr-2 mt-0.5 shrink-0"/>
                    <div><p className="text-xs font-black text-teal-700 mb-0.5">ADMIN REVIEW</p><p className="text-sm text-teal-800">{act.founder_comment}</p></div>
                  </div>
                ) : isAdmin ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {activeCommentId === act.id ? (
                      <div className="flex gap-2">
                        <input autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a review note..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"/>
                        <button onClick={() => handleAddComment(act.id)} className="bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold">Save</button>
                        <button onClick={() => setActiveCommentId(null)} className="text-slate-500 px-2 text-sm">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setActiveCommentId(act.id)} className="text-sm text-teal-600 font-bold hover:text-teal-800 flex items-center">
                        <MessageSquare className="w-3.5 h-3.5 mr-1"/> Add Review
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── LOG ACTIVITY FORM ─────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="glass-card rounded-2xl p-6 max-w-2xl">
          <h2 className="text-lg font-black text-slate-800 mb-5">Record New Activity</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">What did you do? *</label>
              <textarea required value={desc} onChange={e => setDesc(e.target.value)} rows="4" 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 resize-none bg-slate-50 text-sm" 
                placeholder="Protocol steps, prep work, general tasks, results..."/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Linked Batch</label>
                <select value={batchId} onChange={e => setBatchId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 bg-slate-50 text-sm">
                  <option value="">— None —</option>
                  {activeBatches.map(b => <option key={b.batch_id} value={b.batch_id}>{b.batch_id}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Start</label>
                  <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 bg-slate-50 text-sm"/>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">End</label>
                  <input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 bg-slate-50 text-sm"/>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <div className="relative flex items-center">
                  <input type="checkbox" checked={hasIssue} onChange={e => setHasIssue(e.target.checked)} className="peer sr-only"/>
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </div>
                <span className="text-sm font-bold text-slate-700">Report an Issue / Deviation</span>
              </label>
              {hasIssue && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-xs font-black text-red-600 uppercase tracking-widest mb-1.5">Issue Description *</label>
                  <textarea required value={issueDesc} onChange={e => setIssueDesc(e.target.value)} rows="3"
                    className="w-full px-4 py-3 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 bg-red-50 text-red-900 text-sm"
                    placeholder="Equipment failure, contamination suspected, deviation from SOP..."/>
                </div>
              )}
            </div>
            <button type="submit" disabled={isSubmitting}
              className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-black text-white bg-teal-800 hover:bg-teal-900 disabled:opacity-60 transition-all">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Save Activity Entry'}
            </button>
          </form>
        </div>
      )}

      {/* ── ISSUE TRACKER (Admin only) ─────────────────────────────── */}
      {tab === 'issues' && isAdmin && (
        <div className="space-y-4">
          {issues.length === 0 ? (
            <div className="glass-card p-8 rounded-2xl text-center">
              <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-3"/>
              <p className="text-slate-500 font-medium">No issues reported. All running smoothly.</p>
            </div>
          ) : (
            issues.map(act => (
              <div key={act.id} className="glass-card rounded-2xl border border-red-200 p-5 bg-red-50/20">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">{act.employees?.full_name}</span>
                    <span className="text-xs text-red-600 font-bold">{new Date(act.created_at).toLocaleDateString()}</span>
                  </div>
                  {!act.founder_comment 
                    ? <span className="bg-red-600 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded animate-pulse">Needs Review</span>
                    : <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-black px-2 py-0.5 rounded">Reviewed</span>}
                </div>
                <div className="mb-3 text-sm text-slate-600 border-l-2 border-slate-300 pl-3">{act.activity_description}</div>
                <div className="p-3 bg-red-100 border border-red-200 rounded-xl text-sm text-red-900 mb-3 font-medium">
                  <span className="font-black flex items-center mb-1"><AlertTriangle className="w-3.5 h-3.5 mr-1"/> Issue: </span> 
                  {act.issue_description}
                </div>
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-white border border-teal-200 rounded-xl">
                    <p className="text-xs font-black text-teal-700 mb-1">RESOLUTION NOTE</p>
                    <p className="text-sm text-slate-700">{act.founder_comment}</p>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-red-100">
                    {activeCommentId === act.id ? (
                      <div className="flex gap-2">
                        <input autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Enter resolution note..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"/>
                        <button onClick={() => handleAddComment(act.id)} className="bg-teal-700 text-white px-4 py-1.5 rounded-lg text-sm font-black">Resolve</button>
                        <button onClick={() => setActiveCommentId(null)} className="text-slate-500 px-3 text-sm font-medium">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setActiveCommentId(act.id)} className="text-sm py-2 px-4 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-50 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2"/> Mark as Reviewed
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
