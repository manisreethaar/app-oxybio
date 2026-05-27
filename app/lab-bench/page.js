'use client';
import Link from 'next/link';
import {
  FlaskConical, Activity, Grid3x3, ClipboardList,
  Plus, ChevronRight, Clock, Construction
} from 'lucide-react';

export default function LabBenchPage() {
  const actions = [
    {
      href:    '/lab-bench/log',
      icon:    Plus,
      color:   'bg-teal-600',
      bg:      'bg-teal-50 border-teal-200',
      label:   'Quick Log',
      desc:    'Log pH, OD, sterility, or plate analysis for any active process in one form.',
      ready:   true,
    },
    {
      href:    '/lab-bench/grid',
      icon:    Grid3x3,
      color:   'bg-violet-600',
      bg:      'bg-violet-50 border-violet-200',
      label:   'Grid Entry',
      desc:    'Log multiple timepoints across flasks in a table — fastest for end-of-run data.',
      ready:   true,
    },
    {
      href:    '#',
      icon:    Clock,
      color:   'bg-amber-500',
      bg:      'bg-amber-50 border-amber-200',
      label:   'Active Queue',
      desc:    'See everything due for sampling right now across all running processes.',
      ready:   false,
    },
  ];

  const shortcuts = [
    { href: '/batches',        label: 'Batch Production', icon: FlaskConical, desc: 'Review & manage batches' },
    { href: '/growth-studies', label: 'Growth Studies',   icon: Activity,     desc: 'Curves & timepoints' },
    { href: '/research/incubation', label: 'Incubation Lab', icon: ClipboardList, desc: 'Plates & sterility records' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-8">

      {/* Header */}
      <div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">OxyOS</p>
        <h1 className="text-2xl font-black text-slate-800">Lab Bench</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          One place to log samples, track active runs, and see what needs attention.
        </p>
      </div>

      {/* Primary Actions */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Log & Entry</h2>
        {actions.map(({ href, icon: Icon, color, bg, label, desc, ready }) => (
          <div key={label} className="relative">
            {ready ? (
              <Link
                href={href}
                className={`flex items-start gap-4 p-4 rounded-2xl border ${bg} hover:shadow-md transition-all group`}
              >
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800 text-sm">{label}</span>
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-black rounded-full border border-teal-200">Ready</span>
                  </div>
                  <p className="text-slate-500 text-xs font-medium mt-0.5 leading-relaxed">{desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0 mt-0.5" />
              </Link>
            ) : (
              <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50 opacity-60">
                <div className={`w-10 h-10 rounded-xl bg-slate-300 flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-600 text-sm">{label}</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-200 text-slate-500 text-[10px] font-black rounded-full border border-slate-300">
                      <Construction className="w-3 h-3" /> Coming soon
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs font-medium mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Module Shortcuts */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Module Review</h2>
        <p className="text-xs font-medium text-slate-400 -mt-1">
          Existing modules are unchanged — use them to review logged data.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {shortcuts.map(({ href, label, icon: Icon, desc }) => (
            <Link
              key={href} href={href}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all group"
            >
              <Icon className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-slate-700 text-sm">{label}</span>
                <p className="text-slate-400 text-xs font-medium">{desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
