'use client';
import { useAuth } from '@/context/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import StaffDashboard from './components/StaffDashboard';

export default function DashboardPage() {
  const { employeeProfile, loading } = useAuth();

  if (loading || !employeeProfile) return null;

  const firstName = employeeProfile.full_name.split(' ')[0];

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-teal-950 tracking-tight">Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}, {employeeProfile?.full_name?.split(' ')[0]}</h1>
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
