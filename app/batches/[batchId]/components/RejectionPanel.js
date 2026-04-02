'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { XCircle, Lock } from 'lucide-react';

const DISPOSAL = ['Autoclave + Drain', 'Incineration', 'Return for reprocessing', 'Other'];

export default function RejectionPanel({ batch, employeeProfile, role, supabase, onDataSaved }) {
  const toast    = useToast();
  const [record, setRecord]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [pendingReject, setPendingReject] = useState(false);
  const isCeo    = ['ceo','admin'].includes(role);

  const [reason,   setReason]   = useState('');
  const [stage,    setStage]    = useState(batch.current_stage || '');
  const [disposal, setDisposal] = useState('Autoclave + Drain');
  const [writeOff, setWriteOff] = useState('');
  const [capaReq,  setCapaReq]  = useState(false);
  const [notes,    setNotes]    = useState('');

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('batch_rejection_record').select('*').eq('batch_id', batch.id).single();
    if (data) setRecord(data);
  }, [batch.id, supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    if (!reason.trim()) { toast.warn('Rejection reason is required.'); return; }
    setPendingReject(true);
  };

  const confirmReject = async () => {
    setPendingReject(false);
    setSaving(true);
    try {
      const { error } = await supabase.from('batch_rejection_record').upsert({
        batch_id: batch.id, rejected_by: employeeProfile?.id,
        rejection_reason: reason, rejection_stage: stage || batch.current_stage,
        disposal_method: disposal, write_off_vol_ml: writeOff ? parseFloat(writeOff) : null,
        capa_required: capaReq, notes: notes || null,
      });
      if (error) throw error;
      // Send notification if CAPA required (create a placeholder — full CAPA link in Phase 5)
      if (capaReq) {
        await supabase.from('notifications').insert({
          title: `CAPA Required — Batch ${batch.batch_id} rejected`,
          message: `Batch ${batch.batch_id} was rejected. Reason: ${reason}. Raise CAPA in the Compliance module.`,
          type: 'action',
          link: '/compliance',
        }).then(()=>{}).catch(()=>{});
      }
      toast.success('Batch rejected and rejection record saved.');
      onDataSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="surface p-5 flex items-center gap-3">
        <XCircle className="w-5 h-5 text-red-600"/>
        <div><h2 className="text-base font-bold text-gray-900">Batch Rejected</h2>
          <p className="text-xs text-gray-500">Document the reason for rejection and disposal method for audit trail.</p></div>
      </div>

      {record && (
        <div className="surface p-5 space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-center">
            <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2"/>
            <p className="text-sm font-black text-red-800">Batch Rejected</p>
            <p className="text-xs text-red-600">{record.rejected_at ? new Date(record.rejected_at).toLocaleString('en-IN') : ''}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Reason</p><p className="font-semibold text-gray-800">{record.rejection_reason}</p></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Stage</p><p className="font-bold text-gray-800">{record.rejection_stage?.replace(/_/g,' ') || '—'}</p></div>
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Disposal</p><p className="font-bold text-gray-800">{record.disposal_method}</p></div>
              <div className="p-3 bg-gray-50 rounded-xl"><p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Write-off</p><p className="font-bold text-gray-800">{record.write_off_vol_ml || '—'} ml</p></div>
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
              <p className="text-sm font-bold text-gray-900">Complete rejection record:</p>
              <div>
                <label className="field-label">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} required placeholder="Describe the reason for rejection (QC failure, contamination, process deviation)..."
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-xl text-sm font-semibold outline-none resize-none focus:border-red-400"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Stage Where Failed</label>
                  <select value={stage} onChange={e=>setStage(e.target.value)} className="field-input bg-white">
                    {['media_prep','sterilisation','inoculation','fermentation','straining','extract_addition','qc_hold'].map(s=>(
                      <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                    ))}
                  </select>
                </div>
                <div><label className="field-label">Write-off Volume (ml)</label><input type="number" step="1" value={writeOff} onChange={e=>setWriteOff(e.target.value)} className="field-input" placeholder="0"/></div>
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
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Additional rejection notes..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              <button onClick={handleSave} disabled={saving||!reason.trim()} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-50">
                {saving ? 'Saving...' : '✗ Confirm Rejection'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Rejection Modal */}
      {pendingReject && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Batch Rejection</h3>
            <p className="text-sm text-gray-600 mb-6 text-center">Confirm batch rejection? This act is permanent and will formally log the rejection for QA trailing.</p>
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
