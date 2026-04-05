'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/context/ToastContext';
import { 
  ShieldAlert, Clock, Calendar, AlertCircle, 
  CheckCircle2, Send, Loader2, ArrowRight, History
} from 'lucide-react';

export default function MispunchPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [mispunches, setMispunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [formData, setFormData] = useState({ hours: '', reason: '' });
  const supabase = useMemo(() => createClient(), []);

  const fetchMispunches = async () => {
    if (!employeeProfile) return;
    setLoading(true);
    try {
      // Fetch logs marked as 'required' OR already 'pending' for this user
      const { data, error } = await supabase
        .from('attendance_log')
        .select('id, date, mispunch_status, mispunch_reason, mispunch_requested_hours, employee_id')
        .eq('employee_id', employeeProfile.id)
        .not('mispunch_status', 'is', null)
        .order('date', { ascending: false });

      if (error) throw error;
      setMispunches(data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMispunches();
  }, [employeeProfile]);

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
          reason: formData.reason
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Submission failed');
      }

      setSelectedLog(null);
      setFormData({ hours: '', reason: '' });
      fetchMispunches();
      toast.success('Mispunch request submitted for approval!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Syncing attendance records...</div>;

  const requiredLogs = mispunches.filter(m => m.mispunch_status === 'required');
  const historyLogs = mispunches.filter(m => m.mispunch_status !== 'required');

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" /> Mispunch Reconciliation
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Apply for manual hour reconciliation if you forgot to check out of the lab.
        </p>
      </div>

      {/* Action Area: Required Mispunches */}
      <section className="space-y-4">
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
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
              <div key={log.id} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-red-50 p-2.5 rounded-lg border border-red-100">
                    <Calendar className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{new Date(log.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    <p className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded inline-block mt-0.5 uppercase tracking-wider">
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

      {/* History Area */}
      {historyLogs.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-gray-100">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <History className="w-3 h-3" /> Mispunch History
          </h2>
          <div className="grid gap-2">
            {historyLogs.map(log => (
              <div key={log.id} className="bg-gray-50/50 border border-gray-100 p-3 rounded-lg flex items-center justify-between opacity-80">
                <div className="text-xs">
                  <span className="font-bold text-gray-700">{new Date(log.date).toLocaleDateString()}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-gray-500">{log.mispunch_reason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-500 uppercase">{log.mispunch_requested_hours}H Requested</span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${
                    log.mispunch_status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
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

      {/* Application Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <form onSubmit={handleSubmit}>
              <div className="p-6 border-b border-gray-100 bg-slate-50/50">
                <h3 className="text-lg font-bold text-gray-900">Mispunch For {new Date(selectedLog.date).toLocaleDateString()}</h3>
                <p className="text-xs text-gray-500 mt-1">Please provide the actual hours worked and reason.</p>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Hours Actually Worked</label>
                  <input 
                    type="number" 
                    step="0.5"
                    min="0.5"
                    max="16"
                    required
                    className="w-full h-10 px-4 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-navy focus:border-navy transition-all outline-none text-sm font-bold"
                    placeholder="e.g. 8.5"
                    value={formData.hours}
                    onChange={e => setFormData({ ...formData, hours: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Reason for Mispunch</label>
                  <textarea 
                    required
                    placeholder="e.g. Forgot to check out while leaving for field visit..."
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-navy focus:border-navy transition-all outline-none text-sm min-h-[100px] resize-none"
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-4 bg-gray-50 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="flex-1 py-2.5 bg-white text-gray-600 font-semibold rounded-lg border border-gray-200 text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-lg shadow-sm flex items-center justify-center disabled:opacity-50 text-sm"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-2"/> Submit Application</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
