import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import TaClient from './TaClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TaPage() {
  const supabase = createClient();
  const user = await getApiUserOrFallback(supabase);
  if (!user) redirect('/login');

  const [logsRes, batchesRes, expRes, invRes] = await Promise.all([
    supabase.from('titration_logs')
      .select('*, logger:employees!titration_logs_logged_by_fkey(full_name, initials)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('batches').select('id, batch_id, product_name, status')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('bioprocess_experiments').select('id, title, type')
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('inventory_items').select('id, name, category, unit')
      .order('name', { ascending: true })
  ]);

  return (
    <TaClient 
      initialLogs={logsRes.data || []}
      initialBatches={batchesRes.data || []}
      initialExperiments={expRes.data || []}
      initialInventoryItems={invRes.data || []}
    />
  );
}
