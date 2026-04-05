'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { XCircle, Lock } from 'lucide-react';

const DISPOSAL = ['Autoclave + Drain', 'Incineration', 'Return for reprocessing', 'Other'];

export default function RejectionPanel({ batch, activeFlask, employeeProfile, role, supabase, onDataSaved }) {
  const toast    = useToast();
  const [record, setRecord]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [pendingReject, setPendingReject] = useState(false);
  const isCeo    = ['ceo','admin'].includes(role);

  const [reason,   setReason]   = useState('');
  const [stage,    setStage]    = useState('');
  const [disposal, setDisposal] = useState('Autoclave + Drain');
  const [capaReq,  setCapaReq]  = useState(false);
  const [notes,    setNotes]    = useState('');

  const fetch = useCallback(async () => {
    if (!activeFlask) return;
    const { data } = await supabase.from('batch_flask_rejection_record').select('*').eq('flask_id', activeFlask.id).single();
    if (data) setRecord(data);
    else {
      setRecord(null);
      setStage(activeFlask.current_stage || '');
    }
  }, [activeFlask, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    if (!isCeo) return;
    if (!reason.trim()) { toast.warn('Rejection reason is required.'); return; }
    setPendingReject(true);
  };

  const confirmReject = async () => {
    if (!activeFlask) return;
    setPendingReject(false);
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_flask_rejection_record').upsert({
        flask_id: activeFlask.id, batch_id: batch.id,
        rejected_by: employeeProfile?.id,
        root_cause: reason, rejection_stage: stage || activeFlask.current_stage,
        disposal_method: disposal,
        capa_required: capaReq, notes: notes || null,
      }, { onConflict: 'flask_id' });
      if (error) throw error;
      
      // Update flask status
      await supabase.from('batch_flasks').update({ status: 'rejected' }).eq('id', activeFlask.id);

      if (capaReq) {
        await supabase.from('notifications').insert({
          title: `CAPA Required — Trial ${activeFlask.flask_label} rejected`,
          message: `Trial ${activeFlask.flask_label} from batch ${batch.batch_id} was rejected. Reason: ${reason}.`,
          type: 'action',
          link: '/compliance',
        }).then(()=>{}).catch(()=>{});
      }
      toast.success(`Trial ${activeFlask.flask_label} officially rejected.`);
      onDataSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-gray-400">Select a Trial to view Rejection decision.</div>;

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <XCircle className="w-5 h-5 text-red-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Trial Rejected: <span className="text-red-500">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-gray-500">Document the root cause for rejection and secure audit trail.</p></div>
      </div>

      {record && (
        <div className="surface p-5 space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-center">
            <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2"/>
            <p className="text-sm font-black text-red-800">Trial Rejected</p>
            <p className="text-xs text-red-600">{record.rejection_date ? new Date(record.rejection_date).toLocaleString('en-IN') : ''}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Reason / Root Cause</p><p className="font-semibold text-gray-800">{record.root_cause}</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Failed Stage</p><p className="font-bold text-gray-800">{record.rejection_stage?.replace(/_/g,' ') || '—'}</p></div>
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Disposal Method</p><p className="font-bold text-gray-800">{record.disposal_method}</p></div>
            </div>
            {record.capa_required && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl font-bold text-amber-800 text-xs">⚠ CAPA required — raise in Compliance module.</div>
            )}
          </div>
        </div>
      )}

      {!record && (
        <div className="surface p-5 space-y-4">
          {!isCeo ? (
            <div className="p-6 bg-gray-50 rounded-2xl text-center">
              <Lock className="w-8 h-8 text-gray-300 mx-auto mb-3"/>
              <p className="text-sm font-bold text-gray-600">Rejection authority restricted to CEO</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-gray-900">Complete rejection record for {activeFlask.flask_label}:</p>
              <div>
                <label className="field-label">Root Cause / Reason <span className="text-red-500">*</span></label>
                <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} required placeholder="Describe the reason for rejection (QC failure, contamination)..."
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-xl text-sm font-semibold outline-none resize-none focus:border-red-400"/>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div><label className="field-label">Stage Where Failed</label>
                  <select value={stage} onChange={e=>setStage(e.target.value)} className="field-input bg-white">
                    {['media_prep','sterilisation','inoculation','fermentation','straining','extract_addition','qc_hold'].map(s=>(
                      <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div><label className="field-label">Disposal Method</label>
                <div className="flex flex-wrap gap-2">
                  {DISPOSAL.map(d=>(
                    <button key={d} type="button" onClick={()=>setDisposal(d)}
                      className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${disposal===d?'bg-gray-800 text-white border-gray-800':'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <input type="checkbox" id="capaReq" checked={capaReq} onChange={e=>setCapaReq(e.target.checked)} className="w-4 h-4 rounded border-gray-300"/>
                <label htmlFor="capaReq" className="text-xs font-bold text-amber-800">CAPA Required — raise corrective action in Compliance after this</label>
              </div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Additional notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              <button onClick={handleSave} disabled={saving||!reason.trim()} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-50">
                {saving ? 'Saving...' : `✗ Confirm Rejection of ${activeFlask.flask_label}`}
              </button>
            </>
          )}
        </div>
      )}

      {pendingReject && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Trial Rejection</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Confirm rejection of {activeFlask.flask_label}? This act is permanent.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingReject(false)}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={confirmReject}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition w-full"
              >
                ✗ Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
