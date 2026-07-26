import Skeleton from '@/components/Skeleton';

export default function SopsLoading() {
  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      {/* Search + Filter Bar */}
      <div className="flex gap-3">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 w-32 rounded-xl" />
      </div>

      {/* SOP Cards */}
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="surface p-5 flex items-center gap-4">
            <Skeleton variant="rect" className="w-10 h-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
