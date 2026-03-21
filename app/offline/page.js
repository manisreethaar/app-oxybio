'use client';
import { AlertTriangle, WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#f5fbfa] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-xl shadow-teal-900/5 ring-1 ring-gray-200">
        <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">You are offline</h1>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          OxyOS requires an active internet connection to securely synchronize with the lab database. Please check your network and try again.
        </p>
        <button onClick={() => window.location.reload()} className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md active:scale-[0.98]">
          Retry Connection
        </button>
      </div>
    </div>
  );
}
