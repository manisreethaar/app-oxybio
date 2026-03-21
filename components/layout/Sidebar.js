'use client';
import { useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, FlaskConical, Activity, CheckSquare, 
  CalendarOff, Clock, FileText, CalendarDays, Receipt, 
  BookOpen, Users, Settings, LogOut, Menu, X
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';

export default function Sidebar() {
  const { employeeProfile, signOut } = useAuth();
  const pathname = usePathname();
  
  if (!employeeProfile) return null;

  const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'O2';
  };

  const menuSections = [
    {
      title: 'OVERVIEW',
      items: [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'staff', 'intern'] }
      ]
    },
    {
      title: 'LAB OPERATIONS',
      items: [
        { name: 'Batch Manager', href: '/batches', icon: FlaskConical, roles: ['admin', 'staff', 'intern'] },
        { name: 'Activity Feed', href: '/activity', icon: Activity, roles: ['admin', 'staff', 'intern'] },
        { name: 'SOPs', href: '/sops', icon: BookOpen, roles: ['admin', 'staff', 'intern'] }
      ]
    },
    {
      title: 'PEOPLE',
      items: [
        { name: 'Leave Manager', href: '/leave', icon: CalendarOff, roles: ['admin', 'staff'] },
        { name: 'Attendance', href: '/attendance', icon: Clock, roles: ['admin', 'staff', 'intern'] },
        { name: 'Tasks', href: '/tasks', icon: CheckSquare, roles: ['admin', 'staff', 'intern'] }
      ]
    },
    {
      title: 'COMPLIANCE',
      items: [
        { name: 'Documents', href: '/documents', icon: FileText, roles: ['admin', 'staff'] },
        { name: 'Compliance Calendar', href: '/compliance', icon: CalendarDays, roles: ['admin'] },
        { name: 'Payslips', href: '/payslips', icon: Receipt, roles: ['admin', 'staff'] },
        { name: 'Team Management', href: '/admin/users', icon: Users, roles: ['admin'] }
      ]
    }
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-full">
        <div className="p-6 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-md bg-teal-800 text-white font-bold flex items-center justify-center">
            O₂
          </div>
          <span className="text-xl font-bold tracking-tight text-teal-950">OxyOS</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          {menuSections.map((section, idx) => (
            <div key={idx} className="mb-6">
              <h3 className="px-6 text-xs font-semibold text-gray-500 tracking-wider mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.filter(item => item.roles.includes(employeeProfile.role)).map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={clsx(
                          "flex items-center px-6 py-2.5 text-sm font-medium transition-colors",
                          isActive 
                            ? "text-teal-800 bg-teal-50 border-l-4 border-teal-800" 
                            : "text-gray-600 border-l-4 border-transparent hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        <Icon className={clsx("w-5 h-5 mr-3", isActive ? "text-teal-800" : "text-gray-400")} />
                        {item.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 font-medium flex items-center justify-center">
              {getInitials(employeeProfile.full_name)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-gray-900 truncate">{employeeProfile.full_name}</p>
              <p className="text-xs text-gray-500 capitalize">{employeeProfile.role}</p>
            </div>
          </div>
          <button 
            onClick={signOut}
            className="w-full flex items-center text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-start sm:justify-around items-center z-50 pb-safe overflow-x-auto hide-scrollbar scroll-smooth">
        {menuSections.flatMap(s => s.items).filter(item => item.roles.includes(employeeProfile.role)).map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={clsx(
                "flex flex-col items-center justify-center min-w-[72px] px-2 py-3 h-16 min-h-[44px] flex-shrink-0 transition-colors",
                isActive ? "text-teal-800" : "text-gray-500 hover:text-gray-900"
              )}
            >
              <Icon className={clsx("w-5 h-5 mb-1", isActive ? "stroke-[2.5px]" : "stroke-2")} />
              <span className="text-[10px] font-medium whitespace-nowrap">{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </>
  );
}
