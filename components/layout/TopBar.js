'use client';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { Bell, Download, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function TopBar() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const { employeeProfile, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const getInitials = (name) => {
    if (!name) return 'OB';
    const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
    const parts = name.split(' ');
    const startIdx = (parts.length > 1 && titles.includes(parts[0])) ? 1 : 0;
    return parts.slice(startIdx, startIdx + 2).map(n => n[0]).join('').toUpperCase();
  };
  
  useEffect(() => {
    // Listen for the native PWA install prompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault(); // Prevent Chrome from showing the mini-infobar automatically
      setDeferredPrompt(e); // Save the event so it can be triggered later
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the native install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      setDeferredPrompt(null); // Hide the button once installed
    } else {
      console.log('User dismissed the install prompt');
    }
  };

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
      case 'formulations': return 'Scientific SVCS';
      case 'shelf-life': return 'Shelf-Life Studies';
      case 'research': return 'Consumer Panels';
      case 'calendar': return 'Regulatory Calendar';
      case 'admin': return 'User Management';
      default: return defaultTitle;
    }
  };

  const todayStr = format(new Date(), 'MMM d, yyyy');

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 md:px-8 shrink-0 sticky top-0 z-40">
      <h1 className="text-xl font-bold text-gray-900 hidden md:block tracking-tight">{getPageTitle()}</h1>
      
      {/* Mobile brand header */}
      <div className="md:hidden flex items-center">
        <div className="w-8 h-8 rounded-xl bg-navy text-white font-bold flex items-center justify-center text-sm mr-2 shadow-sm">
          O₂
        </div>
        <span className="text-lg font-black tracking-tight text-gray-900">OxyOS</span>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-5">
        
        {/* Manual PWA Install Button (Only shows on Android/Chrome before installation) */}
        {deferredPrompt && (
          <button 
            onClick={handleInstallClick}
            className="hidden sm:flex items-center text-xs font-black uppercase tracking-wider bg-navy text-white px-3 py-1.5 rounded-xl hover:bg-navy-hover transition-all shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Install App
          </button>
        )}

        {/* Mobile-only condensed Install button */}
        {deferredPrompt && (
          <button 
            onClick={handleInstallClick}
            className="sm:hidden flex items-center justify-center w-8 h-8 bg-navy text-white rounded-xl hover:bg-navy-hover transition-all shadow-sm active:scale-95"
            aria-label="Install App"
          >
            <Download className="w-4 h-4" />
          </button>
        )}

        <div className="hidden md:block text-xs text-gray-500 font-bold bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
          {todayStr}
        </div>
        
        <Link href="/notifications" className="relative p-2.5 text-gray-400 hover:text-navy rounded-full hover:bg-gray-100 transition-all duration-200">
          <span className="sr-only">View notifications</span>
          <Bell className="w-5 h-5" />
        </Link>

        {employeeProfile && (
          <div className="relative">
            <button 
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center space-x-2 focus:outline-none hover:bg-gray-50 p-1 rounded-full transition-all border border-gray-100"
            >
              <div className="w-8 h-8 rounded-full bg-navy/10 text-navy font-bold flex items-center justify-center text-xs">
                {getInitials(employeeProfile.full_name)}
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in duration-100">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-800 truncate">{employeeProfile.full_name}</p>
                  <p className="text-[10px] font-bold text-navy uppercase tracking-wider mt-0.5">{employeeProfile.designation || employeeProfile.role}</p>
                </div>
                <button 
                  onClick={signOut}
                  className="w-full flex items-center px-4 py-2 text-xs font-bold text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 mr-2 stroke-[2.5px]" /> Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
