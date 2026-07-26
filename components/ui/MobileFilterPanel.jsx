'use client';

import { SlidersHorizontal, X } from 'lucide-react';

export default function MobileFilterPanel({ open, onOpen, onClose, children, summary = 'Filters' }) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="md:hidden inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-600 shadow-sm"
      >
        <SlidersHorizontal className="w-4 h-4" />
        {summary}
      </button>
      {open && (
        <div className="md:hidden fixed inset-0 z-[170] bg-slate-900/40 backdrop-blur-sm flex items-end" onClick={onClose}>
          <div
            className="bg-white w-full border-t border-gray-100 shadow-2xl p-4 pb-8 animate-in slide-in-from-bottom duration-200"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-black text-slate-900">Filter & sort</p>
              <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
