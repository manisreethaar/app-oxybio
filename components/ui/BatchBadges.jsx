// Single source of truth for batch SKU / experiment-type / status badge styling.
// Previously this color-to-meaning mapping was re-declared inline in app/batches/page.js
// and app/batches/[batchId]/page.js, so a new status only got colored correctly in
// whichever file someone remembered to update.

export const SKU_COLORS = {
  CLARITY:    'bg-slate-50 text-slate-700 border-slate-200',
  MOMENTUM:   'bg-amber-50 text-amber-700 border-amber-200',
  VITALITY:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  Unassigned: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const STATUS_COLORS = {
  scheduled:    'bg-slate-50 text-slate-700 border-slate-100',
  planned:      'bg-slate-50 text-slate-700 border-slate-100',
  active:       'bg-amber-50 text-amber-700 border-amber-100', // legacy DB value
  'in-progress':'bg-amber-50 text-amber-700 border-amber-100', // DB canonical value
  in_progress:  'bg-amber-50 text-amber-700 border-amber-100', // code alias
  fermenting:   'bg-amber-50 text-amber-700 border-amber-100',
  qc_hold:      'bg-slate-50 text-slate-700 border-slate-100',
  'qc-hold':    'bg-slate-50 text-slate-700 border-slate-100',
  released:     'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected:     'bg-red-50 text-red-700 border-red-100',
  deviation:    'bg-red-50 text-red-700 border-red-100',
  archived:     'bg-slate-50 text-slate-600 border-slate-200',
};

const SIZE_CLS = {
  xs: 'px-1.5 py-0.5 text-[9px]',
  sm: 'px-2 py-0.5 text-[10px]',
};

export function SkuBadge({ sku, size = 'sm' }) {
  return (
    <span className={`rounded font-black uppercase tracking-wider border ${SIZE_CLS[size]} ${SKU_COLORS[sku] || SKU_COLORS.Unassigned}`}>
      {sku || 'Unassigned'}
    </span>
  );
}

export function ExperimentBadge({ type, size = 'sm' }) {
  return (
    <span className={`rounded font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 ${SIZE_CLS[size]}`}>
      {type || '—'}
    </span>
  );
}

// `status` should already be the normalised/derived display status (lowercase key
// into STATUS_COLORS) — callers keep whatever stage-derivation logic they had.
export function StatusBadge({ status, label, hasAlarm, size = 'sm' }) {
  if (hasAlarm) {
    return (
      <span className={`rounded font-black uppercase tracking-wider border animate-pulse bg-red-100 text-red-700 border-red-200 ${SIZE_CLS[size]}`}>
        ⚠ Alarm
      </span>
    );
  }
  const cls = STATUS_COLORS[(status || '').toLowerCase()] || STATUS_COLORS['in_progress'] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`rounded font-black uppercase tracking-wider border ${SIZE_CLS[size]} ${cls}`}>
      {label ?? status}
    </span>
  );
}
