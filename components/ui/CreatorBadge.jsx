'use client';

const PALETTE = [
  'from-slate-100 to-slate-100 text-slate-700',
  'from-slate-100 to-slate-100 text-slate-700',
  'from-amber-100 to-amber-100 text-amber-700',
  'from-red-100 to-red-100 text-red-700',
  'from-slate-100 to-slate-100 text-slate-700',
  'from-emerald-100 to-emerald-100 text-emerald-700',
];

function colorFor(str = '') {
  const code = str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PALETTE[code % PALETTE.length];
}

function derivedInitials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || '').filter(Boolean).slice(0, 2).join('');
}

export default function CreatorBadge({ initials, fullName, size = 'sm', showTooltip = true }) {
  const display = initials || (fullName ? derivedInitials(fullName) : null);
  if (!display) return null;

  const dim = size === 'md' ? 'w-8 h-8 text-xs leading-none tracking-tight' : 'w-6 h-6 text-[10px] leading-none tracking-tighter';
  const color = colorFor(display);

  return (
    <span className="relative group inline-flex items-center">
      <span
        className={`${dim} rounded-full bg-gradient-to-br ${color} border border-white shadow-sm flex items-center justify-center font-black shrink-0 cursor-default`}
        aria-label={fullName || display}
      >
        {display}
      </span>
      {fullName && showTooltip && (
        <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
          {fullName}
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-800" />
        </span>
      )}
    </span>
  );
}
