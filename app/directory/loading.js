import Skeleton from '@/components/Skeleton';

export default function DirectoryLoading() {
  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Search Bar */}
      <Skeleton className="h-14 w-full rounded-2xl" />

      {/* Employee Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="glass-card rounded-[1.75rem] p-6 space-y-4">
            <div className="flex items-start gap-4">
              <Skeleton variant="rect" className="w-14 h-14 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <div className="space-y-2 pt-4 border-t border-white/40">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
