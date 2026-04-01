'use client';
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { notifyEmployee, notifyAll } from '@/lib/notifyEmployee';
import { CalendarOff, CheckCircle, XCircle, Loader2, Send, AlertCircle, Clock } from 'lucide-react';
import { differenceInBusinessDays } from 'date-fns';

const ALL_LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Permission'];

// Roles entitled to Casual Leave only via DOJ-based accrual
const CL_ONLY_ROLES = ['intern', 'research_intern', 'research_fellow'];

/**
 * Calculates earned CL so far this calendar year.
 * - Year of joining:   6 on DOJ, then 1/month from 1st after 6-month mark
 * - Subsequent years:  1 CL per month from Jan 1
 */
function calculateEarnedCL(joinedDate, today = new Date()) {
  const doj = new Date(joinedDate);
  const currentYear = today.getFullYear();
  if (doj.getFullYear() === currentYear) {
    let earned = 6;
    const sixMonthMark = new Date(doj.getFullYear(), doj.getMonth() + 6, doj.getDate());
    if (today >= sixMonthMark) {
      let d = new Date(sixMonthMark.getFullYear(), sixMonthMark.getMonth() + 1, 1);
      while (d <= today && d.getFullYear() === currentYear) { earned++; d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
    }
    return earned;
  } else {
    let earned = 0;
    let d = new Date(currentYear, 0, 1);
    while (d <= today) { earned++; d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
    return earned;
  }
}

const STATUS_STYLE = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-red-50 text-red-700 border-red-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100'
};

export default function LeavePage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [leaves, setLeaves] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [rejectionId, setRejectionId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const isClOnly = CL_ONLY_ROLES.includes(role?.toLowerCase());
  const earnedCL = isClOnly && employeeProfile?.joined_date ? calculateEarnedCL(employeeProfile.joined_date) : 0;

  const { register, handleSubmit, watch, reset } = useForm({
    resolver: zodResolver(z.object({
      leaveType: z.enum(['Casual', 'Sick', 'Earned', 'Permission']),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      permissionDate: z.string().optional(),
      permissionHours: z.string().optional().default('1'),
      reason: z.string().min(1, 'Reason required')
    })),
    defaultValues: { leaveType: 'Casual', startDate: '', endDate: '', permissionDate: '', permissionHours: '1', reason: '' }
  });

  const watchLeaveType = watch('leaveType');
  const watchStartDate = watch('startDate');
  const watchEndDate = watch('endDate');
  const isPermission = watchLeaveType === 'Permission';

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (employeeProfile) fetchLeaves();
  }, [employeeProfile]);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      if (['admin', 'ceo', 'cto'].includes(role)) {
        const [myLeavesRes, pLeavesRes] = await Promise.all([
          supabase.from('leave_applications').select('*').eq('employee_id', employeeProfile.id).order('created_at', { ascending: false }),
          supabase.from('leave_applications').select('*, employees(full_name)').eq('status', 'pending').order('created_at', { ascending: false })
        ]);
        setLeaves(myLeavesRes.data || []);
        setPendingLeaves(pLeavesRes.data || []);
      } else {
        const { data: myLeaves } = await supabase.from('leave_applications').select('*').eq('employee_id', employeeProfile.id).order('created_at', { ascending: false });
        setLeaves(myLeaves || []);
      }
    } catch (err) { console.error('Leave fetch error:', err); }
    finally { setLoading(false); }
  };


  const calculateDays = () => {
    if (isPermission) return 0;
    if (!watchStartDate || !watchEndDate) return 0;
    const days = differenceInBusinessDays(new Date(watchEndDate), new Date(watchStartDate)) + 1;
    return days > 0 ? days : 0;
  };

  const handleApplyForm = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg('');
    
    try {
      const payload = isPermission
        ? {
            leave_type: 'Permission',
            start_date: data.permissionDate,
            end_date: data.permissionDate,
            total_days: 0,
            reason: `Permission Request: ${data.permissionHours} hour(s). ${data.reason}`
          }
        : {
            leave_type: data.leaveType,
            start_date: data.startDate,
            end_date: data.endDate,
            total_days: calculateDays(),
            reason: data.reason
          };

      const res = await fetch('/api/leave/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Submission failed');

      notifyEmployee(
        employeeProfile.id,
        '🗓️ Leave Submitted',
        `Your ${payload.leave_type} leave request has been submitted and is pending HR approval.`,
        '/leave'
      );
      
      const { data: admins } = await supabase.from('employees').select('id').in('role', ['admin','ceo','cto']).eq('is_active', true);
      notifyAll((admins || []).map(a => a.id), '📄 Leave Request Pending', `${employeeProfile.full_name} has submitted a ${payload.leave_type} leave request. Review required.`, '/leave');

      reset();
      fetchLeaves();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const processLeave = async (id, status) => {
    setActionLoadingId(id);
    let comment = '';
    if (status === 'rejected') {
      if (!rejectionId) {
        setRejectionId(id);
        setActionLoadingId(null);
        return;
      }
      if (!rejectionReason || rejectionReason.trim().length < 5) {
        toast.warn("A mandatory rejection reason (min 5 characters) is required.");
        setActionLoadingId(null);
        return;
      }
      comment = rejectionReason;
    }

    try {
      const res = await fetch('/api/leave/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, comment })
      });
      const resData = await res.json();
      if (!res.ok) { toast.error('Action failed: ' + resData.error); return; }

      const updatedLeave = resData.data;

      const employeeId = updatedLeave?.employee_id;
      if (employeeId) {
        const notifTitle = status === 'approved' ? `✅ Leave Approved` : `❌ Leave Rejected`;
        const notifBody = status === 'approved'
          ? `Your ${updatedLeave.leave_type} leave request has been approved by HR.`
          : `Your ${updatedLeave.leave_type} leave request was rejected. Reason: ${comment}`;

        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_to: employeeId, title: notifTitle, body: notifBody, url: '/leave' })
        }).catch(() => {});
      }

      setRejectionId(null);
      setRejectionReason('');
      fetchLeaves();
    } catch (err) { toast.error('Error: ' + err.message); }
    finally { setActionLoadingId(null); }
  };


  if (authLoading || loading) return <div className="p-8 text-center text-gray-400 font-medium">Loading leave ledger data...</div>;

  return (
    <div className="page-container">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Leave Management</h1>
        <p className="text-sm text-gray-500 mt-1">Submit submittals and review platform attendance queries.</p>
      </div>

      {['admin', 'ceo', 'cto'].includes(role) && pendingLeaves.length > 0 && (
        <section className="surface p-6 bg-amber-50/30 border-amber-200">
          <h2 className="text-base font-bold text-amber-900 mb-6 flex items-center tracking-tight">
            <CalendarOff className="w-5 h-5 mr-2 text-amber-700" /> Approval Queue ({pendingLeaves.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingLeaves.map(leave => (
              <div key={leave.id} className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm hover:shadow hover:border-amber-300 transition-all duration-150">
                <p className="font-bold text-gray-900 text-base">{leave.employees?.full_name || 'Staff'}</p>
                <div className="flex justify-between items-center mt-1 mb-4">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                    leave.leave_type === 'Permission' ? 'bg-sky-50 text-sky-700 border border-sky-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                  }`}>
                    {leave.leave_type === 'Permission' ? <><Clock className="w-3 h-3 inline mr-1"/>Permission</> : leave.leave_type}
                  </span>
                  <span className="text-xs font-bold text-gray-500">
                    {leave.leave_type === 'Permission' ? 'Short Leave' : `${leave.total_days} Days`}
                  </span>
                </div>
                
                <div className="text-xs font-bold text-gray-600 bg-gray-50 p-2.5 rounded-lg text-center border border-gray-100 mb-4 tabular-nums">
                  {new Date(leave.start_date).toLocaleDateString()} → {new Date(leave.end_date).toLocaleDateString()}
                </div>
                
                <p className="text-sm text-gray-600 italic mb-6 line-clamp-3 leading-relaxed">&quot;{leave.reason}&quot;</p>
                
                {rejectionId === leave.id ? (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Mandatory Rejection Reason</label>
                    <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="State the scientific or operational reason for rejection..." className="w-full p-3 text-sm border border-red-200 rounded-lg bg-red-50 focus:ring-1 focus:ring-red-500 outline-none h-24 font-medium resize-none shadow-inner" />
                    <div className="flex gap-2">
                      <button onClick={() => processLeave(leave.id, 'rejected')} disabled={actionLoadingId === leave.id} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-xs font-bold">Confirm Reject</button>
                      <button onClick={() => setRejectionId(null)} className="flex-1 bg-white border border-gray-200 text-gray-600 py-2 rounded-lg text-xs font-bold">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => processLeave(leave.id, 'approved')} disabled={actionLoadingId === leave.id} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-xs font-bold flex justify-center items-center shadow-sm">
                      {actionLoadingId === leave.id ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Approve'}
                    </button>
                    <button onClick={() => setRejectionId(leave.id)} className="px-3 bg-white border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-100 py-2 rounded-lg flex items-center justify-center transition-colors text-gray-400">
                      <XCircle className="w-4 h-4" />
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
          <div className="surface p-6">
            <h2 className="text-base font-bold text-gray-900 mb-6 tracking-tight">Apply for Leave</h2>
            {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs font-semibold border border-red-100 flex items-start"><AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />{errorMsg}</div>}
            <form onSubmit={handleSubmit(handleApplyForm)} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">Leave Category</label>
                {isClOnly && (
                  <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700">
                    📋 Leave Policy: Casual Leave only · 6 CL credited on joining · 1 CL/month after 6-month mark · Unused CL expires Dec 31.
                    {employeeProfile?.joined_date && <span className="ml-1 text-amber-600">Earned this year: <strong>{earnedCL} days</strong>.</span>}
                  </div>
                )}
                <select {...register('leaveType')} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-light outline-none text-sm font-semibold">
                  <option value="Casual">Casual Leave (CL)</option>
                  {!isClOnly && <option value="Sick">Sick Leave (SL)</option>}
                  {!isClOnly && <option value="Earned">Earned Leave (EL)</option>}
                  {!isClOnly && <option value="Permission">⏱ Permission / Short Leave</option>}
                </select>
              </div>

              {isPermission ? (
                <div className="space-y-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Short Leave — Hours Based</p>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Date</label>
                    <input type="date" {...register('permissionDate', { required: isPermission })} className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-semibold outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Duration</label>
                    <select {...register('permissionHours')} className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-semibold outline-none">
                      <option value="1">1 Hour</option>
                      <option value="2">2 Hours</option>
                      <option value="3">3 Hours</option>
                      <option value="4">Half Day (4 Hours)</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">Start Date</label>
                    <input type="date" {...register('startDate', { required: !isPermission })} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">End Date</label>
                    <input type="date" {...register('endDate', { required: !isPermission })} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none" />
                  </div>
                </div>
              )}

              {!isPermission && calculateDays() > 0 && (
                <p className="text-[10px] font-black text-navy bg-gray-100 py-1.5 px-3 rounded-md border border-gray-200 uppercase tracking-widest">
                  Selected: {calculateDays()} Business Days
                </p>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1.5">
                  {isPermission ? 'Reason for Permission' : 'Justification'}
                </label>
                <textarea {...register('reason')} rows="3" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold resize-none outline-none focus:ring-2 focus:ring-accent-light" placeholder={isPermission ? 'Brief reason...' : 'Brief explanation...'}></textarea>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-3 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center uppercase tracking-wider text-xs">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Send className="w-3.5 h-3.5 mr-1.5"/> Dispatch Request</>}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="surface overflow-hidden flex flex-col h-full">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Leave Ledger</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cycle</th>
                    <th className="px-6 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Net Days</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                        {l.leave_type === 'Permission' && <Clock className="w-3.5 h-3.5 text-blue-500"/>}
                        {l.leave_type}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 font-medium tabular-nums">
                        {new Date(l.start_date).toLocaleDateString([], { month: 'short', day: 'numeric'})} - {new Date(l.end_date).toLocaleDateString([], { month: 'short', day: 'numeric'})}
                      </td>
                      <td className="px-6 py-4 text-center text-sm font-bold text-gray-900">
                        {l.leave_type === 'Permission' ? <span className="text-blue-600">Short</span> : l.total_days}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-md border ${STATUS_STYLE[l.status] || STATUS_STYLE.pending}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {leaves.length === 0 && <tr><td colSpan="4" className="px-6 py-12 text-center text-gray-400 font-medium text-sm">No ledger entries found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
