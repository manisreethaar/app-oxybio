import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import ActivityClient from './ActivityClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Activity Logs - OxyOS' };

export default async function ActivityPage() {
  const supabase = createClient();
  const user = getRequestUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('employees')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profile as any)?.role || 'staff';
  const isExecUser = ['admin', 'ceo', 'cto'].includes(role);
  const PAGE_SIZE = 50;

  // Base promises
  const promises: Promise<any>[] = [
    supabase.from('batches').select('batch_id, product_name, status').is('archived_at', null).in('status', ['fermenting', 'in-progress', 'testing', 'inoculation', 'media_prep', 'sterilisation', 'harvest', 'downstream', 'qc_hold']).limit(20),
    supabase.from('equipment').select('id, name, model, status').eq('status', 'Operational')
  ];

  if (isExecUser) {
    promises.push(
      supabase.from('activity_log').select('id, created_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, batch_id, severity, founder_comment, employee_id, archived_at, employees!activity_log_employee_id_fkey(full_name)').is('archived_at', null).order('created_at', { ascending: false }).limit(PAGE_SIZE)
    );
    promises.push(
      supabase.from('activity_log').select('id, created_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, batch_id, severity, founder_comment, employee_id, archived_at, employees!activity_log_employee_id_fkey(full_name)').not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(100)
    );
    promises.push(
      supabase.from('activity_log').select('id, created_at, activity_description, issue_description, founder_comment, employee_id, employees!activity_log_employee_id_fkey(full_name), batch_id').eq('issue_observed', true).is('archived_at', null).order('created_at', { ascending: false }).limit(200)
    );
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    promises.push(supabase.from('employees').select('id, full_name, designation, role').eq('is_active', true).neq('role', 'admin').neq('role', 'ceo').neq('role', 'cto'));
    promises.push(supabase.from('attendance_log').select('employee_id, check_out_time').eq('date', today));
    promises.push(supabase.from('tasks').select('id, title, priority, due_date, assigned_user:employees!tasks_assigned_to_fkey(full_name)').neq('status', 'done').neq('status', 'cancelled').lt('due_date', today).order('due_date', { ascending: true }).limit(5));
    promises.push(supabase.from('tasks').select('id, title, assigned_user:employees!tasks_assigned_to_fkey(full_name)').eq('approval_status', 'pending_review').limit(5));
  } else {
    promises.push(
      supabase.from('activity_log').select('id, created_at, log_date, start_time, end_time, activity_description, issue_observed, issue_description, batch_id, severity, founder_comment, employee_id, archived_at, employees!activity_log_employee_id_fkey(full_name)').eq('employee_id', user.id).is('archived_at', null).order('created_at', { ascending: false }).limit(PAGE_SIZE)
    );
  }

  const results = await Promise.all(promises);

  return (
    <ActivityClient 
      initialBatches={results[0].data || []}
      initialEquipment={results[1].data || []}
      initialLogs={results[2].data || []}
      initialArchived={isExecUser ? (results[3]?.data || []) : []}
      initialIssues={isExecUser ? (results[4]?.data || []) : []}
      initialEmployees={isExecUser ? (results[5]?.data || []) : []}
      initialAttendance={isExecUser ? (results[6]?.data || []) : []}
      initialDueTasks={isExecUser ? (results[7]?.data || []) : []}
      initialPendingTasks={isExecUser ? (results[8]?.data || []) : []}
    />
  );
}
