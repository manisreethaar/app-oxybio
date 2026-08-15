'use client';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/context/ToastContext';
import { withTimeout } from '@/lib/withTimeout';
import { XCircle, Lock } from 'lucide-react';

const DISPOSAL = ['Autoclave + Drain', 'Incineration', 'Return for reprocessing', 'Other'];

export default function RejectionPanel({ batch, activeFlask, employeeProfile, role, supabase, onDataSaved }) {
  const toast    = useToast();
  const [record, setRecord]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [pendingReject, setPendingReject] = useState(false);
  const isCeo    = ['ceo','admin'].includes(role);

  const { register, handleSubmit, setValue, watch, reset, getValues } = useForm({
    defaultValues: {
      reason: '', pin: '', stage: '', disposal: 'Autoclave + Drain',
      capaReq: false, notes: '', supplierDefect: false, implicatedLotId: ''
    }
  });

  const watchSupplierDefect = watch('supplierDefect');
  const watchCapaReq = watch('capaReq');
  const watchStage = watch('stage');
  const watchDisposal = watch('disposal');

  const [batchLots,       setBatchLots]       = useState([]);

  const fetch = useCallback(async () => {
    if (!activeFlask?.id) return;
    let isCurrent = true;
    try {
      const [{ data }, mediaPrepIngredients] = await withTimeout(Promise.all([
        supabase.from('batch_flask_rejection_record').select('*').eq('flask_id', activeFlask.id).maybeSingle(),
        supabase.from('batch_media_prep_ingredients').select('stock_id, item_name').eq('batch_id', batch.id),
      ]), 45000, 'Rejection record load timed out');
      if (!isCurrent) return;
      if (data) {
        setRecord(data);
        setValue('supplierDefect', data.supplier_defect||false);
        setValue('implicatedLotId', data.implicated_lot_id||'');
      } else {
        setRecord(null);
        setValue('stage', activeFlask.current_stage || '');
      }
      // Build lot list from every BOM ingredient used in Media Prep (not just
      // ragi/kavuni — any raw material lot can be implicated in a rejection).
      const lotRows = (mediaPrepIngredients.data || []).filter(r => r.stock_id);
      if (lotRows.length) {
        const { data: lots } = await withTimeout(supabase.from('inventory_stock')
          .select('id, supplier_batch_number')
          .in('id', lotRows.map(r => r.stock_id)), 45000, 'Batch lots load timed out');
        const nameByStockId = Object.fromEntries(lotRows.map(r => [r.stock_id, r.item_name]));
        if (lots) setBatchLots(lots.map(l => ({ ...l, inventory_items: { name: nameByStockId[l.id] } })));
      }
    } catch (err) {
      console.error('RejectionPanel fetch error:', err);
    }
    return () => { isCurrent = false; };
  }, [activeFlask?.id, activeFlask?.current_stage, batch.id, supabase]);

  useEffect(() => { setRecord(null); fetch(); }, [fetch]);

  const handleSave = async (formData) => {
    if (!isCeo) return;
    if (!formData.reason.trim()) { toast.warn('Rejection reason is required.'); return; }
    setPendingReject(true);
  };

  const confirmReject = async (formData) => {
    if (!activeFlask) return;
    if (!formData.pin || formData.pin.length < 4) { toast.warn('A valid E-Signature PIN is required.'); return; }
    setPendingReject(false);
    setSaving(true);
    try {
      const { data: rejectionRow, error } = await supabase.from('batch_flask_rejection_record').upsert({
        flask_id: activeFlask.id,
        batch_id: batch.id,
        rejected_by: employeeProfile?.id,
        rejection_reason: formData.reason, rejection_stage: formData.stage || activeFlask.current_stage,
        disposal_method: formData.disposal,
        capa_required: formData.capaReq, notes: formData.notes || null,
        supplier_defect: formData.supplierDefect,
        implicated_lot_id: formData.supplierDefect && formData.implicatedLotId ? formData.implicatedLotId : null,
      }, { onConflict: 'flask_id' }).select('id').single();
      if (error) throw error;

      // The flask's status/current_stage were already set to 'rejected' by
      // advance_flask_stage() when QCHoldPanel triggered the transition —
      // this panel only records the rejection details. The e-signature PIN
      // check + audit-reason logging still runs here, scoped to the
      // rejection record this panel actually owns instead of re-writing
      // batch_flasks through a second, uncoordinated path.
      const { error: rpcError } = await supabase.rpc('update_record_with_reason', {
        target_table: 'batch_flask_rejection_record',
        record_id: rejectionRow.id,
        payload: { rejection_reason: formData.reason },
        reason_text: formData.reason,
        esignature_pin: formData.pin
      });
      if (rpcError) throw rpcError;

      // G-29: advance_flask_stage() already rolls the batch up to 'rejected'
      // automatically once every flask is released/rejected — this just
      // surfaces that as a toast, no separate write needed.
      const { data: allFlasks } = await supabase.from('batch_flasks').select('id,status').eq('batch_id', batch.id);
      const remaining = (allFlasks || []).filter(f => f.id !== activeFlask.id && !['released', 'rejected'].includes(f.status));
      if (remaining.length === 0) {
        toast.warn('All trials rejected — batch marked as rejected.');
      }

      // Always raise a deviation on flask rejection
      await supabase.from('deviations').insert({
        batch_id:    batch.id,
        title:       `Flask ${activeFlask.flask_label} rejected — ${formData.reason.substring(0, 80)}`,
        severity:    formData.supplierDefect ? 'critical' : (formData.capaReq ? 'major' : 'minor'),
        reported_by: employeeProfile?.id,
        status:      'open',
      }).then(()=>{}).catch(()=>{});

      if (formData.capaReq || formData.supplierDefect) {
        await supabase.from('notifications').insert({
          employee_id: employeeProfile?.id,
          title: `CAPA Required — Trial ${activeFlask.flask_label} rejected`,
          message: `Trial ${activeFlask.flask_label} from batch ${batch.batch_id} was rejected. Reason: ${formData.reason}. A deviation has been raised in the CAPA module.`,
          link: '/capa',
        }).then(()=>{}).catch(()=>{});
      }
      toast.success(`Trial ${activeFlask.flask_label} officially rejected. Deviation raised in CAPA.`);
      onDataSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (!activeFlask) return <div className="p-4 text-center text-slate-400">Select a Trial to view Rejection decision.</div>;

  return (
    <div className="space-y-5">
      <div className="card p-5 flex items-center gap-3">
        <XCircle className="w-5 h-5 text-red-600"/>
        <div><h2 className="text-base font-bold text-slate-900">Trial Rejected: <span className="text-red-500">{activeFlask.flask_label}</span></h2>
          <p className="text-xs text-slate-500">Document the root cause for rejection and secure audit trail.</p></div>
      </div>

      {record && (
        <div className="card p-5 space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-center">
            <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2"/>
            <p className="text-sm font-black text-red-800">Trial Rejected</p>
            <p className="text-xs text-red-600">{record.rejection_date ? new Date(record.rejection_date).toLocaleString('en-IN') : ''}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl"><p className="text-slate-400 font-bold uppercase text-xs mb-1">Reason / Root Cause</p><p className="font-semibold text-slate-800">{record.rejection_reason}</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl"><p className="text-slate-400 font-bold uppercase text-xs mb-1">Failed Stage</p><p className="font-bold text-slate-800">{record.rejection_stage?.replace(/_/g,' ') || '—'}</p></div>
              <div className="p-3 bg-slate-50 rounded-xl"><p className="text-slate-400 font-bold uppercase text-xs mb-1">Disposal Method</p><p className="font-bold text-slate-800">{record.disposal_method}</p></div>
            </div>
            {record.supplier_defect && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl font-bold text-amber-800 text-xs">🏭 Supplier defect flagged — Critical deviation raised.</div>
            )}
            {record.capa_required && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl font-bold text-amber-800 text-xs">⚠ CAPA raised — check the CAPA module for the open deviation.</div>
            )}
          </div>
        </div>
      )}

      {!record && (
        <div className="card p-5 space-y-4">
          {!isCeo ? (
            <div className="p-6 bg-slate-50 rounded-2xl text-center">
              <Lock className="w-8 h-8 text-slate-300 mx-auto mb-3"/>
              <p className="text-sm font-bold text-slate-600">Rejection authority restricted to CEO</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-900">Complete rejection record for {activeFlask.flask_label}:</p>
              <div>
                <label className="field-label">Root Cause / Reason <span className="text-red-500">*</span></label>
                <textarea {...register('reason')} rows={3} required placeholder="Describe the reason for rejection (QC failure, contamination)..."
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-xl text-sm font-semibold outline-none resize-none focus:border-red-400"/>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div><label className="field-label">Stage Where Failed</label>
                  <select {...register('stage')} className="field-input bg-white">
                    {['media_prep','sterilisation','inoculation','fermentation','straining','qc_hold'].map(s=>(
                      <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div><label className="field-label">Disposal Method</label>
                <div className="flex flex-wrap gap-2">
                  {DISPOSAL.map(d=>(
                    <button key={d} type="button" onClick={()=>setValue('disposal', d)}
                      className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${watchDisposal===d?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <input type="checkbox" id="supplierDefect" {...register('supplierDefect')} className="w-4 h-4 rounded border-amber-300"/>
                <label htmlFor="supplierDefect" className="text-xs font-bold text-amber-800">Supplier / Raw Material Defect — escalates deviation to Critical</label>
              </div>
              {watchSupplierDefect && batchLots.length > 0 && (
                <div>
                  <label className="field-label">Implicated Lot</label>
                  <select {...register('implicatedLotId')} className="field-input bg-white">
                    <option value="">Select lot...</option>
                    {batchLots.map(l=>(
                      <option key={l.id} value={l.id}>{l.inventory_items?.name} — {l.supplier_batch_number||'No lot#'}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <input type="checkbox" id="capaReq" {...register('capaReq')} className="w-4 h-4 rounded border-slate-300"/>
                <label htmlFor="capaReq" className="text-xs font-bold text-amber-800">Notify CAPA — a deviation is always raised; checking this also sends a CAPA notification</label>
              </div>
              <textarea {...register('notes')} rows={2} placeholder="Additional notes..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold outline-none resize-none"/>
              <button onClick={handleSubmit(handleSave)} disabled={saving} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-sm shadow-sm disabled:opacity-50">
                {saving ? 'Saving...' : `✗ Confirm Rejection of ${activeFlask.flask_label}`}
              </button>
            </>
          )}
        </div>
      )}

      {pendingReject && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-sm shadow-xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Trial Rejection</h3>
            <p className="text-sm text-slate-600 mb-6 text-center">Confirm rejection of {activeFlask.flask_label}? This act is permanent.</p>
            <div className="mb-4 text-left">
              <label className="block text-sm font-medium text-slate-700 mb-1">E-Signature PIN</label>
              <input 
                type="password"
                maxLength={6}
                {...register('pin')}
                placeholder="••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-center tracking-[0.5em] font-mono text-lg focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setPendingReject(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition w-full"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmit(confirmReject)}
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
