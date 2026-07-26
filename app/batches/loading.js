'use client';
import Skeleton from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <Skeleton width={160} height={32} />
        <Skeleton width={140} height={40} className="rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
