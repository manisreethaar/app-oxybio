'use client';
import { useState } from 'react';
import { Edit3, Loader2, X, Trash2, SendHorizonal } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

/**
 * Drop-in button that opens an edit modal and submits to /api/edit-request.
 *
 * Required props:
 *  tableName    – e.g. "tasks"
 *  recordId     – UUID of the record
 *  moduleLabel  – Human-readable label, e.g. "Tasks"
 *  fields       – Array of { key, label, type?, options? } describing editable fields
 *  currentData  – Object with current field values (keyed by field.key)
 *
 * Optional props:
 *  onSuccess    – Called after successful submission
 *  allowDelete  – Show a delete request option (default false)
 *  className    – Extra classes on the trigger button
 *  hasPending   – If true, shows a "pending review" badge instead of the button
 */
export default function EditRequestButton({
  tableName,
  recordId,
  moduleLabel,
  fields = [],
  currentData = {},
  onSuccess,
  allowDelete = false,
  className = '',
  hasPending = false,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('edit'); // 'edit' | 'delete'
  const [formData, setFormData] = useState({});
  const [deleteReason, setDeleteReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  function openModal(m) {
    setMode(m);
    setFormData(Object.fromEntries(fields.map(f => [f.key, currentData[f.key] ?? ''])));
    setDeleteReason('');
    setError('');
    setOpen(true);
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const body = {
        table_name: tableName,
        record_id: recordId,
        module_label: moduleLabel,
        change_type: mode,
      };

      if (mode === 'edit') {
        const proposed = {};
        fields.forEach(f => {
          if (String(formData[f.key] ?? '') !== String(currentData[f.key] ?? '')) {
            proposed[f.key] = formData[f.key];
          }
        });
        if (Object.keys(proposed).length === 0) {
          setError('No changes detected. Modify at least one field.');
          setSubmitting(false);
          return;
        }
        body.proposed_data = proposed;
      }

      const res = await fetch('/api/edit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      setOpen(false);
      toast.success(mode === 'edit' ? 'Edit request submitted successfully.' : 'Archive request submitted successfully.');
      onSuccess?.();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (hasPending) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-black uppercase tracking-widest">
        <Loader2 className="w-3 h-3 animate-spin" />
        Pending Review
      </span>
    );
  }

  return (
    <>
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <button
          onClick={() => openModal('edit')}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white/70 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-500 hover:text-amber-700 rounded-lg text-xs font-bold transition-all"
          title="Request an edit"
        >
          <Edit3 className="w-3 h-3" />
          Edit
        </button>
        {allowDelete && (
          <button
            onClick={() => openModal('delete')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white/70 hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-700 rounded-lg text-xs font-bold transition-all"
            title="Request deletion"
          >
            <Trash2 className="w-3 h-3" />
            Archive
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-black text-slate-800 mb-0.5">
              {mode === 'edit' ? 'Request an Edit' : 'Request Archive'}
            </h2>
            <p className="text-xs text-slate-400 font-medium mb-5">
              {mode === 'edit'
                ? `Changes will be reviewed by an admin before taking effect — ${moduleLabel}`
                : `An admin must approve this deletion — ${moduleLabel}`}
            </p>

            {error && (
              <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 font-medium">
                {error}
              </div>
            )}

            {mode === 'edit' ? (
              <div className="space-y-4">
                {fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                      {f.label}
                    </label>
                    {f.type === 'select' ? (
                      <select
                        value={formData[f.key] ?? ''}
                        onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-amber-400"
                      >
                        {(f.options || []).map(o => (
                          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
                        ))}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={formData[f.key] ?? ''}
                        onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-amber-400 resize-none"
                      />
                    ) : f.type === 'date' ? (
                      <input
                        type="date"
                        value={formData[f.key] ?? ''}
                        onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-amber-400"
                      />
                    ) : (
                      <input
                        type={f.type || 'text'}
                        value={formData[f.key] ?? ''}
                        onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-amber-400"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-sm text-red-700 font-semibold">
                    You are requesting to archive this {moduleLabel} record.
                    Permanent delete is only available from Archived after approval.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Reason for archive
                  </label>
                  <textarea
                    rows={3}
                    value={deleteReason}
                    onChange={e => setDeleteReason(e.target.value)}
                    placeholder="Why should this record be archived?"
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-red-300 resize-none"
                  />
                </div>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || (mode === 'delete' && deleteReason.trim().length < 5)}
              className={`mt-6 w-full py-3 font-black text-sm text-white rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${
                mode === 'edit'
                  ? 'bg-gradient-to-br from-amber-500 to-amber-500 hover:from-amber-400 hover:to-amber-400'
                  : 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500'
              }`}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
              {submitting
                ? 'Submitting...'
                : mode === 'edit'
                ? 'Submit for Approval'
                : 'Request Archive'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
