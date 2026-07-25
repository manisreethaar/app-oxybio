'use client';
import { useState } from 'react';
import { FileWarning, X, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function ReasonModal({ isOpen, onClose, onSuccess, title = "Reason for Change Required", message = "Please provide a justification for this modification." }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      toast.warn("Please provide a more detailed reason (min 5 characters).");
      return;
    }
    setSubmitting(true);
    try {
      await onSuccess(reason);
      setReason('');
    } catch (err) {
      // Error handled by parent usually
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 text-slate-800 font-black">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
              <FileWarning className="w-4 h-4" />
            </div>
            {title}
          </div>
          <button onClick={onClose} disabled={submitting} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            {message}
          </p>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Justification / Reason</label>
            <textarea 
              rows={3}
              placeholder="e.g. Correcting a transcription error..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || reason.trim().length < 5}
              className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-amber-700 transition-all active:scale-95 flex items-center justify-center"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Change'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
