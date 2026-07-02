'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Skeleton from '../Skeleton';

const PushManager    = dynamic(() => import('../PushManager'),    { ssr: false });
const AIChatbot      = dynamic(() => import('../AIChatbot'),      { ssr: false });
const GlobalSearch   = dynamic(() => import('../GlobalSearch'),   { ssr: false });
const QuickLogOverlay = dynamic(() => import('../QuickLogOverlay'), { ssr: false });

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const { loading, sessionExpired, clearSessionExpired } = useAuth();
  const [isOffline, setIsOffline]       = useState(false);
  const [navLoading, setNavLoading]     = useState(false);
  const [progress, setProgress]         = useState(0);
  const [shellExtrasReady, setShellExtrasReady] = useState(false);

  const lastPathRef      = useRef(pathname);
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
      if (current >= 85) { current = 85; clearInterval(progressTimerRef.current); }
      setProgress(current);
    }, 200);
  }, []);

  const completeNav = useCallback(() => {
    clearInterval(progressTimerRef.current);
    setProgress(100);
    completeTimerRef.current = setTimeout(() => { setNavLoading(false); setProgress(0); }, 300);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href?.startsWith('/') && !href.startsWith('/api') && href !== pathname) startNav();
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname, startNav]);

  useEffect(() => {
    if (pathname !== lastPathRef.current) { lastPathRef.current = pathname; completeNav(); }
  }, [pathname, completeNav]);

  useEffect(() => () => { clearInterval(progressTimerRef.current); clearTimeout(completeTimerRef.current); }, []);

  useEffect(() => {
    if (pathname === '/login') return;
    const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
    const cancelIdle   = window.cancelIdleCallback   || clearTimeout;
    const idleId = scheduleIdle(() => setShellExtrasReady(true));
    return () => cancelIdle(idleId);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    const on  = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const handleUnhandledRejection = (event) => { console.error('[OxyOS] Unhandled Promise Rejection:', event.reason); event.preventDefault(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.update()));
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
      }
    }
    return () => { if (typeof window !== 'undefined') window.removeEventListener('unhandledrejection', handleUnhandledRejection); };
  }, []);

  /* ── Login page — no shell ───────────────────────── */
  if (pathname === '/login') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f172a 60%, #0a0f1e 100%)' }}>
        {children}
      </main>
    );
  }

  /* ── Main shell ──────────────────────────────────── */
  return (
    <ToastProvider>
      {/* Root canvas */}
      <div className="min-h-screen flex relative overflow-x-hidden" style={{ background: '#F4F6F9' }}>

        {/* Decorative background blobs */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div style={{
            position: 'absolute', top: '-20%', right: '-10%',
            width: '600px', height: '600px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(148,163,184,0.05) 0%, transparent 70%)',
          }} />
          <div style={{
            position: 'absolute', bottom: '-15%', left: '5%',
            width: '500px', height: '500px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(100,116,139,0.04) 0%, transparent 70%)',
          }} />
        </div>

        {/* Sidebar */}
        <Sidebar />

        {/* Main content column */}
        <div className="flex flex-col flex-1 min-w-0 md:ml-[64px] relative z-10">
          <TopBar />
          {shellExtrasReady && <PushManager />}

          {/* Nav progress bar */}
          {navLoading && (
            <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px]" style={{ background: 'transparent' }}>
              <div className="h-full transition-all duration-200 ease-out"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #0EA5E9, #6366F1)',
                  boxShadow: '0 0 12px rgba(14,165,233,0.7)',
                }}
              />
            </div>
          )}

          {/* Session expired toast */}
          {sessionExpired && (
            <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300"
              style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-[13px] font-semibold text-white/80">Session expired.</span>
              <button onClick={() => { clearSessionExpired(); window.location.href = '/login'; }}
                className="text-[12px] font-black text-slate-400 hover:text-slate-300 transition-colors">Sign In →</button>
            </div>
          )}

          {/* Offline banner */}
          {isOffline && (
            <div className="fixed top-0 left-0 right-0 z-[80] flex items-center justify-center gap-2 py-2 text-[11px] font-black uppercase tracking-widest text-white"
              style={{ background: 'linear-gradient(90deg,#ef4444,#dc2626)' }}>
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              Offline — Some features unavailable
            </div>
          )}

          {/* Page content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 pt-[76px] pb-[72px] md:pb-8 min-h-screen">
            {loading ? (
              <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pt-2">
                <div className="flex justify-between items-center">
                  <Skeleton width={220} height={28} />
                  <Skeleton width={110} height={36} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Skeleton className="lg:col-span-2 h-72 w-full rounded-2xl" />
                  <Skeleton className="h-72 w-full rounded-2xl" />
                </div>
              </div>
            ) : (
              <div key={pathname} className="max-w-7xl mx-auto">
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
