'use client';
import { Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

// Renders `children` once the SOP gate passes; otherwise renders a blocking
// screen (loading spinner while checking, or a "Training Required" card).
// Mirrors the pattern used in app/inventory/components/StockModal.tsx.
export default function SopGate({ checking, isTrained, category, sopLabel, onClose, children }) {
  if (checking) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Checking SOP training status…</p>
      </div>
    );
  }

  if (!isTrained) {
    return (
      <div className="p-12 bg-white flex flex-col items-center text-center gap-6">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Training Required</h3>
          <p className="text-sm text-slate-500 font-medium mt-2 max-w-xs mx-auto">
            To maintain GxP compliance, you must read and sign the <b>{sopLabel || `${category} SOP`}</b> before starting this work.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <Link href="/sops" className="w-full py-4 bg-teal-800 text-white font-black rounded-2xl shadow-lg hover:bg-teal-900 transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
            Open SOP Library
          </Link>
          {onClose && (
            <button onClick={onClose} className="text-xs font-bold text-slate-400 hover:text-slate-600">Close Window</button>
          )}
        </div>
      </div>
    );
  }

  return children;
}
