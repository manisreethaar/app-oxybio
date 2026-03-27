'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import StaffDashboard from './components/StaffDashboard';

// FIXED: Skeleton shown instantly while data loads — no blank freeze
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-64 bg-gray-200 rounded-lg mb-2" />
        <div className="h-4 w-80 bg-gray-100 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl" />
        ))}
      </div>
      <div className="h-40 bg-gray-100 rounded-2xl" />
      <div className="h-32 bg-gray-100 rounded-2xl" />
    </div>
  );
}

export default function DashboardPage() {
  const { employeeProfile, loading } = useAuth();

  // FIXED: Reduced from 5000ms to 1500ms — no reason to wait 5 seconds
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!employeeProfile && !loading) {
      const timer = setTimeout(() => {
        setTimedOut(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [employeeProfile, loading]);

  // FIXED: Show skeleton immediately instead of blank screen with text
  if (loading || (!employeeProfile && !timedOut)) {
    return <DashboardSkeleton />;
  }

  if (!employeeProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 font-bold text-sm max-w-md">
          Employee profile not found. Please contact your system administrator.
        </div>
      </div>
    );
  }

  const getNameForGreeting = (fullName) => {
    if (!fullName) return 'there';
    const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
    const parts = fullName.split(' ');
    if (parts.length > 1 && titles.includes(parts[0])) {
      return parts[1];
    }
    return parts[0];
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-teal-950 tracking-tight">
          Good {greeting}, {getNameForGreeting(employeeProfile?.full_name)}
        </h1>
        <p className="text-gray-500 mt-1">
          Here&apos;s what&apos;s happening across Oxygen Bioinnovations today.
        </p>
      </div>

      {employeeProfile.role === 'admin' ? (
        <AdminDashboard employeeId={employeeProfile.id} />
      ) : (
        <StaffDashboard
          employeeId={employeeProfile.id}
          role={employeeProfile.role}
        />
      )}
    </div>
  );
}
