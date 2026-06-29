'use client';
import { X, Loader2 } from 'lucide-react';

/**
 * PasswordModal — inline password update modal for the profile page.
 */
export default function PasswordModal({
  showPasswordModal,
  passwordForm,
  setPasswordForm,
  passwordLoading,
  onSubmit,
  onClose,
}) {
  if (!showPasswordModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[2rem] w-full max-w-sm shadow-2xl relative animate-in fade-in zoom-in duration-200 p-5 md:p-8">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-all">
          <X className="w-5 h-5 text-gray-400"/>
        </button>
        <h3 className="text-xl font-black text-slate-800 mb-1">Update Password</h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Security Access Control</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">New Password</label>
            <input
              required type="password"
              value={passwordForm.password}
              onChange={e => setPasswordForm({...passwordForm, password: e.target.value})}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-slate-600 transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Confirm Password</label>
            <input
              required type="password"
              value={passwordForm.confirm}
              onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-slate-600 transition-all outline-none"
            />
          </div>
          <button
            disabled={passwordLoading} type="submit"
            className="w-full py-4 bg-slate-800 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-slate-900 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
