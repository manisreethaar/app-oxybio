'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Skeleton from '../Skeleton';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

const PushManager = dynamic(() => import('../PushManager'), { ssr: false });
const AIChatbot = dynamic(() => import('../AIChatbot'), { ssr: false });
const GlobalSearch = dynamic(() => import('../GlobalSearch'), { ssr: false });
const QuickLogOverlay = dynamic(() => import('../QuickLogOverlay'), { ssr: false });

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const { loading, sessionExpired, clearSessionExpired } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shellExtrasReady, setShellExtrasReady] = useState(false);

  const lastPathRef = useRef(pathname);
  const progressTimerRef = useRef(null);
  const completeTimerRef = useRef(null);

  const startNav = useCallback(() => {
    clearTimeout(progressTimerRef.current);
    clearTimeout(completeTimerRef.current);
    setNavLoading(true);
    setProgress(10);
    let current = 10;
    progressTimerRef.current = setInterval(() => {
      current += Math.random() * 15;
      if (current >= 85) {
        current = 85;
        clearInterval(progressTimerRef.current);
      }
      setProgress(current);
    }, 200);
  }, []);

  const completeNav = useCallback(() => {
    clearInterval(progressTimerRef.current);
    setProgress(100);
    completeTimerRef.current = setTimeout(() => {
      setNavLoading(false);
      setProgress(0);
    }, 300);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (href.startsWith('/') && !href.startsWith('/api') && href !== pathname) {
        startNav();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname, startNav]);

  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      lastPathRef.current = pathname;
      completeNav();
    }
  }, [pathname, completeNav]);

  useEffect(() => {
    return () => {
      clearInterval(progressTimerRef.current);
      clearTimeout(completeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (pathname === '/login') return;
    const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const idleId = scheduleIdle(() => setShellExtrasReady(true));
    return () => cancelIdle(idleId);
  }, [pathname]);

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
      <main className="min-h-screen professional-bg flex items-center justify-center p-4">
        {children}
      </main>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-screen bg-gray-50 overflow-hidden text-gray-900 border-t-4 border-navy">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden pb-20 md:pb-0 relative z-10">
          <TopBar />
          {shellExtrasReady && <PushManager />}

          {navLoading && (
            <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-teal-100">
              <div
                className="h-full bg-teal-600 transition-all duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {sessionExpired && (
            <div className="bg-amber-500 text-white text-xs font-bold px-4 py-2 text-center flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300">
              <span>Your session has expired. Redirecting to login...</span>
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

          <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 scroll-smooth">
            {loading ? (
              <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                  <Skeleton width={250} height={32} />
                  <Skeleton width={120} height={40} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Skeleton className="h-64 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl" />
                  <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
              </div>
            ) : (
              <div key={pathname}>
                {children}
              </div>
            )}
          </main>
        </div>
        {shellExtrasReady && <GlobalSearch />}
        {shellExtrasReady && <AIChatbot />}
        {shellExtrasReady && <QuickLogOverlay />}
      </div>
    </ToastProvider>
  );
}
