import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import { redirect } from 'next/navigation';
import { differenceInDays } from 'date-fns';
import NotificationsClient from './NotificationsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications - OxyOS' };

export default async function NotificationsPage() {
  const supabase = createClient();
  const user = getRequestUser();
  if (!user) redirect('/login');

  // Fetch employee profile for role check
  const { data: emp } = await supabase
    .from('employees')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (!emp) redirect('/login');

  const isExec = ['admin', 'ceo', 'cto'].includes(emp.role);

  // Pre-fetch all data in parallel
  const [tasksRes, complianceRes, directNotifsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, priority, due_date')
      .eq('assigned_to', emp.id)
      .eq('status', 'open')
      .order('due_date', { ascending: true })
      .limit(50),

    isExec
      ? supabase
          .from('compliance_items')
          .select('id, title, due_date')
          .neq('status', 'done')
          .order('due_date', { ascending: true })
          .limit(50)
      : Promise.resolve({ data: null }),

    supabase
      .from('notifications')
      .select('id, title, message, is_read, link, created_at')
      .eq('employee_id', emp.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Build alerts array server-side (same logic as before, now pre-computed)
  const alerts = [];
  const today = new Date();

  if (tasksRes.data) {
    tasksRes.data.forEach(t => {
      const isOverdue = t.due_date && differenceInDays(new Date(t.due_date), today) < 0;
      alerts.push({
        id: `task-${t.id}`,
        type: 'task',
        title: t.title,
        priority: t.priority,
        isOverdue,
        url: '/tasks',
        iconType: isOverdue ? 'AlertTriangle' : 'CheckSquare',
        color: isOverdue ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-600 bg-slate-50 border-slate-200',
      });
    });
  }

  if (isExec && complianceRes.data) {
    complianceRes.data.forEach(c => {
      const isOverdue = c.due_date && differenceInDays(new Date(c.due_date), today) < 0;
      if (isOverdue) {
        alerts.push({
          id: `comp-${c.id}`,
          type: 'compliance',
          title: c.title,
          priority: 'urgent',
          isOverdue: true,
          url: '/compliance',
          iconType: 'FileWarning',
          color: 'text-amber-600 bg-amber-50 border-amber-200',
        });
      }
    });
  }

  alerts.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
    return 0;
  });

  return (
    <NotificationsClient
      initialAlerts={alerts}
      initialDirectNotifs={directNotifsRes.data || []}
      employeeId={emp.id}
      role={emp.role}
    />
  );
}
