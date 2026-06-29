'use client';
import { useState } from 'react';
import { CheckCircle2, FlaskConical, LayoutDashboard, Search, Upload } from 'lucide-react';

export default function ThemePreview() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12 bg-slate-50 min-h-screen">
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Button Accent Color Comparison</h1>
        <p className="text-slate-500 mt-2">Here are 4 different accent colors for primary buttons, active badges, and input rings that pair perfectly with your White & Slate theme.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
        
        {/* OPTION 1: PURE SLATE */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <div className="bg-slate-50 border-b border-slate-200 p-4">
            <h2 className="text-lg font-black text-slate-800">1. Pure Slate</h2>
            <p className="text-xs text-slate-500">Monochrome, minimal, and serious. (Uses slate-700)</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Primary Buttons</p>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all shadow-sm">
                  <Upload className="w-4 h-4" /> Save Changes
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all">
                  Cancel
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active Badges</p>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active Batch
                </span>
                <span className="px-3 py-1 bg-white text-slate-500 border border-slate-200 rounded-lg text-xs font-medium">
                  Pending
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Input Focus (Ring)</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Focus me..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-all" />
              </div>
            </div>
          </div>
        </div>

        {/* OPTION 2: ICY BLUE (SKY) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <div className="bg-slate-50/50 border-b border-slate-100 p-4">
            <h2 className="text-lg font-black text-slate-800">2. Icy Blue (Sky)</h2>
            <p className="text-xs text-slate-500">Subtle, airy pop of color. (Uses sky-500)</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Primary Buttons</p>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white text-sm font-bold rounded-xl transition-all shadow-sm">
                  <Upload className="w-4 h-4" /> Save Changes
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all">
                  Cancel
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active Badges</p>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active Batch
                </span>
                <span className="px-3 py-1 bg-white text-slate-500 border border-slate-200 rounded-lg text-xs font-medium">
                  Pending
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Input Focus (Ring)</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Focus me..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-all" />
              </div>
            </div>
          </div>
        </div>

        {/* OPTION 3: INDIGO */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <div className="bg-slate-50/50 border-b border-slate-100 p-4">
            <h2 className="text-lg font-black text-slate-800">3. Classic Indigo</h2>
            <p className="text-xs text-slate-500">Trustworthy, standard tech blue. (Uses indigo-600)</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Primary Buttons</p>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm">
                  <Upload className="w-4 h-4" /> Save Changes
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all">
                  Cancel
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active Badges</p>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active Batch
                </span>
                <span className="px-3 py-1 bg-white text-slate-500 border border-slate-200 rounded-lg text-xs font-medium">
                  Pending
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Input Focus (Ring)</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Focus me..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-all" />
              </div>
            </div>
          </div>
        </div>

        {/* OPTION 4: EMERALD */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <div className="bg-emerald-50/50 border-b border-emerald-100 p-4">
            <h2 className="text-lg font-black text-slate-800">4. Forest Emerald</h2>
            <p className="text-xs text-slate-500">Fresh, crisp green for a lab setting. (Uses emerald-600)</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Primary Buttons</p>
              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm">
                  <Upload className="w-4 h-4" /> Save Changes
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all">
                  Cancel
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active Badges</p>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active Batch
                </span>
                <span className="px-3 py-1 bg-white text-slate-500 border border-slate-200 rounded-lg text-xs font-medium">
                  Pending
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Input Focus (Ring)</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Focus me..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
