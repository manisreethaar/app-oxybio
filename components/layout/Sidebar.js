'use client';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FlaskConical, Activity, CheckSquare,
  CalendarOff, Clock, FileText, CalendarDays, Receipt,
  BookOpen, Users, LogOut, UserCircle, Contact,
  ShieldAlert, Beaker, Wrench, Package, Microscope, Dna,
  Settings, LayoutGrid, FileCheck, Archive, MessageSquare, HelpCircle,
  Wind, Wifi, ArrowRight, ChevronRight, X, Home, Menu, Filter,
  Bell, Search, PieChart, Shield, Droplets
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

/* ─── White & Slate Theme Tokens ─── */
const V = {
  grad: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)',
  glow: '0 0 15px rgba(71,85,105,0.2)',
  sidebar: '#ffffff',
  border: '#e2e8f0',
  activeBg: '#f1f5f9',
  activeText: '#475569',
  hoverBg: '#f8fafc',
  text: '#1e293b',
  textLight: '#64748b',
};

/* ─── Quick-access items shown in mobile bottom bar ─── */
const QUICK_NAV = [
  { name: 'Home',   href: '/dashboard',  icon: Home },
  { name: 'Lab',    href: '/lab-bench',  icon: LayoutGrid },
  { name: 'Tasks',  href: '/tasks',       icon: CheckSquare },
  { name: 'Attend', href: '/attendance', icon: Clock },
];

