'use client';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { Bell, Download, LogOut, Search, X } from 'lucide-react';
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

  // Computed client-side only — the server and the browser can be in
  // different timezones, so formatting new Date() directly during render
  // can disagree with the client's version during hydration near a
  // midnight boundary. This header renders on every single page, so any
  // mismatch here was a hydration error on every navigation.
  const [todayStr, setTodayStr] = useState('');
  useEffect(() => {
    setTodayStr(format(new Date(), 'EEE, MMM d'));
  }, []);

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
    const channel = supabase.channel(`notif-bell-${employeeProfile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `employee_id=eq.${employeeProfile.id}` },
        (payload) => { setNotifications(prev => [payload.new, ...prev].slice(0, 5)); setUnreadCount(prev => prev + 1); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `employee_id=eq.${employeeProfile.id}` },
        (payload) => {
          setNotifications(prev => prev.map(n => n.id === payload.new.id ? { ...n, is_read: payload.new.is_read } : n));
          setUnreadCount(prev => Math.max(0, prev + (payload.new.is_read && !payload.old?.is_read ? -1 : 0)));
        })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [employeeProfile?.id, supabase]);

  const markAsRead = async (id, link) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifOpen(false);
    if (link) window.location.href = link;
  };

  const handleBellClick = async () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    setProfileOpen(false);
    if (opening && employeeProfile?.id) {
      const { data } = await supabase.from('notifications')
        .select('id,title,message,is_read,link,created_at')
        .eq('employee_id', employeeProfile.id)
        .order('created_at', { ascending: false }).limit(5);
      if (data) { setNotifications(data); setUnreadCount(data.filter(n => !n.is_read).length); }
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
    const handleBeforeInstallPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
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
    const sub = parts[1] || '';
    const titles = {
      dashboard: 'Dashboard', batches: sub ? 'Batch Details' : 'Batch Manager',
      activity: 'Activity Feed', leave: 'Leave Management', attendance: 'Attendance',
      tasks: 'My Tasks', documents: 'Documents & SOPs', payslips: 'Payslips',
      compliance: 'Compliance & CAPA', formulations: 'Recipe Management',
      'shelf-life': 'Stability Studies', bioprocess: 'Bioprocess Lab',
      'lab-bench': 'Lab Bench', 'lab-notebook': 'Lab Notebook',
      inventory: 'Inventory', equipment: 'Equipment', calendar: 'Calendar',
      admin: 'Administration', notifications: 'Notifications', directory: 'Directory',
      messages: 'Messages', research: sub || 'Research',
    };
    return titles[path] || (path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' '));
  };

  const openSearch = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('oxysearch:open'));
  };

  return (
    <header
      ref={topbarRef}
      className="fixed top-3 right-3 z-40 flex items-center gap-2 h-[52px] px-2 rounded-2xl md:left-[78px] left-3"
      style={{
        background: 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {/* Page title */}
      <div className="hidden md:flex items-center gap-2 pl-3 pr-2">
        <h1 className="text-sm font-black text-slate-800 tracking-tight whitespace-nowrap">
          {getPageTitle()}
        </h1>
      </div>

      {/* Mobile logo */}
      <div className="md:hidden flex items-center gap-2 pl-2 pr-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
          style={{ background: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)', boxShadow: '0 0 12px rgba(71,85,105,0.3)' }}>
          O₂
        </div>
        <span className="text-sm font-black text-slate-900 tracking-tight">OxyOS</span>
      </div>

      {/* Mobile search */}
      <button onClick={openSearch}
        className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
        <Search className="w-4 h-4" />
      </button>

      {/* Spacer to push everything else to the right */}
      <div className="flex-1" />

      {/* Desktop Search (Right aligned) */}
      <button
        onClick={openSearch}
        className="hidden md:flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all group shrink-0"
        style={{ background: 'rgba(0,0,0,0.03)' }}
      >
        <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
        <span>Search...</span>
        <kbd className="ml-2 text-xs font-black text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md tracking-wider">⌘K</kbd>
      </button>

      {/* Divider */}
      <div className="hidden md:block w-px h-5 bg-slate-200 mx-1 shrink-0" />

      <div className="flex items-center gap-1.5 pr-1">
        {/* Date */}
        <div className="hidden lg:flex items-center h-8 px-3 rounded-lg text-xs font-bold text-slate-500" style={{ background: 'rgba(0,0,0,0.04)' }}>
          {todayStr}
        </div>

        {/* Install */}
        {deferredPrompt && (
          <button onClick={handleInstallClick}
            className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-black text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)' }}>
            <Download className="w-3.5 h-3.5" /> Install
          </button>
        )}

        {/* Bell */}
        <div className="relative">
          <button onClick={handleBellClick}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#475569', boxShadow: '0 0 6px rgba(71,85,105,0.7)' }} />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 z-50 animate-in fade-in zoom-in-95 duration-150"
              style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '1.25rem', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Notifications</span>
                <Link href="/notifications" onClick={() => setNotifOpen(false)} className="text-xs font-bold text-slate-500 hover:text-slate-700">View all</Link>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-400">You&apos;re all caught up!</p>
                  </div>
                ) : notifications.map(n => (
                  <div key={n.id} onClick={() => markAsRead(n.id, n.link || '/notifications')}
                    className={`px-4 py-3 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${!n.is_read ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-1.5">
                        {n.type === 'alert' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                        {n.type === 'warning' && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                        {n.type === 'success' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                        {n.type === 'info' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        <p className={`text-xs leading-snug ${!n.is_read ? 'font-black text-slate-900' : 'font-semibold text-slate-600'}`}>{n.title}</p>
                      </div>
                      {!n.is_read && <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: '#475569' }} />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        {employeeProfile && (
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 pl-1.5 pr-2.5 h-9 rounded-xl hover:bg-slate-100 transition-all"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] leading-none tracking-tight font-black text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)' }}>
                {getInitials(employeeProfile.full_name)}
              </div>
              <span className="hidden md:block text-xs font-bold text-slate-800 max-w-[100px] truncate">
                {employeeProfile.full_name?.split(' ').slice(-1)[0] || 'Me'}
              </span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-52 z-50 animate-in fade-in zoom-in-95 duration-150"
                style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(24px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '1.25rem', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
                <div className="px-4 py-4 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm leading-none tracking-tight font-black text-white mb-2"
                    style={{ background: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)' }}>
                    {getInitials(employeeProfile.full_name)}
                  </div>
                  <p className="text-sm font-black text-slate-900 leading-tight truncate">{employeeProfile.full_name}</p>
                  <p className="text-xs font-semibold text-slate-400 capitalize mt-0.5">{employeeProfile.designation || employeeProfile.role}</p>
                </div>
                <div className="p-2">
                  <Link href="/profile" onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                    <User className="w-4 h-4 text-slate-400" /> View Profile
                  </Link>
                  <Link href="/profile" onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                    <CreditCard className="w-4 h-4 text-slate-400" /> ID Card
                  </Link>
                  <button onClick={signOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors mt-1 border-t border-slate-100 pt-3">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
