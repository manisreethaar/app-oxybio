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
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); } 
      else { router.push('/dashboard'); }
    } catch (err) { setError('An unexpected error occurred. Please try again.'); } 
    finally { setLoading(false); }
  };

  return (
    <div className="w-full max-w-md mx-auto z-50">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] bg-gradient-to-br from-teal-400 to-teal-800 text-white font-black text-3xl mb-6 shadow-2xl shadow-teal-500/20 ring-4 ring-white/20 animate-pulse">
          O₂
        </div>
        <h1 className="text-4xl font-black text-white tracking-tighter mb-2">OxyOS</h1>
        <p className="text-sm font-bold text-teal-300 uppercase tracking-[0.3em] opacity-80">Enterprise Neural Cloud</p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="bg-white/10 backdrop-blur-2xl rounded-[2.5rem] p-10 shadow-2xl shadow-black/40 border border-white/20 ring-1 ring-white/10"
      >
        <h2 className="text-xl font-black text-white mb-8 text-center uppercase tracking-widest">Authentication</h2>
        
        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 p-4 rounded-2xl bg-red-500/20 text-red-100 text-xs font-bold border border-red-500/30 backdrop-blur-md text-center"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-teal-300/60 uppercase tracking-widest ml-1">Terminal ID (Email)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-teal-700/50 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500/50 outline-none transition-all font-bold text-sm"
              required
              disabled={loading}
              placeholder="operator@oxy.bio"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-teal-300/60 uppercase tracking-widest ml-1">Access Key (Password)</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-teal-700/50 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500/50 outline-none transition-all font-bold text-sm pr-12"
                required
                disabled={loading}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-all"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full group relative flex justify-center items-center py-5 px-4 overflow-hidden rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-teal-900/40 transition-all active:scale-95 disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login Secure'}
          </button>

          <div className="text-center">
            <a href="#" className="text-[10px] font-black text-teal-300/80 hover:text-teal-300 underline underline-offset-4 transition-all uppercase tracking-widest">Forgot Password?</a>
          </div>
        </form>
      </motion.div>
      
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1 }}
        className="text-center text-[10px] font-black text-teal-100 uppercase tracking-[0.2em] mt-10"
      >
        Oxygen Bioinnovations Operational Stack v2.4
      </motion.p>
    </div>
  );
}

