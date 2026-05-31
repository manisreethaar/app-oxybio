import { X, AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action', 
  message = 'Are you sure you want to proceed? This cannot be undone.', 
  confirmText = 'Confirm', 
  variant = 'danger' 
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-xl w-full max-w-md shadow-xl relative animate-in fade-in zoom-in duration-200 overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 transition-all">
          <X className="w-5 h-5 text-gray-400"/>
        </button>
        <div className="p-6 pb-0 flex items-start gap-4">
          <div className={`p-3 rounded-full flex-shrink-0 ${variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="p-6 flex flex-col sm:flex-row gap-3 justify-end mt-2">
          <button 
            onClick={onClose} 
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-lg text-sm hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }} 
            className={`px-4 py-2 text-white font-bold rounded-lg text-sm shadow-sm transition-all ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-navy hover:bg-navy-hover'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
