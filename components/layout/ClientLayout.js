'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PushManager from '../PushManager';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState, useRef } from 'react';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const { loading, sessionExpired, clearSessionExpired } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const navTimerRef = useRef(null);
  const lastPathRef = useRef(pathname);

  // FIX #8: Navigation loading bar — detect route changes via pathname
  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      setNavLoading(true);
      lastPathRef.current = pathname;
      navTimerRef.current = setTimeout(() => setNavLoading(false), 600);
    }
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, [pathname]);

  useEffect(() => {
    // FIX #9: Global unhandled promise rejection logger
    const handleUnhandledRejection = (event) => {
      console.error('[OxyOS] Unhandled Promise Rejection:', event.reason);
      // Prevent the default browser console error doubling
      event.preventDefault();
    };

    // FORCE CACHE BUSTING: Nuke any old Service Workers and Caches that are trapping the app
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection);

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          for (let registration of registrations) {
            registration.update();
          }
        });
        // Register our safe passthrough SW for push notifications
        navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW registration failed:", err));
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      }
    };
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

        {/* FIX #8: Navigation loading bar */}
        {navLoading && (
          <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-teal-100 overflow-hidden">
            <div className="h-full bg-teal-600 animate-pulse w-3/4 transition-all duration-500" />
          </div>
        )}

        {/* FIX #10: Session expiry toast — auto-redirects to login */}
        {sessionExpired && (
          <div className="bg-amber-500 text-white text-xs font-bold px-4 py-2 text-center flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300">
            <span>⚠️ Your session has expired. Redirecting to login…</span>
            <button
              onClick={() => { clearSessionExpired(); window.location.href = '/login'; }}
              className="underline font-black hover:text-amber-100 transition-colors"
            >
              Sign In Now
            </button>
          </div>
        )}

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

