'use client';
import { Printer, Download } from 'lucide-react';

export default function PrintButton() {
  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
      >
        <Printer className="w-4 h-4" />
        Print / Save PDF
      </button>
    </div>
  );
}
