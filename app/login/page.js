'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [view, setView] = useState('login'); // 'login' | 'forgot_password'
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (view === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message || 'Unable to sign in. Please try again.'); }
        else { router.push('/dashboard'); }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) { setError(error.message || 'Unable to send reset link. Please try again.'); }
        else { setMessage('Password reset link has been sent to your email.'); }
      }
    } catch (err) { setError('An unexpected error occurred. Please try again.'); } 
    finally { setLoading(false); }
  };

  return (
    <div className="w-full max-w-md mx-auto z-10">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-navy text-white font-bold text-2xl mb-4 shadow-lg border-2 border-white/20">
          O₂
        </div>
        <h1 className="text-3xl font-black text-navy tracking-tight mb-1">OxyOS</h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Operational Neural Cloud</p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="bg-white rounded-[2rem] p-5 md:p-8 md:p-6 md:p-8 shadow-2xl shadow-navy/10 border border-gray-100"
      >
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 border-l-4 border-navy pl-4">
            {view === 'login' ? 'Sign In' : 'Reset Password'}
          </h2>
          <p className="text-xs font-medium text-gray-500 mt-1 pl-5">
            {view === 'login' 
              ? 'Enter your credentials to access the node.'
              : 'Enter your email to receive a password reset link.'}
          </p>
        </div>
        
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-[11px] font-bold border border-red-100 flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            {error}
          </motion.div>
        )}

        {message && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 rounded-xl bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100 flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            {message}
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-4 focus:ring-navy/5 focus:border-navy outline-none transition-all font-semibold text-sm"
              required
              disabled={loading}
              placeholder="e.g. name@oxybio.in"
            />
          </div>

          {view === 'login' && (
            <div>
              <div className="flex justify-between items-end mb-1.5">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Password</label>
                <button
                  type="button"
                  onClick={() => { setView('forgot_password'); setError(null); setMessage(null); }}
                  className="text-[10px] font-bold text-navy hover:text-navy-hover transition-all"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-4 focus:ring-navy/5 focus:border-navy outline-none transition-all font-semibold text-sm pr-12"
                  required={view === 'login'}
                  disabled={loading}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy transition-all"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-4 bg-navy hover:bg-navy-hover text-white font-bold rounded-xl shadow-lg shadow-navy/20 transition-all active:scale-[0.98] disabled:opacity-50 text-sm flex justify-center items-center"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (view === 'login' ? 'Continue to Platform' : 'Send Reset Link')}
          </button>

          <div className="text-center pt-2">
            {view === 'login' ? (
              <button type="button" className="text-[10px] font-bold text-gray-400 hover:text-navy transition-all uppercase tracking-widest">
                Need access? Contact Admin
              </button>
            ) : (
              <button 
                type="button" 
                onClick={() => { setView('login'); setError(null); setMessage(null); }}
                className="text-[10px] font-bold text-gray-400 hover:text-navy transition-all uppercase tracking-widest"
              >
                Back to Sign In
              </button>
            )}
          </div>
        </form>
      </motion.div>
      
      <div className="text-center mt-10 space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
          Powered by Oxygen Bioinnovations
        </p>
        <div className="flex justify-center gap-4 text-[9px] font-black text-gray-300 uppercase tracking-widest">
           <span>Terms</span>
           <span>Privacy</span>
           <span>Security</span>
        </div>
      </div>
    </div>
  );
}

