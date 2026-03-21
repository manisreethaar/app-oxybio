'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Activity, AlertTriangle, MessageSquare, CheckCircle, Loader2 } from 'lucide-react';

export default function ActivityLogPage() {
  const { employeeProfile, role, loading: authLoading } = useAuth();
  const [activities, setActivities] = useState([]);
  const [issues, setIssues] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('feed'); // 'feed' | 'issues' | 'log'
  const supabase = createClient();

  // Form State
  const [desc, setDesc] = useState('');
  const [batchId, setBatchId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hasIssue, setHasIssue] = useState(false);
  const [issueDesc, setIssueDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [activeCommentId, setActiveCommentId] = useState(null);

  useEffect(() => {
    if (employeeProfile) {
      fetchData();
      
      // Auto-set time defaults
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

    // Fetch activities based on role
    let query = supabase.from('activity_log').select('*, employees(full_name)').order('created_at', { ascending: false }).limit(50);
    
    if (role !== 'admin') {
      query = query.eq('employee_id', employeeProfile.id);
    }
    
    const { data: logData } = await query;
    setActivities(logData || []);
    
    if (role === 'admin') {
      setIssues((logData || []).filter(a => a.issue_observed));
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
      setTab('feed');
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

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Lab Activity Log</h1>
          <p className="text-gray-500 mt-1">Digital notebook for daily operations and issue tracking.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button 
            onClick={() => setTab('feed')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${tab === 'feed' ? 'border-teal-700 text-teal-800' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            {role === 'admin' ? 'Team Activity Feed' : 'My Recent Activity'}
          </button>
          
          <button 
            onClick={() => setTab('log')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${tab === 'log' ? 'border-teal-700 text-teal-800' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Log New Activity
          </button>

          {role === 'admin' && (
            <button 
              onClick={() => setTab('issues')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center ${tab === 'issues' ? 'border-red-600 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              Issue Tracker 
              {issues.filter(i => !i.founder_comment).length > 0 && (
                <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs font-bold">
                  {issues.filter(i => !i.founder_comment).length}
                </span>
              )}
            </button>
          )}
        </nav>
      </div>

      {/* Feed Tab */}
      {tab === 'feed' && (
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center text-gray-500 shadow-sm">
              <Activity className="w-8 h-8 mx-auto text-gray-300 mb-3" />
              <p>No activities recorded yet.</p>
            </div>
          ) : (
            activities.map(act => (
              <div key={act.id} className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${act.issue_observed ? 'border-red-200 bg-red-50/10' : 'border-gray-200 hover:border-teal-300'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold text-gray-900">{role === 'admin' ? act.employees?.full_name : 'You'}</span>
                    <span className="text-xs text-gray-500">{new Date(act.created_at).toLocaleDateString()} &bull; {act.start_time} - {act.end_time}</span>
                    {act.batch_id && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-mono font-medium rounded border border-blue-100">{act.batch_id}</span>}
                  </div>
                  {act.issue_observed && <span className="flex items-center text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded"><AlertTriangle className="w-3 h-3 mr-1" /> ISSUE</span>}
                </div>
                
                <p className="text-gray-700 whitespace-pre-wrap text-sm mb-3 ml-1">{act.activity_description}</p>
                
                {act.issue_observed && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-900 mb-3">
                    <span className="font-semibold">Issue Description:</span> {act.issue_description}
                  </div>
                )}

                {/* Founder Comment Display */}
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-teal-50 border border-teal-100 rounded-lg flex items-start">
                    <MessageSquare className="w-4 h-4 text-teal-600 mr-2 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-teal-900 mb-0.5">Admin Review</p>
                      <p className="text-sm text-teal-800">{act.founder_comment}</p>
                    </div>
                  </div>
                ) : role === 'admin' ? (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {activeCommentId === act.id ? (
                      <div className="flex items-start space-x-2">
                        <input type="text" autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Type your review note..." className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-teal-500 focus:border-teal-500" />
                        <button onClick={() => handleAddComment(act.id)} className="bg-teal-700 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-teal-800">Save</button>
                        <button onClick={() => setActiveCommentId(null)} className="text-gray-500 px-2 py-1.5 text-sm hover:text-gray-700">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setActiveCommentId(act.id)} className="text-sm text-teal-600 font-medium hover:text-teal-800 flex items-center">
                        <MessageSquare className="w-4 h-4 mr-1" /> Add Review Comment
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {/* Log Form Tab */}
      {tab === 'log' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-2xl">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Record New Activity</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">What did you do? *</label>
              <textarea required value={desc} onChange={e => setDesc(e.target.value)} rows="4" className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none shadow-sm" placeholder="Detailed description of the protocol, prep work, or general tasks..."></textarea>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Linked Batch (Optional)</label>
                <select value={batchId} onChange={e => setBatchId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-sm">
                  <option value="">-- None --</option>
                  {activeBatches.map(b => (
                    <option key={b.batch_id} value={b.batch_id}>{b.batch_id}</option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Start Time</label>
                  <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">End Time</label>
                  <input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-sm" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <label className="flex items-center space-x-3 mb-4 cursor-pointer">
                <div className="relative flex items-center">
                  <input type="checkbox" checked={hasIssue} onChange={e => setHasIssue(e.target.checked)} className="peer sr-only" />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </div>
                <span className="text-sm font-semibold text-gray-900 mt-1">Report an Issue / Deviation</span>
              </label>

              {hasIssue && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-sm font-semibold text-red-700 mb-1">Issue Description *</label>
                  <textarea required value={issueDesc} onChange={e => setIssueDesc(e.target.value)} rows="3" className="w-full px-4 py-3 rounded-xl border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-red-50 text-red-900 shadow-sm" placeholder="What went wrong? E.g., Equipment failure, contamination suspected..."></textarea>
                </div>
              )}
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isSubmitting} className="w-full flex justify-center items-center py-3 px-4 rounded-xl shadow-md shadow-teal-900/10 text-sm font-bold text-white bg-teal-800 hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-70 transition-all">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Activity Entry'}
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Issues Tracker Tab (Admin Only) */}
      {tab === 'issues' && role === 'admin' && (
        <div className="space-y-4">
          {issues.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center text-gray-500 shadow-sm">
              <CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-3" />
              <p>No issues reported recently. Everything is running smoothly.</p>
            </div>
          ) : (
            issues.map(act => (
              <div key={act.id} className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm bg-red-50/20">
                 <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold text-gray-900">{act.employees?.full_name}</span>
                    <span className="text-xs text-red-600 font-bold">{new Date(act.created_at).toLocaleDateString()}</span>
                  </div>
                  {!act.founder_comment ? (
                    <span className="bg-red-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded animate-pulse">Needs Review</span>
                  ) : (
                    <span className="bg-green-100 text-green-800 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Reviewed</span>
                  )}
                </div>
                <div className="mb-3 text-sm text-gray-600 border-l-2 border-gray-300 pl-3">
                  <span className="font-semibold text-gray-800 block mb-1">Context:</span>
                  {act.activity_description}
                </div>
                <div className="p-3 bg-red-100 border border-red-200 rounded-lg text-sm text-red-900 mb-3 font-medium">
                  <span className="font-bold flex items-center mb-1"><AlertTriangle className="w-4 h-4 mr-1"/> Issue Details:</span> 
                  {act.issue_description}
                </div>
                
                {act.founder_comment ? (
                  <div className="mt-3 p-3 bg-white border border-teal-200 rounded-lg shadow-sm">
                    <p className="text-xs font-bold text-teal-800 mb-1">Resolution / Founder Note:</p>
                    <p className="text-sm text-gray-800">{act.founder_comment}</p>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-red-100">
                     {activeCommentId === act.id ? (
                      <div className="flex items-start space-x-2">
                        <input type="text" autoFocus value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Type resolution or note..." className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-teal-500 focus:border-teal-500" />
                        <button onClick={() => handleAddComment(act.id)} className="bg-teal-700 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-teal-800 shadow-sm">Resolve</button>
                        <button onClick={() => setActiveCommentId(null)} className="text-gray-500 px-3 py-1.5 text-sm font-medium hover:text-gray-700">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setActiveCommentId(act.id)} className="text-sm py-2 px-4 bg-white border border-gray-300 rounded-lg text-gray-700 shadow-sm font-semibold hover:bg-gray-50 flex items-center transition-colors">
                        <CheckCircle className="w-4 h-4 mr-2" /> Mark as Reviewed
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
