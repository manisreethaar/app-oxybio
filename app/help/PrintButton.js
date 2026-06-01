'use client';
import { Printer, Download } from 'lucide-react';

export default function PrintButton() {
  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
      >
        <Printer className="w-4 h-4" />
        Print / Save PDF
      </button>
    </div>
  );
}
