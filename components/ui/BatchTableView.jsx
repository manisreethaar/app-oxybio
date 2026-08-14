import React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, Trash2, Archive, Play } from 'lucide-react';
import CreatorBadge from './CreatorBadge';
import { SkuBadge, ExperimentBadge, StatusBadge } from './BatchBadges';

export default function BatchTableView({ batches }) {
  if (!batches || batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-white/50 rounded-2xl border border-slate-200 shadow-glass">
        <p className="text-sm">No batches found matching criteria.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-card">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-black uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3 whitespace-nowrap">Batch ID</th>
            <th className="px-4 py-3 whitespace-nowrap">Recipe & SKU</th>
            <th className="px-4 py-3 whitespace-nowrap">Status & Stage</th>
            <th className="px-4 py-3 text-right whitespace-nowrap">Volume / Flasks</th>
            <th className="px-4 py-3 text-right whitespace-nowrap">Age / Elapsed</th>
            <th className="px-4 py-3 whitespace-nowrap">Creator & Date</th>
            <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {batches.map((b) => {
            const hasAlarm = b.hasAlarm;
            return (
              <tr key={b.key} className="group hover:bg-slate-50/50 transition-colors">
                {/* Batch ID */}
                <td className="px-4 py-3">
                  <Link href={b.href} className="font-bold text-navy hover:text-navy-hover transition-colors flex items-center gap-1.5">
                    {hasAlarm && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    {b.batchId}
                  </Link>
                </td>
                
                {/* Recipe & SKU */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 items-start">
                    <span className="font-semibold text-slate-800">
                      {b.recipeName || 'No Recipe'} {b.recipeVersion && <span className="text-slate-400 font-normal">v{b.recipeVersion}</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <ExperimentBadge type={b.experimentType} size="xs" />
                      <SkuBadge sku={b.skuTarget} size="xs" />
                    </div>
                  </div>
                </td>

                {/* Status & Stage */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 items-start">
                    <StatusBadge status={b.status} label={b.displayStatusLabel} hasAlarm={hasAlarm} size="xs" />
                    <span className="text-xs text-slate-500 font-medium">
                      {b.stageLabel}
                    </span>
                  </div>
                </td>

                {/* Volume / Flasks */}
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">
                  <div className="flex flex-col items-end gap-1">
                    <span>{b.volumeMl} mL</span>
                    <span className="text-xs text-slate-400">
                      {b.flasks?.length || 0} flasks
                    </span>
                  </div>
                </td>

                {/* Age / Elapsed */}
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-bold">{b.hours !== null ? `${b.hours}h` : '—'}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{b.hoursLabel || '—'}</span>
                    {b.fermHrs != null && (
                      <span className="mt-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                        {b.fermHrs}h Fermentation
                      </span>
                    )}
                  </div>
                </td>

                {/* Creator & Date (ALCOA++) */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CreatorBadge 
                      initials={b.creator?.initials} 
                      fullName={b.creator?.full_name} 
                      size="sm" 
                    />
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-800 font-medium whitespace-nowrap">
                        {b.date ? format(new Date(b.date), 'dd-MMM-yyyy') : '—'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono tracking-tighter">
                        {b.date ? format(new Date(b.date), 'HH:mm:ss') : ''}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {b.onStart && (
                      <button 
                        onClick={(e) => { e.preventDefault(); b.onStart(); }}
                        disabled={b.busy}
                        className="p-1.5 text-slate-400 hover:text-navy hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                        title="Start Batch"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {b.onArchive && (
                      <button 
                        onClick={(e) => { e.preventDefault(); b.onArchive(); }}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                        title="Archive Batch"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                    {b.onPermanentDelete && (
                      <button 
                        onClick={(e) => { e.preventDefault(); b.onPermanentDelete(); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Permanently Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
