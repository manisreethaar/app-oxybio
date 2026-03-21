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
      <div className="min-h-screen flex items-center justify-center mesh-bg">
        <div className="w-14 h-14 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
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
