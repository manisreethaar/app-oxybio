'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { CalendarOff, CheckCircle, XCircle } from 'lucide-react';
import { differenceInBusinessDays } from 'date-fns';

export default function LeavePage() {
  const { role, employeeProfile, loading: authLoading } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Application form
  const [leaveType, setLeaveType] = useState('Casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const supabase = createClient();

  useEffect(() => {
    if (employeeProfile) fetchLeaves();
  }, [employeeProfile]);

  const fetchLeaves = async () => {
    setLoading(true);
    // My leaves
    const { data: myLeaves } = await supabase.from('leave_applications').select('*').eq('employee_id', employeeProfile.id).order('created_at', { ascending: false });
    setLeaves(myLeaves || []);

    // Admin pending leaves
    if (role === 'admin') {
      const { data: pLeaves } = await supabase.from('leave_applications').select('*, employees(full_name)').eq('status', 'pending').order('created_at', { ascending: false });
      setPendingLeaves(pLeaves || []);
    }
    setLoading(false);
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    // Basic approx, excluding weekends can be done using date-fns differenceInBusinessDays
    const days = differenceInBusinessDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? days : 0;
  };

  const handleApply = async (e) => {
    e.preventDefault();
    const days = calculateDays();
    if (days <= 0) return alert('Invalid dates');

    const { error } = await supabase.from('leave_applications').insert({
      employee_id: employeeProfile.id,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      total_days: days,
      reason,
      status: 'pending'
    });
    if (error) {
      alert('Failed to submit leave: ' + error.message);
      return;
    }
    setStartDate(''); setEndDate(''); setReason('');
    fetchLeaves();
  };

  const processLeave = async (id, status, type) => {
    setActionLoadingId(id);
    let comment = '';
    if (status === 'rejected') {
      // window.prompt is non-functional in iOS PWA — use a safe inline approach
      const reason = window.prompt ? window.prompt("Enter rejection reason:") : null;
      if (reason === null) {
        setActionLoadingId(null);
        return;
      }
      comment = reason || 'No reason provided.';
    }

    const { error } = await supabase.from('leave_applications').update({
      status,
      admin_comment: comment,
      reviewed_by: employeeProfile.id,
      reviewed_at: new Date().toISOString()
    }).eq('id', id);

    if (error) {
      alert('Action failed: ' + error.message);
      setActionLoadingId(null);
      return;
    }
    fetchLeaves();
    setActionLoadingId(null);
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Loading leave data...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Leave Management</h1>
        <p className="text-gray-500 mt-1">Apply for time off and track your balances.</p>
      </div>

      {role === 'admin' && pendingLeaves.length > 0 && (
        <section className="bg-amber-50 rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-amber-900 mb-4 flex items-center">
            <CalendarOff className="w-5 h-5 mr-2" /> Pending Approvals ({pendingLeaves.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingLeaves.map(leave => (
              <div key={leave.id} className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm relative">
                <p className="font-bold text-gray-900">{leave.employees?.full_name}</p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-1 mb-3">{leave.leave_type} LEAVE &bull; {leave.total_days} Days</p>
                
                <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded mb-4 tabular-nums text-center font-medium border border-gray-100">
                  {new Date(leave.start_date).toLocaleDateString()} &rarr; {new Date(leave.end_date).toLocaleDateString()}
                </div>
                
                <p className="text-sm text-gray-600 italic line-clamp-2 mb-4">&quot;{leave.reason}&quot;</p>
                
                <div className="flex space-x-2 mt-auto">
                  <button onClick={() => processLeave(leave.id, 'approved')} disabled={actionLoadingId === leave.id} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm font-semibold flex justify-center items-center">
                    <CheckCircle className="w-4 h-4 mr-1" /> Approve
                  </button>
                  <button onClick={() => processLeave(leave.id, 'rejected')} disabled={actionLoadingId === leave.id} className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 py-1.5 rounded-lg text-sm font-semibold flex justify-center items-center">
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
             <h2 className="text-lg font-bold text-gray-900 mb-6">Apply for Leave</h2>
             <form onSubmit={handleApply} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Leave Type</label>
                  <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 text-sm">
                    <option value="Casual">Casual Leave (CL)</option>
                    <option value="Sick">Sick Leave (SL)</option>
                    <option value="Earned">Earned Leave (EL)</option>
                  </select>
                </div>
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">From</label>
                    <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">To</label>
                    <input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                {startDate && endDate && (
                   <div className="text-xs font-medium text-teal-800 bg-teal-50 py-1 px-2 rounded text-center border border-teal-100">
                     Total Days (excl. weekends): {calculateDays()}
                   </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reason</label>
                  <textarea required value={reason} onChange={e => setReason(e.target.value)} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" placeholder="Brief explanation..."></textarea>
                </div>
                <button type="submit" className="w-full py-2.5 bg-teal-800 text-white font-bold rounded-lg hover:bg-teal-900 shadow-sm transition-colors text-sm">
                  Submit Request
                </button>
             </form>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden auto-rows-max h-full">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
               <h2 className="text-lg font-bold text-gray-900">My Leave History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Days</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">
                        {l.leave_type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                        {new Date(l.start_date).toLocaleDateString([], { month: 'short', day: 'numeric'})} - {new Date(l.end_date).toLocaleDateString([], { month: 'short', day: 'numeric'})}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {l.total_days}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs font-bold uppercase tracking-wider rounded border ${
                          l.status === 'approved' ? 'bg-green-100 text-green-800 border-green-200' : 
                          l.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {l.status}
                        </span>
                        {l.admin_comment && (
                           <div className="mt-1 text-xs text-red-600 italic">&quot;{l.admin_comment}&quot;</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {leaves.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-sm text-gray-500">You haven&apos;t applied for any leaves yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
