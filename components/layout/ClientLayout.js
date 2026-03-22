'use client';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PushManager from '../PushManager';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const { loading } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  if (pathname === '/login') {
    return <main className="min-h-screen mesh-bg flex items-center justify-center p-4">{children}</main>;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden text-gray-900 border-t-4 border-navy">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden pb-16 md:pb-0 relative z-10">
        <TopBar />
        <PushManager />
        
        {isOffline && (
          <div className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest py-1.5 px-4 text-center animate-in slide-in-from-top duration-300 flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            Offline Mode: Check-ins and Logs will fail until reconnected.
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          {loading ? (
            <div className="flex justify-center items-center h-full min-h-[50vh]">
              <Loader2 className="w-10 h-10 animate-spin text-navy" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
