import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import TasksClient from './TasksClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Tasks - OxyOS' };

export default async function TasksPage() {
  const supabase = createClient();
  const user = getRequestUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('employees').select('id, full_name, role').eq('id', user.id).single();
  const role = profile?.role || 'staff';
  const isAdmin = ['admin', 'ceo', 'cto'].includes(role);

  // Pending edit requests
  const { data: editReqs } = await supabase.from('edit_requests').select('record_id').eq('status', 'pending');
  const initialPendingIds = (editReqs || []).map(r => r.record_id);

  // SOPs
  const { data: sops } = await supabase.from('sop_library').select('id, title, sop_id').eq('is_active', true).order('title').limit(1000);

  // Employees
  let emps = [{ id: user.id, full_name: profile?.full_name || 'Me' }];
  if (isAdmin) {
    const { data: allEmps } = await supabase.from('employees').select('id, full_name, role').eq('is_active', true);
    if (allEmps) emps = allEmps;
  }

  // Tasks
  let query = supabase.from('tasks').select('*, assigned_user:employees!tasks_assigned_to_fkey(full_name, initials), creator:employees!tasks_assigned_by_fkey(full_name)').is('archived_at', null).order('due_date', { ascending: true }).limit(300);
  if (!isAdmin) {
    query = query.or(`assigned_to.eq.${user.id},assigned_to.is.null`);
  }
  const { data: tasks } = await query;

  // CAPA map
  let capaMap = {};
  const capaTaskIds = (tasks || []).filter(t => t.title?.startsWith('[CAPA]')).map(t => t.id);
  if (capaTaskIds.length > 0) {
    const { data: capaLinks } = await supabase.from('capa_actions').select('task_id, investigation_id').in('task_id', capaTaskIds);
    const invIds = [...new Set((capaLinks || []).map(c => c.investigation_id).filter(Boolean))];
    if (invIds.length > 0) {
      const { data: devData } = await supabase.from('deviations').select('id, batches(id, batch_id)').in('id', invIds);
      (capaLinks || []).forEach(ca => {
        const dev = (devData || []).find(d => d.id === ca.investigation_id);
        if (dev?.batches) capaMap[ca.task_id] = dev.batches;
      });
    }
  }

  return (
    <TasksClient 
      initialTasks={tasks || []}
      initialEmployees={emps}
      initialSops={sops || []}
      initialCapaTaskBatchMap={capaMap}
      initialPendingIds={initialPendingIds}
    />
  );
}
