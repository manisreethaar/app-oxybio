'use client';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, FlaskConical, Activity, CheckSquare, 
  CalendarOff, Clock, FileText, CalendarDays, Receipt, 
  BookOpen, Users, LogOut, UserCircle, Contact, Menu, X, ShieldAlert, Beaker, Wrench, Package
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { useState } from 'react';

export default function Sidebar() {
  const { employeeProfile, role, canDo, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  if (!employeeProfile) return null;

  const getInitials = (name) => {
    if (!name) return 'OB';
    const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Mr', 'Mrs', 'Ms'];
    const parts = name.split(' ');
    const startIdx = (parts.length > 1 && titles.includes(parts[0])) ? 1 : 0;
    return parts.slice(startIdx, startIdx + 2).map(n => n[0]).join('').toUpperCase();
  };

  // ── Sidebar Menu Definition ─────────────────────────────────────────────
  // Each item now uses canDo() from the RBAC engine instead of a hardcoded roles array.
  // This means the permissions matrix in lib/permissions.js is the SINGLE source of truth.
  const menuSections = [
    {
      title: 'OPERATIONS HUB',
      items: [
        { name: 'Dashboard',         href: '/dashboard',  icon: LayoutDashboard, show: canDo('dashboard', 'view') },
        { name: 'Operations Center', href: '/activity',   icon: Activity,        show: canDo('activity', 'view') },
        { name: 'Task Manager',      href: '/tasks',      icon: CheckSquare,     show: canDo('tasks', 'view') },
      ]
    },
    {
      title: 'LABORATORY',
      items: [
        { name: 'Recipe Management', href: '/formulations', icon: Beaker,          show: canDo('batches', 'view') },
        { name: 'Batch Tracking',    href: '/batches',      icon: FlaskConical,    show: canDo('batches', 'view') },
        { name: 'Digital LNB',       href: '/lab-notebook', icon: BookOpen,        show: canDo('lab_notebook', 'view') },
        { name: 'Equipment Maint.',  href: '/equipment',    icon: Wrench,          show: canDo('equipment', 'view') },
        { name: 'Inventory Hub',     href: '/inventory',    icon: Package,         show: canDo('inventory', 'view') },
        { name: 'SOP Library',       href: '/sops',         icon: BookOpen,        show: canDo('sops', 'view') },
      ]
    },
    {
      title: 'SCIENCE & OPS',
      items: [
        { name: 'Shelf-Life Info',   href: '/shelf-life',   icon: Clock,           show: canDo('batches', 'view') },
        { name: 'Consumer Panels',   href: '/research',     icon: Activity,        show: canDo('batches', 'view') },
        { name: 'Grant Calendar',    href: '/calendar',     icon: CalendarDays,    show: canDo('batches', 'view') },
      ]
    },
    {
      title: 'MY WORKSPACE',
      items: [
        { name: 'Check-In & Attendance', href: '/attendance', icon: Clock, show: canDo('attendance', 'view') },
        { name: 'Leave Requests',    href: '/leave',        icon: CalendarOff,     show: canDo('leave', 'view') },
        { name: 'My Payslips',       href: '/payslips',     icon: Receipt,         show: canDo('payslips', 'view_own') },
      ]
    },
    {
      title: 'ADMIN & COMPLIANCE',
      items: [
        { name: 'Document Vault',    href: '/documents',    icon: FileText,        show: canDo('documents', 'view') },
        { name: 'Regulatory Setup',  href: '/compliance',   icon: CalendarDays,    show: canDo('compliance', 'view') },
        { name: 'CAPA Engine',       href: '/capa',         icon: ShieldAlert,     show: ['admin','ceo','cto'].includes(role) },
        { name: 'Access Control',    href: '/admin/users',  icon: Users,           show: canDo('admin', 'manage_users') },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { name: 'My Profile',        href: '/profile',      icon: UserCircle,    show: canDo('dashboard', 'view') },
        { name: 'Staff Directory',   href: '/directory',    icon: Contact,       show: canDo('directory', 'view') },
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
            "flex items-center px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150",
            isActive 
              ? "text-navy bg-blue-50/80 shadow-sm border border-blue-100/50" 
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 border border-transparent"
          )}
        >
          <Icon className={clsx("w-5 h-5 mr-3 transition-colors", isActive ? "text-navy stroke-[2.5px]" : "text-gray-400")} />
          {item.name}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white h-full border-r border-gray-200 relative z-20">
        <div className="p-8 flex items-center space-x-3 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-navy text-white font-bold flex items-center justify-center shadow-sm">
            O₂
          </div>
          <span className="text-2xl font-black tracking-tighter text-gray-900">OxyOS</span>
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


      </aside>

      {/* Mobile Slide-Up Full Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm transition-all">
          <div className="bg-white/90 backdrop-blur-xl w-full h-[85vh] rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom border-t border-white/50">
            <div className="flex items-center justify-between p-6 border-b border-slate-200/50">
              <span className="text-xl font-black text-slate-800 tracking-tight">OxyOS Hubs</span>
              <button onClick={() => setMobileMenuOpen(false)} className="w-10 h-10 bg-slate-100 rounded-full flex justify-center items-center text-slate-600 hover:bg-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <nav className="flex-1 overflow-y-auto px-6 py-6 pb-24">
              {menuSections.map((section, idx) => {
                const visibleItems = section.items.filter(i => i.show);
                if (visibleItems.length === 0) return null;
                return (
                  <div key={idx} className="mb-6">
                    <h3 className="text-[11px] font-black text-slate-400 tracking-[0.2em] mb-3 uppercase pl-2">
                      {section.title}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {visibleItems.map(item => {
                        const Icon = item.icon;
                        const isActive = pathname.startsWith(item.href);
                        return (
                          <Link 
                            key={item.href} href={item.href} 
                            onClick={() => setMobileMenuOpen(false)}
                            className={clsx(
                              "flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all",
                              isActive ? "bg-blue-50 border-blue-200 text-navy shadow-sm" : "bg-white border-gray-100 text-gray-600 shadow-sm"
                            )}
                          >
                            <Icon className={clsx("w-6 h-6 mb-2", isActive ? "text-navy stroke-[2.5px]" : "text-gray-400")} />
                            <span className="text-xs font-bold">{item.name}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                );
              })}
              
              <button onClick={signOut} className="mt-4 w-full py-4 rounded-2xl bg-red-50 text-red-600 font-bold flex items-center justify-center border border-red-100">
                <LogOut className="w-5 h-5 mr-2" /> Sign Out
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Mobile Bottom Dock (Fixed, No Scrolling) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center z-40 pb-safe shadow-[0_-4px_16px_0_rgba(0,0,0,0.08)] px-2">
        {/* Render only 4 explicit quick actions in the dock */}
        {[
          { name: 'Dash', href: '/dashboard', icon: LayoutDashboard, show: canDo('dashboard', 'view') },
          { name: 'Activity', href: '/activity', icon: Activity, show: canDo('activity', 'view') },
          { name: 'Check-In', href: '/attendance', icon: Clock, show: canDo('attendance', 'view') },
          { name: 'Tasks', href: '/tasks', icon: CheckSquare, show: canDo('tasks', 'view') }
        ].filter(i=>i.show).slice(0, 4).map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link 
              key={item.name} href={item.href}
              className={clsx(
                "flex flex-col items-center justify-center w-16 h-[72px] transition-all relative",
                isActive ? "text-navy" : "text-gray-400 hover:text-gray-700"
              )}
            >
              {isActive && <span className="absolute top-0 w-8 h-1 bg-navy rounded-b-full"></span>}
              <Icon className={clsx("w-6 h-6 mb-1.5 transition-all", isActive ? "stroke-[2.5px] scale-110" : "stroke-2")} />
              <span className={clsx("text-[10px] whitespace-nowrap", isActive ? "font-bold" : "font-medium")}>{item.name}</span>
            </Link>
          )
        })}

        {/* The Menu Toggle Button */}
        <button 
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center w-16 h-[72px] text-slate-400 hover:text-slate-700 transition-all"
        >
          <Menu className="w-6 h-6 mb-1.5 stroke-2" />
          <span className="text-[10px] font-medium whitespace-nowrap">Menu</span>
        </button>
      </nav>
    </>
  );
}
