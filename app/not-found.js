'use client';
import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <p className="text-[10rem] font-black text-slate-100 leading-none select-none">404</p>
        <div className="-mt-8 relative z-10">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-3">Page not found</h1>
          <p className="text-sm font-medium text-slate-500 mb-8">
            This page doesn&apos;t exist or you don&apos;t have permission to view it.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-navy text-white font-bold rounded-xl hover:bg-navy/90 transition-colors text-sm"
            >
              <Home className="w-4 h-4" /> Go to Dashboard
            </Link>
            <button
              onClick={() => window.history.back()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
