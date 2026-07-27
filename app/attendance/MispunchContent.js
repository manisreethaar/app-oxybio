'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useToast } from '@/context/ToastContext';
import {
  ShieldAlert, Clock, Calendar, AlertCircle,
  CheckCircle2, Send, Loader2, ArrowRight, History, LogOut, XCircle
} from 'lucide-react';

export default function MispunchContent() {
  const { employeeProfile, isAdmin, loading: authLoading } = useAuth();
  const toast = useToast();
  const [mispunches, setMispunches] = useState([]);
  const [openShifts, setOpenShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selfReportLog, setSelfReportLog] = useState(null);
  const [formData, setFormData] = useState({ hours: '', reason: '' });
  const [selfReportData, setSelfReportData] = useState({ hours: '', reason: '' });
  const [adminMispunches, setAdminMispunches] = useState([]);
  const [reviewingLog, setReviewingLog] = useState(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const supabase = useMemo(() => createClient(), []);

  const fetchData = async () => {
    if (!employeeProfile) return;
    setLoading(true);
    try {
      const results = await Promise.all([
        employeeProfile.id ? supabase
          .from('attendance_log')
          .select('id, date, mispunch_status, mispunch_reason, mispunch_requested_hours, employee_id')
          .eq('employee_id', employeeProfile.id)
          .not('mispunch_status', 'is', null)
          .order('date', { ascending: false }) : Promise.resolve({ data: [] }),
        employeeProfile.id ? supabase
          .from('attendance_log')
          .select('id, date, check_in_time')
          .eq('employee_id', employeeProfile.id)
          .is('check_out_time', null)
          .is('mispunch_status', null)
          .order('date', { ascending: false }) : Promise.resolve({ data: [] }),
        isAdmin ? fetch('/api/mispunch/pending').then(r => r.json()) : Promise.resolve(null)
      ]), 20000, 'Attendance fetch timed out');

      const [mispunchRes, openRes, adminRes] = results;

      if (mispunchRes.error) throw mispunchRes.error;
      if (openRes.error) throw openRes.error;

      setMispunches(mispunchRes.data || []);
      setOpenShifts(openRes.data || []);

      if (isAdmin && adminRes) {
        if (adminRes.error) throw new Error(adminRes.error);
        setAdminMispunches(adminRes.data || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeProfile, isAdmin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedLog || !formData.hours || !formData.reason) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mispunch/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: selectedLog.id,
          hours: parseFloat(formData.hours),
          reason: formData.reason,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Submission failed');
      }
      setSelectedLog(null);
      setFormData({ hours: '', reason: '' });
      fetchData();
      toast.success('Mispunch request submitted for approval!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelfReport = async (e) => {
    e.preventDefault();
    if (!selfReportLog || !selfReportData.hours || !selfReportData.reason) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mispunch/self-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: selfReportLog.id,
          hours: parseFloat(selfReportData.hours),
          reason: selfReportData.reason,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Submission failed');
      }
      setSelfReportLog(null);
      setSelfReportData({ hours: '', reason: '' });
      fetchData();
      toast.success('Missed checkout reported. Awaiting admin approval.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminReview = async (logId, action, remark) => {
    if (action === 'reject' && (!remark || remark.trim().length < 5)) {
      toast.warn("Please provide a valid rejection remark (min 5 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/mispunch/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, action, remark })
      });
      let resData;
      try { resData = await res.json(); } catch { resData = {}; }
      if (!res.ok) {
        throw new Error(resData.error || resData.details || `Server error: ${res.status}`);
      }
      toast.success(`Mispunch ${action === 'approve' ? 'approved' : 'rejected'} successfully.`);
      await fetchData();
    } catch (err) {
      console.error('[handleAdminReview]', err);
      toast.error(err.message || 'Review failed. Please try again.');
    } finally {
      setSubmitting(false);
      setReviewingLog(null);
      setRejectRemark('');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Syncing attendance records...</div>;

  const requiredLogs = mispunches.filter(m => m.mispunch_status === 'required');
  const historyLogs  = mispunches.filter(m => m.mispunch_status !== 'required');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500" /> Attendance Corrections
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Report missed checkouts or apply for manual hour reconciliation.
        </p>
      </div>

      {isAdmin && (
        <section className="space-y-4 p-5 bg-slate-900 rounded-2xl shadow-lg border border-slate-800">
          <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" /> Pending Admin Approvals
            {adminMispunches.length > 0 && (
              <span className="ml-1 bg-amber-400/20 text-amber-300 text-xs px-2 py-0.5 rounded-full border border-amber-500/30">
                {adminMispunches.length} pending
              </span>
            )}
          </h2>
          {adminMispunches.length === 0 ? (
            <div className="flex items-center gap-3 py-4 text-slate-400 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-500/70 shrink-0" />
              <p>No pending mispunch requests from your team.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {adminMispunches.map(log => (
                <div key={log.id} className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-white font-bold">{log.employees?.full_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(log.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-500/20">
                      {log.mispunch_requested_hours}H Requested
                    </span>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg text-sm text-slate-300 border border-slate-800 mb-3">
                    {log.mispunch_reason}
                  </div>
                  {reviewingLog === log.id ? (
                    <div className="space-y-2 mt-3">
                      <input
                        type="text"
                        placeholder="Reason for rejection (required)..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-red-500 outline-none"
                        value={rejectRemark}
                        onChange={e => setRejectRemark(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAdminReview(log.id, 'reject', rejectRemark)}
                          disabled={submitting || rejectRemark.trim().length < 5}
                          className="flex-1 py-2.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                        >
                          {submitting ? 'Processing...' : 'Confirm Reject'}
                        </button>
                        <button onClick={() => { setReviewingLog(null); setRejectRemark(''); }} className="flex-1 py-2.5 bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-bold rounded-lg transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAdminReview(log.id, 'approve')}
                        disabled={submitting}
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
                      >
                        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewingLog(log.id)}
                        disabled={submitting}
                        className="flex-1 py-2.5 bg-slate-700 text-slate-300 hover:bg-red-900/40 hover:text-red-400 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {openShifts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
            <LogOut className="w-3 h-3" /> Forgot to Check Out? ({openShifts.length})
          </h2>
          <div className="grid gap-3">
            {openShifts.map(log => (
              <div key={log.id} className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-amber-100 p-2.5 rounded-lg border border-amber-200">
                    <Calendar className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      {new Date(log.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    <p className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded inline-block mt-0.5 uppercase tracking-wider">
                      Shift Still Open — Not Checked Out
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelfReportLog(log)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  Report <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            Your shift will be closed with 0 hours and submitted for admin approval with the hours you enter.
          </p>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Clock className="w-3 h-3" /> Pending Resolution ({requiredLogs.length})
        </h2>
        {requiredLogs.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center gap-4 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <p className="font-semibold text-sm">All shift loops are cleanly closed. No mispunches detected.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {requiredLogs.map(log => (
              <div key={log.id} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-red-50 p-2.5 rounded-lg border border-red-100">
                    <Calendar className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{new Date(log.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded inline-block mt-0.5 uppercase tracking-wider">
                      Auto-Zeroed Log
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLog(log)}
                  className="px-4 py-2 bg-navy text-white text-xs font-bold rounded-lg hover:bg-navy-hover transition-colors flex items-center gap-1.5"
                >
                  Apply <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {historyLogs.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-slate-100">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <History className="w-3 h-3" /> Mispunch History
          </h2>
          <div className="grid gap-2">
            {historyLogs.map(log => (
              <div key={log.id} className="bg-slate-50/50 border border-slate-100 p-3 rounded-lg flex items-center justify-between opacity-80">
                <div className="text-xs">
                  <span className="font-bold text-slate-700">{new Date(log.date).toLocaleDateString()}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-slate-500">{log.mispunch_reason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-500 uppercase">{log.mispunch_requested_hours}H Requested</span>
                  <span className={`text-xs font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${
                    log.mispunch_status === 'pending'  ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    log.mispunch_status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                    'bg-red-100 text-red-700 border-red-200'
                  }`}>
                    {log.mispunch_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {selfReportLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/10 backdrop-blur-sm">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <form onSubmit={handleSelfReport}>
              <div className="p-6 border-b border-slate-100 bg-amber-50">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <LogOut className="w-5 h-5 text-amber-500" /> Missed Checkout
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(selfReportLog.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                  {' — '}Enter the hours you actually worked. An admin will review and approve.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Hours Actually Worked</label>
                  <input
                    type="number" step="0.5" min="0.5" max="16" required
                    className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all outline-none text-sm font-bold"
                    placeholder="e.g. 8.5"
                    value={selfReportData.hours}
                    onChange={e => setSelfReportData({ ...selfReportData, hours: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Reason</label>
                  <textarea
                    required
                    placeholder="e.g. Left the office in a hurry and forgot to check out..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all outline-none text-sm min-h-[90px] resize-none"
                    value={selfReportData.reason}
                    onChange={e => setSelfReportData({ ...selfReportData, reason: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 flex gap-3">
                <button type="button" onClick={() => setSelfReportLog(null)} className="flex-1 py-2.5 bg-white text-slate-600 font-semibold rounded-lg border border-slate-200 text-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-sm flex items-center justify-center disabled:opacity-50 text-sm">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-2" /> Submit for Approval</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/10 backdrop-blur-sm">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <form onSubmit={handleSubmit}>
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-900">Mispunch For {new Date(selectedLog.date).toLocaleDateString()}</h3>
                <p className="text-xs text-slate-500 mt-1">Please provide the actual hours worked and reason.</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Hours Actually Worked</label>
                  <input
                    type="number" step="0.5" min="0.5" max="16" required
                    className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-navy focus:border-navy transition-all outline-none text-sm font-bold"
                    placeholder="e.g. 8.5"
                    value={formData.hours}
                    onChange={e => setFormData({ ...formData, hours: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Reason for Mispunch</label>
                  <textarea
                    required
                    placeholder="e.g. Forgot to check out while leaving for field visit..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-navy focus:border-navy transition-all outline-none text-sm min-h-[100px] resize-none"
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 flex gap-3">
                <button type="button" onClick={() => setSelectedLog(null)} className="flex-1 py-2.5 bg-white text-slate-600 font-semibold rounded-lg border border-slate-200 text-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg shadow-sm flex items-center justify-center disabled:opacity-50 text-sm">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-2" /> Submit Application</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
