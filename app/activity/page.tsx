import { createClient } from '@/utils/supabase/server';
import ActivityClient from './ActivityClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Activity Logs - OxyOS' };

export default async function ActivityPage() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect('/login');
  }

  // Fetch employee profile to determine role
  const { data: profile } = await supabase
    .from('employees')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = (profile as any)?.role || 'staff';

  const [batchesRes, logRes] = await Promise.all([
    supabase.from('batches').select('batch_id, product_name, status').in('status', ['fermenting', 'in-progress', 'testing', 'inoculation', 'media_prep', 'sterilisation', 'harvest', 'downstream', 'qc_hold']).limit(20),
    role === 'admin' 
      ? supabase.from('activity_log').select('*, employees(full_name)').order('created_at', { ascending: false }).limit(50)
      : supabase.from('activity_log').select('*, employees(full_name)').eq('employee_id', user.id).order('created_at', { ascending: false }).limit(50)
  ]);

  return (
    <ActivityClient 
      initialBatches={batchesRes.data || []}
      initialLogs={logRes.data || []}
    />
  );
}
