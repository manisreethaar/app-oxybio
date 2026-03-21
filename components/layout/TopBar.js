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
    <header className="glass-panel h-16 flex items-center justify-between px-4 md:px-8 shrink-0 sticky top-0 z-40">
      <h1 className="text-xl font-bold text-slate-800 hidden md:block tracking-tight">{getPageTitle()}</h1>
      
      {/* Mobile brand header */}
      <div className="md:hidden flex items-center">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-700 to-cyan-800 text-white font-bold flex items-center justify-center text-sm mr-2 shadow-sm">
          O₂
        </div>
        <span className="text-lg font-black tracking-tight text-slate-800">OxyOS</span>
      </div>

      <div className="flex items-center space-x-5">
        <div className="hidden md:block text-sm text-slate-500 font-medium bg-white/50 px-3 py-1.5 rounded-full border border-white/60 shadow-sm">
          {todayStr}
        </div>
        
        <Link href="/notifications" className="relative p-2.5 text-slate-400 hover:text-teal-600 rounded-full hover:bg-white/60 transition-all duration-300">
          <span className="sr-only">View notifications</span>
          <Bell className="w-5 h-5" />
          {/* Temporary hardcoded notification badge, we'll make this dynamic later */}
          <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse"></span>
        </Link>
      </div>
    </header>
  );
}
