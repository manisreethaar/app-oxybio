'use client';
import { Lock, X } from 'lucide-react';

export default function PinSetupModal({
  showModal,
  pinForm,
  setPinForm,
  pinLoading,
  onSubmit,
  onClose
}) {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 text-slate-800 font-black">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center text-navy shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            Set E-Signature PIN
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Your PIN is used to legally sign 21 CFR Part 11 compliant records. It must be between 4 and 6 digits.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">New PIN</label>
            <input 
              type="password" 
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pinForm.pin}
              onChange={e => setPinForm({...pinForm, pin: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent text-center tracking-[0.5em]"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirm PIN</label>
            <input 
              type="password" 
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pinForm.confirm}
              onChange={e => setPinForm({...pinForm, confirm: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent text-center tracking-[0.5em]"
            />
          </div>

          <button
            onClick={onSubmit}
            disabled={pinLoading || !pinForm.pin || !pinForm.confirm}
            className="w-full py-3 bg-navy text-white rounded-xl text-sm font-bold shadow-md hover:bg-navy-hover transition-all mt-6 active:scale-95 flex items-center justify-center"
          >
            {pinLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Set PIN'}
          </button>
        </div>
      </div>
    </div>
  );
}
