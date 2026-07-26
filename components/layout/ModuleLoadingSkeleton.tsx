import Skeleton from '@/components/Skeleton';

// Generic route-level fallback shown by loading.js while a module's server
// work (auth/data fetch) resolves. Without this, routes with no loading.js
// render nothing until the RSC payload arrives, which reads as "stuck" and
// is what led people to hit refresh instead of just waiting a moment.
export default function ModuleLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse pb-20">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton width={200} height={28} />
          <Skeleton width={140} height={14} />
        </div>
        <Skeleton width={110} height={36} className="rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
