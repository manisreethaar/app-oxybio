'use client';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { Bell, Download } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function TopBar() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  
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

      <div className="flex items-center space-x-3 sm:space-x-5">
        
        {/* Manual PWA Install Button (Only shows on Android/Chrome before installation) */}
        {deferredPrompt && (
          <button 
            onClick={handleInstallClick}
            className="hidden sm:flex items-center text-xs font-black uppercase tracking-wider bg-teal-800 text-teal-50 px-3 py-1.5 rounded-xl hover:bg-teal-900 transition-all shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Install App
          </button>
        )}

        {/* Mobile-only condensed Install button */}
        {deferredPrompt && (
          <button 
            onClick={handleInstallClick}
            className="sm:hidden flex items-center justify-center w-8 h-8 bg-teal-800 text-teal-50 rounded-xl hover:bg-teal-900 transition-all shadow-sm active:scale-95"
            aria-label="Install App"
          >
            <Download className="w-4 h-4" />
          </button>
        )}

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
