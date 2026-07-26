import Skeleton from '@/components/Skeleton';

export default function ActivityLoading() {
  return (
    <div className="space-y-8 pb-20 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface p-5 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>

      {/* Activity List */}
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="surface p-4 flex items-center gap-4">
            <Skeleton variant="circle" className="w-10 h-10 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
