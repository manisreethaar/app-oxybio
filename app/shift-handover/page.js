'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { withTimeout } from '@/lib/withTimeout';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ArrowRight, AlertTriangle, Clock, FlaskConical, CheckCircle2, Plus, Loader2 } from 'lucide-react';
import CreatorBadge from '@/components/ui/CreatorBadge';

export default function ShiftHandoverPage() {
  const { employeeProfile, loading: authLoading } = useAuth();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [handovers, setHandovers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [incomingId,     setIncomingId]     = useState('');
  const [handoverNotes,  setHandoverNotes]  = useState('');
  const [criticalAlerts, setCriticalAlerts] = useState('');
  const [pendingReadings,setPendingReadings] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, eRes] = await withTimeout(Promise.all([
        fetch('/api/shift-handover').then(r => r.json()),
        supabase.from('employees').select('id, full_name, initials, role').eq('is_active', true).order('full_name'),
      ]), 20000, 'Shift handover load timed out');
      if (hRes.success) setHandovers(hRes.data || []);
      if (eRes.data) setEmployees(eRes.data);
    } catch (err) {
      console.error('Shift handover fetch error:', err);
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!handoverNotes.trim()) { toast.warn('Handover notes are required.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/shift-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incoming_employee_id: incomingId || null,
          handover_notes: handoverNotes,
          critical_alerts: criticalAlerts || null,
          pending_readings: pendingReadings || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Shift handover signed off successfully.');
      setShowForm(false);
      setHandoverNotes(''); setCriticalAlerts(''); setPendingReadings(''); setIncomingId('');
      fetchAll();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (authLoading || loading) return (
    <div className="page-container flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>
  );

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Shift Handover</h1>
          <p className="text-xs text-slate-500 mt-0.5">Structured sign-off between shifts — batch status, active alarms, pending readings</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-navy-hover shadow-sm">
          <Plus className="w-4 h-4"/>New Handover
        </button>
      </div>

      {showForm && (
        <div className="card p-6 border-l-4 border-l-navy space-y-4">
          <h3 className="text-sm font-black text-slate-900">Sign Off Shift Handover</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">Incoming Shift Employee</label>
              <select value={incomingId} onChange={e => setIncomingId(e.target.value)} className="field-input bg-white">
                <option value="">Select incoming operator (optional)...</option>
                {employees.filter(e => e.id !== employeeProfile?.id).map(e => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.role})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Handover Notes <span className="text-red-500">*</span></label>
              <textarea value={handoverNotes} onChange={e => setHandoverNotes(e.target.value)} rows={4} required
                placeholder="Summary of what happened this shift — batches in progress, any deviations, observations, next steps for incoming team..."
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none resize-none focus:border-navy"/>
            </div>

            <div>
              <label className="field-label text-red-600">Critical Alerts (if any)</label>
              <textarea value={criticalAlerts} onChange={e => setCriticalAlerts(e.target.value)} rows={2}
                placeholder="Any pH alarms, equipment failures, contamination events, deviations that need immediate attention..."
                className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm font-semibold outline-none resize-none focus:border-red-400"/>
            </div>

            <div>
              <label className="field-label">Pending Readings / Actions</label>
              <textarea value={pendingReadings} onChange={e => setPendingReadings(e.target.value)} rows={2}
                placeholder="e.g. Batch OXY-2026-012 Flask A pH due at T+18h, QC Hold sample waiting for CFU result..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold outline-none resize-none"/>
            </div>

            <p className="text-xs text-slate-400 font-semibold">
              Active batch statuses will be automatically captured from the system when you sign off.
            </p>

            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="px-6 py-2.5 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin"/>Signing Off...</> : <><CheckCircle2 className="w-4 h-4"/>Sign Off Handover</>}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {handovers.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <ArrowRight className="w-10 h-10 mx-auto mb-3 opacity-30"/>
          <p className="font-semibold text-sm">No shift handovers logged yet.</p>
          <p className="text-xs mt-1">Use the button above to sign off at the end of each shift.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {handovers.map(h => (
            <div key={h.id} className="card p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {h.outgoing && <CreatorBadge initials={h.outgoing.initials} fullName={h.outgoing.full_name} size="sm"/>}
                  <ArrowRight className="w-4 h-4 text-slate-400"/>
                  {h.incoming ? <CreatorBadge initials={h.incoming.initials} fullName={h.incoming.full_name} size="sm"/> : <span className="text-xs text-slate-400">Unspecified incoming</span>}
                </div>
                <span className="text-xs text-slate-400 ml-auto">{h.shift_date} · {h.signed_off_at ? new Date(h.signed_off_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>

              {/* Handover notes */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs font-black text-slate-500 uppercase mb-1">Handover Notes</p>
                <p className="text-sm text-slate-800 font-semibold whitespace-pre-line">{h.handover_notes}</p>
              </div>

              {/* Critical alerts */}
              {h.critical_alerts && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-xs font-black text-red-800 uppercase mb-0.5">Critical Alerts</p>
                    <p className="text-xs text-red-700 whitespace-pre-line">{h.critical_alerts}</p>
                  </div>
                </div>
              )}

              {/* Pending readings */}
              {h.pending_readings && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-xs font-black text-amber-800 uppercase mb-0.5">Pending Readings / Actions</p>
                    <p className="text-xs text-amber-700 whitespace-pre-line">{h.pending_readings}</p>
                  </div>
                </div>
              )}

              {/* Batch snapshots */}
              {h.batch_summaries?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase mb-2 flex items-center gap-1"><FlaskConical className="w-3.5 h-3.5"/>Active Batches at Handover ({h.batch_summaries.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {h.batch_summaries.map((b, i) => (
                      <span key={i} className="px-2.5 py-1 bg-navy/5 border border-navy/20 rounded-lg text-xs font-black text-navy">
                        {b.batch_id} · {b.stage?.replace(/_/g,' ')}
                        {b.flasks?.length > 0 && ` (${b.flasks.length} flask${b.flasks.length>1?'s':''})`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
