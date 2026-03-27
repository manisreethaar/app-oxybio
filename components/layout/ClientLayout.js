'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PushManager from '../PushManager';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Skeleton from '../Skeleton';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const { loading, sessionExpired, clearSessionExpired } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const lastPathRef = useRef(pathname);
  const progressTimerRef = useRef(null);
  const completeTimerRef = useRef(null);

  // FIXED: Start progress bar immediately when any link is clicked
  // This gives instant visual feedback BEFORE the page freeze happens
  const startNav = useCallback(() => {
    // Clear any existing timers
    clearTimeout(progressTimerRef.current);
    clearTimeout(completeTimerRef.current);

    setNavLoading(true);
    setProgress(10);

    // Animate progress forward while waiting for page to load
    let current = 10;
    progressTimerRef.current = setInterval(() => {
      current += Math.random() * 15;
      if (current >= 85) {
        current = 85; // Hold at 85% until page actually loads
        clearInterval(progressTimerRef.current);
      }
      setProgress(current);
    }, 200);
  }, []);

  // FIXED: Complete progress bar when pathname actually changes
  const completeNav = useCallback(() => {
    clearInterval(progressTimerRef.current);
    setProgress(100);
    completeTimerRef.current = setTimeout(() => {
      setNavLoading(false);
      setProgress(0);
    }, 300);
  }, []);

  // Detect clicks on any anchor tag or Next.js Link
  useEffect(() => {
    const handleClick = (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Only trigger for internal navigation links
      if (
        href.startsWith('/') &&
        !href.startsWith('/api') &&
        href !== pathname
      ) {
        startNav();
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname, startNav]);

  // Complete the bar when the route actually changes
  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      lastPathRef.current = pathname;
      completeNav();
    }
  }, [pathname, completeNav]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(progressTimerRef.current);
      clearTimeout(completeTimerRef.current);
    };
  }, []);

  // Offline detection
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

  // Service worker + unhandled rejection handler
  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      console.error('[OxyOS] Unhandled Promise Rejection:', event.reason);
      event.preventDefault();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (let r of registrations) r.update();
        });
        navigator.serviceWorker
          .register('/sw.js')
          .catch((err) => console.error('SW registration failed:', err));
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      }
    };
  }, []);

  if (pathname === '/login') {
    return (
      <main className="min-h-screen mesh-bg flex items-center justify-center p-4">
        {children}
      </main>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden text-gray-900 border-t-4 border-navy">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden pb-16 md:pb-0 relative z-10">
        <TopBar />
        <PushManager />

        {/* FIXED: Progress bar starts on click, not after page loads */}
        {navLoading && (
          <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-teal-100">
            <div
              className="h-full bg-teal-600 transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Session expiry toast */}
        {sessionExpired && (
          <div className="bg-amber-500 text-white text-xs font-bold px-4 py-2 text-center flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300">
            <span>⚠️ Your session has expired. Redirecting to login…</span>
            <button
              onClick={() => {
                clearSessionExpired();
                window.location.href = '/login';
              }}
              className="underline font-black hover:text-amber-100 transition-colors"
            >
              Sign In Now
            </button>
          </div>
        )}

        {/* Offline banner */}
        {isOffline && (
          <div className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest py-1.5 px-4 text-center animate-in slide-in-from-top duration-300 flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            Offline Mode: Check-ins and Logs will fail until reconnected.
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading-skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <Skeleton width={250} height={32} />
                  <Skeleton width={120} height={40} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Skeleton className="h-64 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}