'use client';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, FlaskConical, Activity, CheckSquare, 
  CalendarOff, Clock, FileText, CalendarDays, Receipt, 
  BookOpen, Users, LogOut, UserCircle, Contact, Bell
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';

export default function Sidebar() {
  const { employeeProfile, role, canDo, signOut } = useAuth();
  const pathname = usePathname();
  
  if (!employeeProfile) return null;

  const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'O2';
  };

  // ── Sidebar Menu Definition ─────────────────────────────────────────────
  // Each item now uses canDo() from the RBAC engine instead of a hardcoded roles array.
  // This means the permissions matrix in lib/permissions.js is the SINGLE source of truth.
  const menuSections = [
    {
      title: 'OVERVIEW',
      items: [
        { name: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard, show: canDo('dashboard', 'view') },
      ]
    },
    {
      title: 'LAB OPERATIONS',
      items: [
        { name: 'Batch Manager',  href: '/batches',   icon: FlaskConical, show: canDo('batches', 'view') },
        { name: 'Activity Feed',  href: '/activity',  icon: Activity,     show: canDo('activity', 'view') },
        { name: 'SOPs',           href: '/sops',      icon: BookOpen,     show: canDo('sops', 'view') },
      ]
    },
    {
      title: 'PEOPLE',
      items: [
        { name: 'Leave Manager',  href: '/leave',       icon: CalendarOff, show: canDo('leave', 'view') },
        { name: 'Attendance',     href: '/attendance',  icon: Clock,       show: canDo('attendance', 'view') },
        { name: 'Tasks',          href: '/tasks',       icon: CheckSquare, show: canDo('tasks', 'view') },
      ]
    },
    {
      title: 'COMPLIANCE',
      items: [
        { name: 'Documents',          href: '/documents',   icon: FileText,    show: canDo('documents', 'view') },
        { name: 'Compliance',         href: '/compliance',  icon: CalendarDays,show: canDo('compliance', 'view') },
        { name: 'Payslips',           href: '/payslips',    icon: Receipt,     show: canDo('payslips', 'view_own') },
        { name: 'Team Management',    href: '/admin/users', icon: Users,       show: canDo('admin', 'manage_users') },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { name: 'Notifications',      href: '/notifications', icon: Bell,        show: canDo('notifications', 'view') },
        { name: 'My Profile',         href: '/profile',       icon: UserCircle,  show: canDo('dashboard', 'view') },
        { name: 'Employee Directory', href: '/directory',     icon: Contact,     show: canDo('admin', 'view') },
      ]
    }
  ];

  const renderNavItem = (item) => {
    if (!item.show) return null;
    const isActive = pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <li key={item.name}>
        <Link
          href={item.href}
          className={clsx(
            "flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300",
            isActive 
              ? "text-teal-900 bg-white/80 shadow-sm border border-white/60" 
              : "text-slate-500 hover:bg-white/40 hover:text-slate-800 border border-transparent"
          )}
        >
          <Icon className={clsx("w-5 h-5 mr-3 transition-colors", isActive ? "text-teal-600 stroke-[2.5px]" : "text-slate-400")} />
          {item.name}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 glass-panel h-full border-r border-white/50 relative z-20">
        <div className="p-8 flex items-center space-x-3 border-b border-slate-200/50">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white font-bold flex items-center justify-center shadow-md">
            O₂
          </div>
          <span className="text-2xl font-black tracking-tighter text-slate-800">OxyOS</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 custom-scrollbar">
          {menuSections.map((section, idx) => {
            const visibleItems = section.items.filter(i => i.show);
            if (visibleItems.length === 0) return null;
            return (
              <div key={idx} className="mb-8">
                <h3 className="px-8 text-[11px] font-black text-slate-400 tracking-[0.2em] mb-3 uppercase">
                  {section.title}
                </h3>
                <ul className="space-y-1.5 px-3">
                  {visibleItems.map(renderNavItem)}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="p-5 border-t border-slate-200/50 bg-white/30 backdrop-blur-md">
          <div className="flex items-center mb-4 p-3 bg-white/60 rounded-2xl border border-white/60 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 text-teal-800 font-bold flex items-center justify-center shrink-0 border border-white shadow-sm">
              {getInitials(employeeProfile.full_name)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{employeeProfile.full_name}</p>
              <p className="text-[11px] font-bold text-teal-600 uppercase tracking-wider">{employeeProfile.designation || employeeProfile.role || 'Staff'}</p>
            </div>
          </div>
          <button 
            onClick={signOut}
            className="w-full flex items-center justify-center py-2.5 text-sm font-bold text-slate-500 hover:text-red-600 hover:bg-red-50/50 rounded-xl transition-colors duration-300"
          >
            <LogOut className="w-4 h-4 mr-2 stroke-[2.5px]" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation - show only key items for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-white/60 flex justify-start sm:justify-around items-center z-50 pb-safe overflow-x-auto hide-scrollbar scroll-smooth px-2 shadow-[0_-8px_32px_0_rgba(31,38,135,0.05)]">
        {menuSections.flatMap(s => s.items).filter(item => item.show).map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={clsx(
                "flex flex-col items-center justify-center min-w-[76px] px-2 py-3 h-[72px] flex-shrink-0 transition-all duration-300 relative",
                isActive ? "text-teal-700" : "text-slate-400 hover:text-slate-700"
              )}
            >
              {isActive && <span className="absolute top-0 w-8 h-1 bg-teal-500 rounded-b-full"></span>}
              <Icon className={clsx("w-6 h-6 mb-1.5 transition-all duration-300", isActive ? "stroke-[2.5px] scale-110" : "stroke-2")} />
              <span className={clsx("text-[10px] whitespace-nowrap transition-all duration-300", isActive ? "font-bold" : "font-medium")}>{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </>
  );
}
