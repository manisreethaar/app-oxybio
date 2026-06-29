export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { PieChart, Filter, Activity, BarChart2, CalendarDays } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Analytics Hub - OxyOS',
};

const NAV_LINKS = [
  { name: 'Overview', href: '/analytics', icon: PieChart },
  { name: 'Batch Variations', href: '/analytics/batches', icon: Activity },
  { name: 'Lab & Growth Studies', href: '/analytics/lab', icon: BarChart2 },
];

export default async function AnalyticsLayout({ children }) {
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    redirect('/login');
  }

  // Double check admin/RnD at layout level
  const { data: profile } = await supabase
    .from('employees')
    .select('role, department')
    .ilike('email', user.email)
    .single();

  const isAdmin = ['admin', 'ceo', 'cto'].includes(profile?.role?.toLowerCase());
  const isRnD = profile?.department === 'RnD';

  if (!isAdmin && !isRnD) {
    redirect('/dashboard');
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in pb-32 md:pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight flex items-center">
            <PieChart className="w-8 h-8 mr-3 text-indigo-600" />
            Analytics Hub
          </h1>
          <p className="mt-2 text-slate-500 font-medium">Comparative and deep analysis across modules.</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-slate-200/50 p-2 mb-8 flex overflow-x-auto custom-scrollbar shadow-sm">
        {NAV_LINKS.map(link => {
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              href={link.href}
              className="flex items-center px-4 py-2.5 mr-2 rounded-xl text-sm font-bold transition-all duration-200 hover:bg-slate-100 text-slate-600 whitespace-nowrap"
            >
              <Icon className="w-4 h-4 mr-2" />
              {link.name}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
