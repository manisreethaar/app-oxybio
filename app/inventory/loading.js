import Skeleton from '@/components/Skeleton';

export default function InventoryLoading() {
  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="surface p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>

      {/* Table Rows */}
      <div className="surface overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <div className="divide-y divide-gray-50">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-6 w-16 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
