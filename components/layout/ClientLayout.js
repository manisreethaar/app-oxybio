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
    // FORCE CACHE BUSTING: Nuke any old Service Workers and Caches that are trapping the app
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          // If it's not our exact safe SW, or we just want to force update
          registration.update();
        }
      });
      
      // Register our safe passthrough SW for push notifications
      navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW registration failed:", err));
    }
  }, []);

  if (pathname === '/login') {
    return <main className="min-h-screen mesh-bg flex items-center justify-center p-4">{children}</main>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center mesh-bg gap-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-teal-100 border-t-teal-600 rounded-full animate-spin shadow-lg"></div>
          <p className="text-teal-900 font-black uppercase tracking-widest text-[10px] animate-pulse">Establishing Secure Session...</p>
        </div>
        
        {/* EMERGENCY RECOVERY: If stuck for too long, allow user to force a clean reload */}
        <button 
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.reload(true);
            }
          }}
          className="px-4 py-2 bg-white/50 backdrop-blur border border-teal-100 rounded-lg text-[10px] font-bold text-teal-700 hover:bg-teal-50 transition-all opacity-0 animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-[5000ms] fill-mode-forwards"
        >
          Taking too long? Force Reload
        </button>
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
