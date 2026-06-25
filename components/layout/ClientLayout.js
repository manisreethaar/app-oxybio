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
      <div className="min-h-screen bg-mesh-light text-zinc-900 relative overflow-hidden flex">
        <Sidebar />
        <div className="flex flex-col flex-1 w-full relative z-10 md:ml-[90px] transition-all duration-300">
          <TopBar />
          {shellExtrasReady && <PushManager />}

          {navLoading && (
            <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-accent/20">
              <div
                className="h-full bg-accent transition-all duration-200 ease-out shadow-[0_0_10px_rgba(14,165,233,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {sessionExpired && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 text-white text-xs font-bold px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300">
              <span>Your session has expired.</span>
              <button
                onClick={() => { clearSessionExpired(); window.location.href = '/login'; }}
                className="text-accent hover:text-sky-300 transition-colors"
              >
                Sign In
              </button>
            </div>
          )}

          {isOffline && (
            <div className="bg-red-500 text-white text-[10px] font-black uppercase tracking-widest py-1.5 px-4 text-center flex items-center justify-center gap-2 relative z-50">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              Offline Mode
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-4 md:p-10 pt-20 md:pt-10 scroll-smooth h-screen custom-scrollbar relative">
            {loading ? (
              <div className="space-y-6 animate-fade-in max-w-[90rem] mx-auto">
                <div className="flex justify-between items-center">
                  <Skeleton width={250} height={32} />
                  <Skeleton width={120} height={40} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Skeleton className="h-64 w-full rounded-3xl" />
                  <Skeleton className="h-64 w-full rounded-3xl" />
                  <Skeleton className="h-64 w-full rounded-3xl" />
                </div>
              </div>
            ) : (
              <div key={pathname} className="animate-page-enter max-w-[90rem] mx-auto">
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
