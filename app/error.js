'use client';

import { useEffect } from 'react';
import { RefreshCcw, AlertTriangle } from 'lucide-react';

export default function GlobalError({ error, reset }) {

  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Next.js Fatal Boundary Caught:", error);
    
    // Attempt to forcefully clear caches to un-stick the app if it's a chunk error
    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
         navigator.serviceWorker.getRegistrations().then(function(registrations) {
           for(let registration of registrations) {
             registration.update();
           }
         });
      }
    }
  }, [error]);

  const handleReset = () => {
    // If standard Next.js reset fails, we force a hard window reload
    try {
      reset();
    } catch {
      window.location.reload();
    }
  };

  const forceHardReload = () => {
    if (typeof window !== 'undefined') {
      // Brutal cache clearing technique for "Black Screen of Death"
      caches.keys().then((names) => {
        for (let name of names) caches.delete(name);
      });
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl border border-red-100 flex flex-col items-center">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500 animate-pulse" />
        </div>
        
        <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-3">Something went wrong!</h1>
        <p className="text-sm font-medium text-slate-500 mb-8 px-4">
          A temporary network or cache error crashed this page. Don&apos;t worry, your data is safe. Let&apos;s get you back on track.
        </p>

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center py-3.5 bg-teal-800 text-white font-bold rounded-xl hover:bg-teal-900 transition-colors shadow-md active:scale-95"
          >
            <RefreshCcw className="w-4 h-4 mr-2" /> Quick Refresh
          </button>
          
          <button
            onClick={forceHardReload}
            className="w-full py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors active:scale-95"
          >
            Clear Local Cache & Force Restart
          </button>
        </div>
        
        <p className="mt-6 text-[10px] font-mono text-slate-400 bg-slate-50 p-2 rounded block whitespace-normal break-all">
          {error?.message || "Unknown rendering exception"}
        </p>
      </div>
    </div>
  );
}
