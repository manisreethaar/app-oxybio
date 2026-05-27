'use client';

const PALETTE = [
  'from-teal-100 to-cyan-100 text-teal-700',
  'from-violet-100 to-purple-100 text-violet-700',
  'from-amber-100 to-orange-100 text-amber-700',
  'from-rose-100 to-pink-100 text-rose-700',
  'from-sky-100 to-blue-100 text-sky-700',
  'from-emerald-100 to-green-100 text-emerald-700',
];

function colorFor(initials = '') {
  const code = initials.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PALETTE[code % PALETTE.length];
}

/**
 * Shows a small circular badge with the creator's initials.
 * Hover reveals the full name tooltip.
 *
 * Props:
 *  initials   – e.g. "MR"
 *  fullName   – e.g. "Mani Sreethaar" (shown in tooltip)
 *  size       – "sm" | "md" (default "sm")
 */
export default function CreatorBadge({ initials, fullName, size = 'sm' }) {
  if (!initials) return null;

  const dim = size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
  const color = colorFor(initials);

  return (
    <span className="relative group inline-flex items-center">
      <span
        className={`${dim} rounded-full bg-gradient-to-br ${color} border border-white shadow-sm flex items-center justify-center font-black shrink-0 cursor-default`}
        aria-label={fullName || initials}
      >
        {initials}
      </span>
      {fullName && (
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-slate-800 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg">
          {fullName}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  );
}