export default function Sidebar() {
  const { employeeProfile, role, canDo, signOut } = useAuth();
  const pathname = usePathname();
  const [sheet, setSheet]   = useState(false); // mobile full sheet
  const [expanded, setExpanded] = useState(false); // desktop expand
  const [unread, setUnread] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const eRole = role || 'intern';
  const eCanDo = !employeeProfile ? () => true : canDo;

  useEffect(() => {
    if (!employeeProfile?.id) return;
    supabase.rpc('get_global_unread_count').then(({ data }) => { if (data) setUnread(+data); });
    const ch = supabase.channel('u_msg').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
      supabase.rpc('get_global_unread_count').then(({ data }) => { if (data) setUnread(+data); });
    }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [employeeProfile?.id, supabase]);

  // Close sheet on route change
  useEffect(() => { setSheet(false); }, [pathname]);

  const initials = (name) => {
    if (!name) return 'OB';
    const skip = ['Mr.','Mrs.','Ms.','Dr.','Prof.','Mr','Mrs','Ms'];
    const p = name.split(' ');
    const s = (p.length > 1 && skip.includes(p[0])) ? 1 : 0;
    return p.slice(s, s + 2).map(n => n[0]).join('').toUpperCase();
  };

  const sections = [
    { title: 'Overview', items: [
      { name: 'Dashboard',   href: '/dashboard', icon: LayoutDashboard, show: eCanDo('dashboard','view') },
      { name: 'Messages',    href: '/messages',  icon: MessageSquare,   show: true, badge: unread },
      { name: 'Activity',    href: '/activity',  icon: Activity,        show: eCanDo('activity','view') },
      { name: 'Tasks',       href: '/tasks',     icon: CheckSquare,     show: eCanDo('tasks','view') },
    ]},
    { title: 'Lab & Production', items: [
      { name: 'Lab Bench',   href: '/lab-bench',           icon: LayoutGrid,   show: eCanDo('batches','view') },
      { name: 'Batches',     href: '/batches',             icon: FlaskConical, show: eCanDo('batches','view') },
      { name: 'Downstream',  href: '/downstream',          icon: Filter,       show: eCanDo('batches','view') },
      { name: 'Product Dev', href: '/product-development', icon: Beaker,       show: eCanDo('batches','view') },
      { name: 'Lab Notebook',href: '/lab-notebook',        icon: BookOpen,     show: eCanDo('lab_notebook','view') },
      { name: 'Incubation',  href: '/research/incubation', icon: FlaskConical, show: eCanDo('batches','view') },
      { name: 'TA Lab',      href: '/lab-bench/ta',        icon: Droplets,     show: eCanDo('batches','view') },
    ]},
    { title: 'R&D Research', items: [
      { name: 'Formulations',href: '/formulations',       icon: Beaker,     show: eCanDo('batches','view') },
      { name: 'Cell Bank',   href: '/research/cell-bank', icon: Dna,        show: eCanDo('batches','view') },
      { name: 'Growth',      href: '/growth-studies',     icon: Activity,   show: eCanDo('batches','view') },
      { name: 'Bioprocess',  href: '/bioprocess',         icon: Microscope, show: eCanDo('batches','view') },
      { name: 'Stability',   href: '/shelf-life',         icon: Clock,      show: eCanDo('batches','view') },
      { name: 'Sensory',     href: '/research',           icon: Users,      show: eCanDo('batches','view'), exact: true },
    ]},
    { title: 'Operations', items: [
      { name: 'Inventory',   href: '/inventory', icon: Package,      show: eCanDo('inventory','view') },
      { name: 'Equipment',   href: '/equipment', icon: Wrench,       show: eCanDo('equipment','view') },
      { name: 'Calendar',    href: '/calendar',  icon: CalendarDays, show: eCanDo('batches','view') },
    ]},
    { title: 'Reports & Analytics', items: [
      { name: 'Analytics Hub', href: '/analytics', icon: PieChart, show: ['admin','ceo','cto'].includes(eRole) || employeeProfile?.department === 'RnD' },
    ]},
    { title: 'Compliance', items: [
      { name: 'Documents',   href: '/documents',               icon: FileText,    show: eCanDo('documents','view') },
      { name: 'Compliance',  href: '/compliance',              icon: ShieldAlert, show: eCanDo('compliance','view') },
      { name: 'Handover',    href: '/shift-handover',          icon: ArrowRight,  show: eCanDo('batches','view') },
      { name: 'Env. Monitor',href: '/environmental-monitoring', icon: Wind,       show: eCanDo('batches','view') },
      { name: 'SCADA',       href: '/scada',                   icon: Wifi,        show: false },
    ]},
    { title: 'Workspace', items: [
      { name: 'Attendance',  href: '/attendance', icon: Clock,       show: eCanDo('attendance','view') },
      { name: 'Leave',       href: '/leave',      icon: CalendarOff, show: eCanDo('leave','view') },
      { name: 'Payslips',    href: '/payslips',   icon: Receipt,     show: eCanDo('payslips','view_own') },
      { name: 'Profile',     href: '/profile',    icon: UserCircle,  show: eCanDo('dashboard','view') },
      { name: 'Directory',   href: '/directory',  icon: Contact,     show: eCanDo('directory','view') },
      { name: 'Help',        href: '/help',       icon: HelpCircle,  show: true },
    ]},
    { title: 'Admin', items: [
      { name: 'Archive',     href: '/archive',         icon: Archive,   show: ['admin','ceo','cto'].includes(eRole) },
      { name: 'Approvals',   href: '/admin/approvals', icon: FileCheck, show: ['admin','ceo','cto'].includes(eRole) },
      { name: 'Audit Logs',  href: '/admin/audit-logs',icon: Shield,    show: ['admin','ceo','cto'].includes(eRole) },
      { name: 'Settings',    href: '/admin/settings',  icon: Settings,  show: ['admin','ceo','cto'].includes(eRole) },
    ]},
  ];

  const isActive = (item) => item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + '/'));

  /* ── Desktop nav item ─────────────── */
  const DesktopItem = ({ item }) => {
    if (!item.show) return null;
    const active = isActive(item);
    const Icon   = item.icon;
    return (
      <Link href={item.href}
        style={{ 
          background: active ? V.activeBg : 'transparent',
          color: active ? V.activeText : V.textLight
        }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = V.hoverBg; e.currentTarget.style.color = V.text; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = V.textLight; } }}
        className="flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl transition-all duration-150 relative group/ni"
        title={!expanded ? item.name : undefined}
      >
        {active && <span style={{ background: V.grad, boxShadow: V.glow }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full" />}
        <Icon style={{ width: '1rem', height: '1rem', flexShrink: 0,
          color: active ? V.activeText : undefined,
          filter: active ? `drop-shadow(0 0 2px ${V.activeBg})` : undefined }}
        />
        {expanded && (
          <span className="text-sm font-semibold whitespace-nowrap leading-none">{item.name}</span>
        )}
        {expanded && item.badge > 0 && (
          <span className="ml-auto text-xs font-black text-white px-1.5 py-0.5 rounded-full shadow-sm"
            style={{ background: V.grad }}>{item.badge > 99 ? '99+' : item.badge}</span>
        )}
        {!expanded && item.badge > 0 && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full shadow-sm"
            style={{ background: '#475569' }} />
        )}
      </Link>
    );
  };

  return (
    <>
      {/* ══ Desktop Sidebar ════════════════════════ */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-50 transition-all duration-300 ease-in-out shadow-[1px_0_20px_rgba(0,0,0,0.02)]"
        style={{
          width: expanded ? 240 : 60,
          background: V.sidebar,
          borderRight: `1px solid ${V.border}`,
        }}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-3 shrink-0" style={{ borderBottom: `1px solid ${V.border}` }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-black"
            style={{ background: V.grad, boxShadow: V.glow }}>
            O₂
          </div>
          {expanded && (
            <span className="ml-3 text-base font-black tracking-tight whitespace-nowrap" style={{ color: V.text }}>OxyOS</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4" style={{ scrollbarWidth: 'none' }}>
          {sections.map((sec, i) => {
            const vis = sec.items.filter(x => x.show);
            if (!vis.length) return null;
            return (
              <div key={i}>
                {expanded && (
                  <p className="px-4 pb-1 text-xs font-black uppercase tracking-[0.18em]" style={{ color: '#94a3b8' }}>{sec.title}</p>
                )}
                {!expanded && i > 0 && <div className="mx-auto mb-2" style={{ width: 28, borderTop: `1px solid ${V.border}` }} />}
                {vis.map(item => <DesktopItem key={item.href} item={item} />)}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 p-3" style={{ borderTop: `1px solid ${V.border}` }}>
          {expanded ? (
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ background: V.hoverBg, border: `1px solid ${V.border}` }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm"
                style={{ background: V.grad }}>
                {initials(employeeProfile?.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: V.text }}>{employeeProfile?.full_name || '—'}</p>
                <p className="text-xs capitalize truncate" style={{ color: V.textLight }}>{employeeProfile?.role || ''}</p>
              </div>
              <button onClick={signOut} title="Sign out"
                className="p-1.5 rounded-lg transition-colors hover:bg-red-50" style={{ color: V.textLight }}>
                <LogOut className="text-red-400" style={{ width: '0.9rem', height: '0.9rem' }} />
              </button>
            </div>
          ) : (
            <button onClick={signOut} title="Sign out"
              className="w-full flex items-center justify-center py-2.5 rounded-xl transition-colors hover:bg-red-50 hover:text-red-500" style={{ color: V.textLight }}>
              <LogOut style={{ width: '1rem', height: '1rem' }} />
            </button>
          )}
        </div>
      </aside>

      {/* ══ Mobile: Full-Screen Navigation Sheet ═══ */}
      {sheet && (
        <div className="md:hidden fixed inset-0 z-[70]" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div
            className="absolute inset-x-0 bottom-[64px] max-h-[88dvh] flex flex-col rounded-3xl overflow-hidden animate-slide-in-bottom shadow-2xl"
            style={{ background: V.sidebar, borderTop: `1px solid ${V.border}` }}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${V.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-md"
                  style={{ background: V.grad }}>
                  O₂
                </div>
                <span className="text-base font-black" style={{ color: V.text }}>OxyOS</span>
              </div>
              <button onClick={() => setSheet(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
                style={{ background: V.hoverBg, color: V.textLight }}>
                <X style={{ width: '1rem', height: '1rem' }} />
              </button>
            </div>

            {/* User Strip */}
            {employeeProfile && (
              <div className="flex items-center gap-3 mx-4 my-3 px-4 py-3 rounded-2xl shadow-sm" style={{ background: V.hoverBg, border: `1px solid ${V.border}` }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 shadow-sm"
                  style={{ background: V.grad }}>
                  {initials(employeeProfile.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate" style={{ color: V.text }}>{employeeProfile.full_name}</p>
                  <p className="text-xs capitalize truncate" style={{ color: V.textLight }}>{employeeProfile.designation || employeeProfile.role}</p>
                </div>
              </div>
            )}

            {/* Grid of all modules */}
            <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: 'none' }}>
              {sections.map((sec, i) => {
                const vis = sec.items.filter(x => x.show);
                if (!vis.length) return null;
                return (
                  <div key={i} className="mb-5">
                    <p className="text-xs font-black uppercase tracking-[0.18em] mb-2 px-1" style={{ color: '#94a3b8' }}>{sec.title}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {vis.map(item => {
                        const active = isActive(item);
                        const Icon   = item.icon;
                        return (
                          <Link key={item.href} href={item.href}
                            className="flex flex-col items-center justify-center gap-2 py-3.5 px-1 rounded-2xl relative transition-all active:scale-95 shadow-sm"
                            style={{ 
                              background: active ? V.activeBg : '#ffffff',
                              border: `1px solid ${active ? '#cbd5e1' : V.border}` 
                            }}
                          >
                            {item.badge > 0 && (
                              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                                style={{ background: '#475569' }} />
                            )}
                            <Icon style={{ width: '1.2rem', height: '1.2rem', color: active ? V.activeText : V.textLight }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: active ? V.text : V.textLight, textAlign: 'center', lineHeight: 1.2 }}>
                              {item.name}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Sign out */}
              <button onClick={signOut}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm mt-2 active:scale-95 transition-all shadow-sm"
                style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444' }}>
                <LogOut style={{ width: '1rem', height: '1rem' }} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Mobile Bottom Navigation Bar ═══════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[60] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: `1px solid ${V.border}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch h-[60px]">
          {QUICK_NAV.filter(i => {
            if (i.href === '/tasks') return eCanDo('tasks', 'view');
            if (i.href === '/attendance') return eCanDo('attendance', 'view');
            return true;
          }).map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon   = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-all active:scale-90"
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-b-full shadow-sm"
                    style={{ background: V.grad }} />
                )}
                <Icon style={{
                  width: '1.2rem', height: '1.2rem',
                  color: active ? V.activeText : '#94a3b8',
                  transition: 'all 0.2s',
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: active ? V.text : '#94a3b8',
                  transition: 'all 0.2s',
                }}>{item.name}</span>
              </Link>
            );
          })}

          {/* Messages with badge */}
          <Link href="/messages"
            className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-all active:scale-90">
            {pathname.startsWith('/messages') && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-b-full shadow-sm"
                style={{ background: V.grad }} />
            )}
            <div className="relative">
              <MessageSquare style={{ width: '1.2rem', height: '1.2rem', color: pathname.startsWith('/messages') ? V.activeText : '#94a3b8' }} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                  style={{ background: '#475569' }} />
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: pathname.startsWith('/messages') ? V.text : '#94a3b8' }}>Inbox</span>
          </Link>

          {/* More / Menu button */}
          <button onClick={() => setSheet(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 transition-all active:scale-90">
            <div className="w-8 h-8 flex items-center justify-center rounded-xl"
              style={{ background: sheet ? V.activeBg : 'transparent', transition: 'all 0.2s' }}>
              <Menu style={{ width: '1.2rem', height: '1.2rem', color: sheet ? V.activeText : '#94a3b8' }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: sheet ? V.text : '#94a3b8', marginTop: -4 }}>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
