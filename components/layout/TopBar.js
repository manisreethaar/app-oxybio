'use client';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { Bell, Download, LogOut, Search } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { User, CreditCard } from 'lucide-react';

export default function TopBar() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const { employeeProfile, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const topbarRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (topbarRef.current && !topbarRef.current.contains(event.target)) {
        setProfileOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!employeeProfile?.id) return;

    const fetchNotifs = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id,title,message,is_read,link,created_at')
        .eq('employee_id', employeeProfile.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    };

    fetchNotifs();

    const channel = supabase
      .channel(`notif-bell-${employeeProfile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `employee_id=eq.${employeeProfile.id}` },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev].slice(0, 5));
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `employee_id=eq.${employeeProfile.id}` },
        (payload) => {
          setNotifications(prev =>
            prev.map(n => n.id === payload.new.id ? { ...n, is_read: payload.new.is_read } : n)
          );
          setUnreadCount(prev =>
            Math.max(0, prev + (payload.new.is_read && !payload.old?.is_read ? -1 : 0))
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employeeProfile?.id, supabase]);

  const markAsRead = async (id, link) => {
    // Optimistic update — mark the item read locally immediately
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) {
      console.error('Failed to update notification:', error);
      alert('Failed to mark read: ' + error.message);
    }
    setNotifOpen(false);
    if (link) window.location.href = link;
  };

  // Re-fetch when the dropdown opens so stale read-state is always refreshed
  const handleBellClick = async () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    setProfileOpen(false);
    if (opening && employeeProfile?.id) {
      const { data } = await supabase
        .from('notifications')
        .select('id,title,message,is_read,link,created_at')
        .eq('employee_id', employeeProfile.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    }
  };

  const getInitials = (name) => {
    if (!name) return 'OB';
    const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
    const parts = name.split(' ');
    const startIdx = (parts.length > 1 && titles.includes(parts[0])) ? 1 : 0;
    return parts.slice(startIdx, startIdx + 2).map(n => n[0]).join('').toUpperCase();
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const getPageTitle = () => {
    const parts = pathname.split('/').filter(Boolean);
    const path = parts[0] || '';
    const sub  = parts[1] || '';

    switch (path) {
      case 'dashboard':    return 'Dashboard';
      case 'batches':      return sub ? 'Batch Details' : 'Batch Manager';
      case 'activity':     return 'Lab Activity Feed';
      case 'leave':        return 'Leave Management';
      case 'attendance':   return 'Attendance & Corrections';
      case 'mispunch':     return 'Attendance Corrections';
      case 'tasks':        return 'Task Management';
      case 'documents':    return 'Documents & SOPs';
      case 'sops':         return 'SOPs & Protocols';
      case 'payslips':     return 'Payslips';
      case 'compliance':   return 'Compliance & CAPA';
      case 'capa':         return 'CAPA Tracker';
      case 'formulations': return 'Recipe Management';
      case 'shelf-life':   return 'Shelf-Life Studies';
      case 'research': {
        const subTitles = {
          incubation: 'Incubation Lab',
          'cell-bank': 'Cell Bank',
          'growth-studies': 'Growth Studies',
          'bioprocess': 'Bioprocess Lab',
        };
        return subTitles[sub] || 'Research';
      }
      case 'bioprocess':    return 'Bioprocess Lab';
      case 'lab-bench':     return 'Lab Bench';
      case 'lab-notebook':  return 'Lab Notebook';
      case 'inventory':     return 'Inventory';
      case 'equipment':     return 'Equipment';
      case 'notifications': return 'Notifications';
      case 'calendar':     return 'Regulatory Calendar';
      case 'admin':        return 'User Management';
      default:             return path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
    }
  };

  const todayStr = format(new Date(), 'MMM d, yyyy');

  const openSearch = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('oxysearch:open'));
    }
  };

  return (
    <header ref={topbarRef} className="fixed top-4 right-4 md:right-10 left-4 md:left-[auto] md:min-w-[360px] glass-card h-[60px] flex items-center justify-between px-3 sm:px-5 z-40">
      <h1 className="text-xs font-black text-zinc-400 tracking-[0.2em] hidden md:block uppercase mr-8 pl-2">{getPageTitle()}</h1>

      <div className="md:hidden flex items-center">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 text-white font-bold flex items-center justify-center text-sm mr-2 shadow-sm">
          O₂
        </div>
        <span className="text-lg font-black tracking-tight text-zinc-900">OxyOS</span>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3 ml-auto">

        {/* Global Search trigger */}
        <button
          onClick={openSearch}
          className="hidden md:flex items-center gap-2 px-3 py-2 text-xs font-bold text-zinc-500 bg-white/50 border border-white rounded-[1rem] hover:bg-white hover:shadow-soft hover:text-zinc-900 transition-all"
          title="Search modules (Ctrl+K)"
        >
          <Search className="w-4 h-4" />
          <span>Search</span>
          <kbd className="text-[9px] font-black tracking-wider text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">⌘K</kbd>
        </button>

        {/* Mobile search icon */}
        <button
          onClick={openSearch}
          className="md:hidden flex items-center justify-center w-9 h-9 text-gray-400 hover:text-navy hover:bg-gray-100 rounded-xl transition-all"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        {deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="hidden sm:flex items-center text-xs font-black uppercase tracking-wider bg-navy text-white px-3 py-1.5 rounded-xl hover:bg-navy-hover transition-all shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Install App
          </button>
        )}
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

        <div className="relative">
          <button
            onClick={handleBellClick}
            className="relative p-2.5 text-gray-400 hover:text-navy rounded-full hover:bg-gray-100 transition-all duration-200 focus:outline-none"
          >
            <span className="sr-only">View notifications</span>
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-white pointer-events-none" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in duration-100 max-h-96 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="text-xs font-black text-gray-800 uppercase tracking-widest">Recent Activity</span>
                <Link href="/notifications" onClick={() => setNotifOpen(false)} className="text-[10px] font-bold text-navy hover:text-teal-600">View All</Link>
              </div>
              <div className="overflow-y-auto w-full custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs font-bold text-gray-400">All caught up!</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markAsRead(n.id, n.link || '/notifications')}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${!n.is_read ? 'bg-teal-50/30' : ''}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <p className={`text-xs ${!n.is_read ? 'font-black text-slate-800' : 'font-bold text-slate-600'}`}>{n.title}</p>
                        {!n.is_read && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-navy mt-1.5" />}
                      </div>
                      <p className="text-[10px] font-medium text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {employeeProfile && (
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
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
                <div className="py-1 border-b border-gray-100">
                  <Link href="/profile" onClick={() => setProfileOpen(false)} className="w-full flex items-center px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-navy transition-colors">
                    <User className="w-3.5 h-3.5 mr-2 stroke-[2.5px]" /> View Profile
                  </Link>
                  <Link href="/profile" onClick={() => setProfileOpen(false)} className="w-full flex items-center px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-navy transition-colors">
                    <CreditCard className="w-3.5 h-3.5 mr-2 stroke-[2.5px]" /> ID Card &amp; Safety
                  </Link>
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
