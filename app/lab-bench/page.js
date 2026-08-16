import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { getLabBenchQueue, getLabBenchRecent, getLabBenchPendingEdits } from './queries';
import LabBenchClient from './LabBenchClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LabBenchPage() {
  const supabase = createClient();
  const user = await getApiUserOrFallback(supabase);

  if (!user) {
    redirect('/login');
  }

  const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();

  const [queueRes, recentRes, pendingIds] = await Promise.all([
    getLabBenchQueue(supabase),
    emp ? getLabBenchRecent(supabase, emp.id) : { data: [] },
    emp ? getLabBenchPendingEdits(supabase, emp.id) : []
  ]);

  return (
    <LabBenchClient 
      initialQueue={queueRes} 
      initialRecentEntries={recentRes.data || []} 
      initialPendingIds={pendingIds || []} 
    />
  );
}
