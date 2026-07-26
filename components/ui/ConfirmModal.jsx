'use client';
import { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action', 
  message = 'Are you sure you want to proceed? This cannot be undone.', 
  confirmText = 'Confirm', 
  variant = 'danger',
  requireInput = false,
  inputPlaceholder = 'Reason...',
  inputLabel = 'Please provide a reason:',
  loadingText = 'Processing...'
}) {
  const [confirming, setConfirming] = useState(false);
  const [inputValue, setInputValue] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (requireInput && !inputValue.trim()) return;
    try {
      setConfirming(true);
      await onConfirm(inputValue);
      setInputValue('');
      onClose();
    } catch (err) {
      // onConfirm already handles errors via toast in the parent
      console.error('[ConfirmModal] onConfirm error:', err);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50/10 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-md shadow-xl relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          disabled={confirming}
          className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-slate-100 transition-all disabled:opacity-50"
        >
          <X className="w-5 h-5 text-slate-400"/>
        </button>
        <div className="p-6 pb-0 flex items-start gap-4">
          <div className={`p-3 rounded-full flex-shrink-0 ${variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-600'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        {requireInput && (
          <div className="px-6 mt-4">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">{inputLabel}</label>
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </div>
        )}
        <div className="p-6 flex flex-col sm:flex-row gap-3 justify-end mt-2">
          <button 
            onClick={onClose}
            disabled={confirming}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={confirming || (requireInput && !inputValue.trim())}
            className={`px-4 py-2 text-white font-bold rounded-lg text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-navy hover:bg-navy-hover'}`}
          >
            {confirming ? (
              <><Loader2 className="w-4 h-4 animate-spin"/> {loadingText}</>
            ) : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
