'use client';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { Bell } from 'lucide-react';
import Link from 'next/link';

export default function TopBar() {
  const pathname = usePathname();
  
  // Create a mapping or logic to determine page title
  const getPageTitle = () => {
    const path = pathname.split('/')[1];
    if (!path) return 'Dashboard';
    
    // Convert e.g. 'leave' -> 'Leave', 'admin' -> 'Admin'
    const defaultTitle = path.charAt(0).toUpperCase() + path.slice(1);
    
    switch(path) {
      case 'dashboard': return 'Dashboard';
      case 'batches': return 'Batch Manager';
      case 'activity': return 'Lab Activity Feed';
      case 'leave': return 'Leave Management';
      case 'attendance': return 'Attendance';
      case 'tasks': return 'Task Management';
      case 'documents': return 'Document Vault';
      case 'sops': return 'SOP Library';
      case 'payslips': return 'Payslips';
      case 'compliance': return 'Compliance Calendar';
      case 'admin': return 'User Management';
      default: return defaultTitle;
    }
  };

  const todayStr = format(new Date(), 'MMM d, yyyy');

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-40">
      <h1 className="text-xl font-semibold text-gray-800 hidden md:block">{getPageTitle()}</h1>
      
      {/* Mobile brand header */}
      <div className="md:hidden flex items-center">
        <div className="w-8 h-8 rounded-md bg-teal-800 text-white font-bold flex items-center justify-center text-sm mr-2">
          O₂
        </div>
        <span className="text-lg font-bold text-teal-950">OxyOS</span>
      </div>

      <div className="flex items-center space-x-4">
        <div className="hidden md:block text-sm text-gray-500 font-medium">
          {todayStr}
        </div>
        
        <Link href="/notifications" className="relative p-2 text-gray-400 hover:text-gray-500 rounded-full hover:bg-gray-100 transition-colors">
          <span className="sr-only">View notifications</span>
          <Bell className="w-5 h-5" />
          {/* Temporary hardcoded notification badge, we'll make this dynamic later */}
          <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
        </Link>
      </div>
    </header>
  );
}
