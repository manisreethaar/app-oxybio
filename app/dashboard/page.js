'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import StaffDashboard from './components/StaffDashboard';

export default function DashboardPage() {
  const { employeeProfile, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!employeeProfile) setTimedOut(true);
    }, 5000); // 5s fallback
    return () => clearTimeout(timer);
  }, [employeeProfile]);

  if (loading || (!employeeProfile && !timedOut)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 font-medium text-sm animate-pulse">
        Synchronizing dashboard workspace...
      </div>
    );
  }

  if (!employeeProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 font-bold text-sm max-w-md">
          Profile synchronization suspended: Employee record not found in database. Please contact your system administrator.
        </div>
      </div>
    );
  }

  const getNameForGreeting = (fullName) => {
    if (!fullName) return 'there';
    const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
    const parts = fullName.split(' ');
    if (parts.length > 1 && titles.includes(parts[0])) {
      return parts[1]; // Return the first name after the title
    }
    return parts[0];
  };

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-teal-950 tracking-tight">
          Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}, {getNameForGreeting(employeeProfile?.full_name)}
        </h1>
        <p className="text-gray-500 mt-1">Here&apos;s what&apos;s happening across Oxygen Bioinnovations today.</p>
      </div>

      {employeeProfile.role === 'admin' ? (
        <AdminDashboard employeeId={employeeProfile.id} />
      ) : (
        <StaffDashboard employeeId={employeeProfile.id} role={employeeProfile.role} />
      )}
    </div>
  );
}
