'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useAuth } from '@/context/AuthContext';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const { loading } = useAuth();
  
  if (pathname === '/login') {
    return <main className="min-h-screen bg-[#f5fbfa] flex items-center justify-center p-4">{children}</main>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5fbfa] text-teal-800">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-800"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f5fbfa] overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden pb-16 md:pb-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
