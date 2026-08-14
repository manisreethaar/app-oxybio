'use client';
import Link from 'next/link';
import { format } from 'date-fns';
import { FlaskConical, ArrowRight, Archive, Trash2 } from 'lucide-react';
import { SkuBadge, ExperimentBadge, StatusBadge } from '@/components/ui/BatchBadges';
import CreatorBadge from '@/components/ui/CreatorBadge';

// One card shape for every batch status. Active/scheduled batches show a live
// stage-progress bar; released/rejected/archived batches show a disposition
// line instead — same shell either way, so switching status tabs doesn't
// switch visual language (previously active/scheduled used this card while
// released/rejected/archived rendered a separate <table>).
export default function BatchCard({
  batchId,
  skuTarget,
  experimentType,
  status,
  displayStatusLabel,
  hasAlarm = false,
  hours,
  hoursLabel,
  isScheduled = false,
  isTerminal = false,
  terminalInfo,
  stageLabel,
  stageProgress, // { currentIdx, total } | null
  flasks = [],
  recipeName,
  recipeVersion,
  volumeMl,
  href,
  ctaLabel,
  onStart,
  onArchive,
  onPermanentDelete,
  isAdmin = false,
  busy = false,
  compact = false,
  creator,
  date,
  fermHrs,
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover overflow-hidden flex flex-col transition-all ${compact ? 'min-w-[280px] w-[280px] snap-center shrink-0' : ''} ${hasAlarm ? 'border-red-300 ring-2 ring-red-200/50' : ''}`}
    >
      <div className={`px-5 py-4 flex justify-between items-start border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white ${compact ? 'px-4 py-3' : ''}`}>
        <div>
          <p className="font-mono text-sm font-black text-slate-900 tracking-wider mb-1.5">{batchId}</p>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
            <SkuBadge sku={skuTarget} />
            <ExperimentBadge type={experimentType} />
            {!compact && <StatusBadge status={status} label={displayStatusLabel} hasAlarm={hasAlarm} />}
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          {hours != null && (
            <>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Batch Age</p>
              <p className="text-lg font-black text-slate-800 tabular-nums">{hours}<span className="text-[10px] font-bold text-slate-400"> hr</span></p>
              {fermHrs != null && (
                <span className="mt-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold whitespace-nowrap">
                  {fermHrs}h Fermentation
                </span>
              )}
            </>
          )}
          {!compact && isAdmin && (onArchive || onPermanentDelete) ? (
            <div className="flex gap-2">
              {onArchive && (
                <button onClick={e => { e.preventDefault(); onArchive(); }} className="p-1.5 rounded bg-slate-100 text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-all border border-slate-200" title="Archive Batch">
                  <Archive className="w-3 h-3" />
                </button>
              )}
              {onPermanentDelete && (
                <button onClick={e => { e.preventDefault(); onPermanentDelete(); }} className="p-1.5 rounded bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-slate-200" title="Permanently Delete Batch">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`px-5 pt-3 pb-2 ${compact ? 'px-4 pt-2 pb-1.5' : ''}`}>
        {isTerminal ? (
          <div className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest ${status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'}`}>
            {terminalInfo}
          </div>
        ) : stageProgress ? (
          <>
            <div className="flex items-center gap-0.5 mb-1">
              {Array.from({ length: stageProgress.total }).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    stageProgress.currentIdx >= stageProgress.total || idx < stageProgress.currentIdx ? 'bg-navy' :
                    idx === stageProgress.currentIdx ? 'bg-amber-500 animate-pulse' :
                    'bg-slate-100'
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stageLabel}</p>
          </>
        ) : (
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stageLabel}</p>
        )}
      </div>

      <div className={`px-5 py-2 border-t border-slate-50 flex items-center gap-2 ${compact ? 'px-4 py-1.5' : ''}`}>
        <FlaskConical className="w-3 h-3 text-slate-400 shrink-0" />
        <div className="flex gap-1 flex-wrap">
          {flasks.map(f => (
            <span
              key={f.id}
              className={`px-1 py-0.5 rounded text-[10px] font-black uppercase border ${f.status === 'active' ? 'bg-navy/5 text-navy border-navy/20' : f.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200 line-through' : f.status === 'planned' ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
            >
              {f.label}
            </span>
          ))}
          {flasks.length === 0 && <span className="text-[10px] text-slate-400">No flasks</span>}
        </div>
        {volumeMl != null && <span className="ml-auto text-[10px] text-slate-400 font-semibold">{volumeMl}ml</span>}
      </div>

      <div className={`px-5 py-2 border-t border-slate-50 flex items-center justify-between gap-1.5 bg-slate-50/30 ${compact ? 'px-4 py-1.5' : ''}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Recipe:</span>
          <span className="text-[10px] font-bold text-slate-700 truncate max-w-[120px]">{recipeName || '—'}</span>
          {recipeVersion != null && <span className="text-[10px] text-slate-400">v{recipeVersion}</span>}
        </div>
      </div>

      <div className={`px-5 py-2 border-t border-slate-50 flex items-center justify-between gap-1.5 bg-slate-50/50 ${compact ? 'px-4 py-1.5' : ''}`}>
        <div className="flex items-center gap-2">
          <CreatorBadge initials={creator?.initials} fullName={creator?.full_name} size="sm" showTooltip={!compact} />
          <span className="text-[9px] text-slate-500 font-medium tracking-wide hidden sm:inline-block">CREATED BY</span>
        </div>
        <div className="text-right flex items-center gap-1">
          <span className="text-[9px] text-slate-400 font-mono tracking-tighter" title="ISO 8601 Timestamp">
            {date ? format(new Date(date), 'dd-MMM-yyyy HH:mm') : '—'}
          </span>
        </div>
      </div>

      {isScheduled ? (
        <button
          onClick={onStart}
          disabled={busy}
          className="w-full py-2.5 mt-auto flex justify-center items-center text-xs font-bold transition-colors border-t border-slate-100 bg-slate-50/50 hover:bg-slate-100 text-navy disabled:opacity-60"
        >
          {ctaLabel || 'Start Batch'} <ArrowRight className="w-3 h-3 ml-1.5" />
        </button>
      ) : (
        <Link
          href={href}
          className={`w-full py-2.5 mt-auto flex justify-center items-center text-xs font-bold transition-colors border-t border-slate-100 ${hasAlarm ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-slate-50/50 hover:bg-slate-100 text-navy'}`}
        >
          {ctaLabel || 'View'} <ArrowRight className="w-3 h-3 ml-1.5" />
        </Link>
      )}
    </div>
  );
}
