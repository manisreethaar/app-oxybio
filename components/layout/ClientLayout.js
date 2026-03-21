'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PushManager from '../PushManager';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const { loading } = useAuth();
  
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW manual registration failed:", err));
    }
  }, []);

  if (pathname === '/login') {
    return <main className="min-h-screen mesh-bg flex items-center justify-center p-4">{children}</main>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-bg text-teal-800">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
          <div className="w-8 h-8 border-4 border-cyan-200 border-t-cyan-500 rounded-full animate-spin absolute top-4 left-4 animation-reverse"></div>
        </div>
      </div>
    );
  }

  if (error || (!loading && pathname !== '/login' && !employeeProfile)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center mesh-bg p-6 text-center">
        <div className="glass-panel p-10 rounded-3xl max-w-md w-full">
          <div className="w-20 h-20 bg-red-50/80 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-red-100">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Sync Restored</h2>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">{error || "The application state was refreshed seamlessly. Please click retry to establish a secure database bridge."}</p>
          <div className="flex flex-col space-y-3">
            <button onClick={() => window.location.reload()} className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-bold py-3.5 rounded-2xl hover:shadow-lg hover:from-teal-500 hover:to-cyan-500 transition-all active:scale-[0.98]">
              Establish Secure Connection
            </button>
            <button onClick={() => {
              localStorage.clear();
              document.cookie.split(";").forEach((c) => {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
              });
              window.location.href = '/login';
            }} className="w-full bg-white/50 text-slate-600 font-bold py-3.5 rounded-2xl border border-white hover:bg-white/80 transition-all active:scale-[0.98]">
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen mesh-bg overflow-hidden text-slate-800">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden pb-16 md:pb-0 relative z-10">
        <TopBar />
        <PushManager />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          {children}
        </main>
      </div>
    </div>
  );
}
