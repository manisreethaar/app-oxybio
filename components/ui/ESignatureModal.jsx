'use client';
import { useState } from 'react';
import { Lock, X, AlertCircle } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ESignatureModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  title = "Electronic Signature Required", 
  message = "Please enter your 4-6 digit PIN to authorize this action. This constitutes a legally binding electronic signature under 21 CFR Part 11."
}) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin) {
      setError('PIN is required.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Invalid PIN');
      }
      
      setPin('');
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No user email found");
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      
      if (resetError) throw resetError;
      
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 text-slate-800 font-black">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center text-navy shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            {title}
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <p className="text-sm text-slate-600 font-medium">
            {message}
          </p>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Authorization PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy text-center text-2xl tracking-[0.5em] font-black transition-all"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-xl border border-red-100">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}
          
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !pin}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-navy hover:bg-navy-hover rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                'Sign & Authorize'
              )}
            </button>
          </div>
          
          <div className="text-center mt-4">
            {resetSent ? (
               <p className="text-xs text-emerald-600 font-bold">Reset link sent to your email!</p>
            ) : (
              <button type="button" onClick={handleReset} className="text-xs text-navy hover:underline font-bold">
                Forgot PIN? Send reset link
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
