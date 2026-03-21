'use client';
import { useAuth } from '@/context/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import StaffDashboard from './components/StaffDashboard';

export default function DashboardPage() {
  const { employeeProfile, loading } = useAuth();

  if (loading || !employeeProfile) return null;

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
