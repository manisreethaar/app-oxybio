'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { notifyEmployee, notifyAll } from '@/lib/notifyEmployee';
import { CalendarOff, CheckCircle, XCircle, Loader2, Send, AlertCircle, Clock } from 'lucide-react';
import { differenceInBusinessDays } from 'date-fns';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Permission'];

const STATUS_STYLE = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100'
};

export default function LeavePage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Application form
  const [leaveType, setLeaveType] = useState('Casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [permissionDate, setPermissionDate] = useState(''); // For Permission type
  const [permissionHours, setPermissionHours] = useState('1');  // Duration in hours
  const [reason, setReason] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const supabase = createClient();
  const isPermission = leaveType === 'Permission';

  useEffect(() => {
    if (employeeProfile) fetchLeaves();
  }, [employeeProfile]);

  const fetchLeaves = async () => {
    setLoading(true);
    const { data: myLeaves } = await supabase.from('leave_applications').select('*').eq('employee_id', employeeProfile.id).order('created_at', { ascending: false });
    setLeaves(myLeaves || []);

    if (role === 'admin') {
      const { data: pLeaves } = await supabase.from('leave_applications').select('*, employees(full_name)').eq('status', 'pending').order('created_at', { ascending: false });
      setPendingLeaves(pLeaves || []);
    }
    setLoading(false);
  };

  const calculateDays = () => {
    if (isPermission) return 0; // permissions are hours-based
    if (!startDate || !endDate) return 0;
    const days = differenceInBusinessDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? days : 0;
  };

  const handleApply = async (e) => {
    e.preventDefault();
    if (submitting) return; // Concurrency lock
    setSubmitting(true);
    setErrorMsg('');
    
    try {
      const payload = isPermission
        ? {
            leave_type: 'Permission',
            start_date: permissionDate,
            end_date: permissionDate,
            total_days: 0,        // Permission = 0 full days; hours tracked in reason
            reason: `Permission Request: ${permissionHours} hour(s). ${reason}`
          }
        : {
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            reason
          };

      const res = await fetch('/api/leave/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      // 1. Confirm to the applicant
      notifyEmployee(
        employeeProfile.id,
        '🗓️ Leave Submitted',
        `Your ${payload.leave_type} leave request has been submitted and is pending HR approval.`,
        '/leave'
      );
      // 2. Notify all admins to review
      const { data: admins } = await supabase.from('employees').select('id').eq('role', 'admin').eq('is_active', true);
      notifyAll((admins || []).map(a => a.id), '📄 Leave Request Pending', `${employeeProfile.full_name} has submitted a ${payload.leave_type} leave request. Review required.`, '/leave');

      setStartDate(''); setEndDate(''); setReason('');
      setPermissionDate(''); setPermissionHours('1');
      fetchLeaves();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [rejectionId, setRejectionId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const processLeave = async (id, status) => {
    setActionLoadingId(id);
    let comment = '';
    if (status === 'rejected') {
      if (!rejectionId) {
        setRejectionId(id);
        setActionLoadingId(null);
        return;
      }
      comment = rejectionReason || 'No reason provided.';
    }

    // 1. Update the DB
    const { data: updatedLeave, error } = await supabase.from('leave_applications').update({
      status,
      admin_comment: comment,
      reviewed_by: employeeProfile.id,
      reviewed_at: new Date().toISOString()
    }).eq('id', id).select('*, employees(full_name)').single();

    if (error) {
      alert('Action failed: ' + error.message);
      setActionLoadingId(null);
      return;
    }

    // 2. Push notification TO the employee whose leave was acted on
    const employeeId = updatedLeave?.employee_id;
    const employeeName = updatedLeave?.employees?.full_name || 'Team Member';
    if (employeeId) {
      const notifTitle = status === 'approved'
        ? `✅ Leave Approved`
        : `❌ Leave Rejected`;
      const notifBody = status === 'approved'
        ? `Your ${updatedLeave.leave_type} leave request has been approved by HR.`
        : `Your ${updatedLeave.leave_type} leave request was rejected. Reason: ${comment}`;

      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_to: employeeId,
          title: notifTitle,
          body: notifBody,
          url: '/leave'
        })
      }).catch(() => {}); // Non-blocking — notification failure must never block leave processing
    }

    setRejectionId(null);
    setRejectionReason('');
    fetchLeaves();
    setActionLoadingId(null);
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading leave data...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-black text-teal-950 tracking-tight italic uppercase">Leave Hub</h1>
          <p className="text-gray-500 mt-1 font-medium font-mono">GMP Compliance Leave Protocols</p>
        </div>
      </div>

      {role === 'admin' && pendingLeaves.length > 0 && (
        <section className="bg-amber-50 rounded-3xl border-2 border-amber-100 p-8 shadow-inner">
          <h2 className="text-xl font-black text-amber-900 mb-6 flex items-center tracking-tighter uppercase">
            <CalendarOff className="w-6 h-6 mr-3" /> Approval Queue ({pendingLeaves.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingLeaves.map(leave => (
              <div key={leave.id} className="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <p className="font-black text-slate-800 text-lg">{leave.employees?.full_name}</p>
                <div className="flex justify-between items-center mt-1 mb-4">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                    leave.leave_type === 'Permission' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {leave.leave_type === 'Permission' ? <><Clock className="w-3 h-3 inline mr-1"/>Permission</> : leave.leave_type}
                  </span>
                  <span className="text-sm font-black text-slate-400">
                    {leave.leave_type === 'Permission' ? 'Short Leave' : `${leave.total_days} Days`}
                  </span>
                </div>
                
                <div className="text-xs font-bold text-slate-600 bg-slate-50 p-2.5 rounded-xl text-center border border-slate-100 mb-4 tabular-nums">
                  {new Date(leave.start_date).toLocaleDateString()} → {new Date(leave.end_date).toLocaleDateString()}
                </div>
                
                <p className="text-sm text-slate-500 italic mb-6 line-clamp-3 leading-relaxed">&quot;{leave.reason}&quot;</p>
                
                {rejectionId === leave.id ? (
                  <div className="space-y-3">
                    <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="State rejection reason..." className="w-full p-3 text-sm border-2 border-red-100 rounded-xl bg-red-50 focus:ring-red-500 outline-none h-24 font-medium" />
                    <div className="flex gap-2">
                      <button onClick={() => processLeave(leave.id, 'rejected')} disabled={actionLoadingId === leave.id} className="flex-1 bg-red-600 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest">Confirm Reject</button>
                      <button onClick={() => setRejectionId(null)} className="flex-1 bg-white border-2 border-slate-100 text-slate-400 py-3 rounded-xl text-xs font-black uppercase tracking-widest">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => processLeave(leave.id, 'approved')} disabled={actionLoadingId === leave.id} className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest flex justify-center items-center shadow-lg shadow-emerald-900/10">
                      {actionLoadingId === leave.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <><CheckCircle className="w-4 h-4 mr-2" /> Approve</>}
                    </button>
                    <button onClick={() => setRejectionId(leave.id)} className="px-4 bg-red-50 text-red-600 hover:bg-red-100 py-3 rounded-xl flex items-center justify-center border border-red-100 transition-colors">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-[2rem] border-2 border-slate-100 p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-800 mb-8 uppercase tracking-tighter">Apply for Leave</h2>
            {errorMsg && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-2xl text-xs font-bold border border-red-200 flex items-start text-left"><AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />{errorMsg}</div>}
            <form onSubmit={handleApply} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Leave Category</label>
                <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl focus:ring-4 focus:ring-teal-100 text-sm font-bold">
                  <option value="Casual">Casual Leave (CL)</option>
                  <option value="Sick">Sick Leave (SL)</option>
                  <option value="Earned">Earned Leave (EL)</option>
                  <option value="Permission">⏱ Permission / Short Leave</option>
                </select>
              </div>

              {isPermission ? (
                // Permission mode: single date + hours duration
                <div className="space-y-4 p-4 bg-sky-50 rounded-2xl border border-sky-100">
                  <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Short Leave — Hours Based</p>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Date of Permission</label>
                    <input type="date" required value={permissionDate} onChange={e => setPermissionDate(e.target.value)} className="w-full px-4 py-3 bg-white border-none ring-1 ring-sky-200 rounded-xl text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Duration (Hours)</label>
                    <select value={permissionHours} onChange={e => setPermissionHours(e.target.value)} className="w-full px-4 py-3 bg-white border-none ring-1 ring-sky-200 rounded-xl text-sm font-bold">
                      <option value="1">1 Hour</option>
                      <option value="2">2 Hours</option>
                      <option value="3">3 Hours</option>
                      <option value="4">Half Day (4 Hours)</option>
                    </select>
                  </div>
                  <p className="text-[10px] font-black text-sky-600 bg-sky-100 py-1.5 px-3 rounded-full inline-block">
                    Permission: {permissionHours}h on {permissionDate || '—'}
                  </p>
                </div>
              ) : (
                // Standard multi-day leave
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Start Date</label>
                    <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">End Date</label>
                    <input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl text-sm font-bold" />
                  </div>
                </div>
              )}

              {!isPermission && calculateDays() > 0 && (
                <p className="text-[10px] font-black text-teal-600 bg-teal-50 py-2 px-4 rounded-full inline-block border border-teal-100 uppercase tracking-widest">
                  Selected Payload: {calculateDays()} Business Days
                </p>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">
                  {isPermission ? 'Reason for Permission' : 'Justification / Reason'}
                </label>
                <textarea required value={reason} onChange={e => setReason(e.target.value)} rows="4" className="w-full px-4 py-3 bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl text-sm font-bold resize-none" placeholder={isPermission ? 'Brief reason for permission...' : 'Brief explanation...'}></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-4 bg-teal-800 text-white font-black rounded-2xl hover:bg-teal-900 shadow-xl shadow-teal-900/20 transition-all active:scale-95 flex items-center justify-center uppercase tracking-widest text-xs">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Send className="w-4 h-4 mr-2"/> Dispatch Request</>}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">My Leave Ledger</h2>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ISO 9001 Records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-white/50">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Category</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cycle</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Net Days</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-50">
                  {leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-8 py-5 text-sm font-black text-slate-800 flex items-center gap-2">
                        {l.leave_type === 'Permission' && <Clock className="w-3.5 h-3.5 text-sky-500"/>}
                        {l.leave_type}
                      </td>
                      <td className="px-8 py-5 text-xs text-slate-500 font-bold tabular-nums">
                        {new Date(l.start_date).toLocaleDateString([], { month: 'short', day: 'numeric'})} - {new Date(l.end_date).toLocaleDateString([], { month: 'short', day: 'numeric'})}
                      </td>
                      <td className="px-8 py-5 text-center text-sm font-black text-slate-900">
                        {l.leave_type === 'Permission' ? <span className="text-sky-600">Short</span> : l.total_days}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border ${STATUS_STYLE[l.status] || STATUS_STYLE.pending}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {leaves.length === 0 && <tr><td colSpan="4" className="px-8 py-16 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No ledger entries found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
