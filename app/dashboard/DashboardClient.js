'use client';
import { useState, useEffect } from 'react';
import AdminDashboard from './components/AdminDashboard';
import StaffDashboard from './components/StaffDashboard';

function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-64 bg-slate-200 rounded-lg mb-2" />
        <div className="h-4 w-80 bg-slate-100 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-2xl" />
        ))}
      </div>
      <div className="h-40 bg-slate-100 rounded-2xl" />
      <div className="h-32 bg-slate-100 rounded-2xl" />
    </div>
  );
}

function getNameForGreeting(fullName) {
  if (!fullName) return 'there';
  const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
  const parts = fullName.split(' ');
  if (parts.length > 1 && titles.includes(parts[0])) return parts[1];
  return parts[0];
}

export default function DashboardClient({ employeeProfile, isAdmin, initialAdminData, initialStaffData }) {
  // Greeting is client-side only — timezone-safe
  const [clientGreeting, setClientGreeting] = useState(null);
  useEffect(() => {
    const hour = new Date().getHours();
    setClientGreeting(hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening');
  }, []);

  if (!employeeProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 font-bold text-sm max-w-md">
          Employee profile not found. Please contact your system administrator.
        </div>
      </div>
    );
  }

  const greeting = clientGreeting || 'Day';

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">
          Good {greeting}, {getNameForGreeting(employeeProfile?.full_name)}
        </h1>
        <p className="text-slate-500 mt-1">
          Here&apos;s what&apos;s happening across Oxygen Bioinnovations today.
        </p>
      </div>

      {isAdmin ? (
        <AdminDashboard
          employeeId={employeeProfile.id}
          initialData={initialAdminData}
        />
      ) : (
        <StaffDashboard
          employeeProfile={employeeProfile}
          initialData={initialStaffData}
        />
      )}
    </div>
  );
}
