export default function MobilePageHeader({ icon: Icon, title, subtitle, action, stats = [] }) {
  return (
    <div className="md:hidden space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className="w-9 h-9 rounded-2xl bg-navy/10 text-navy flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </span>
            )}
            <h1 className="text-2xl font-black text-slate-900 tracking-tight truncate">{title}</h1>
          </div>
          {subtitle && <p className="text-xs font-semibold text-gray-500 mt-2 leading-relaxed">{subtitle}</p>}
        </div>
        {action}
      </div>
      {stats.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {stats.slice(0, 3).map(stat => (
            <div key={stat.label} className="mobile-card px-3 py-2">
              <p className="text-lg font-black text-slate-900 leading-none">{stat.value}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
