import { createClient } from '@/utils/supabase/server';
import BatchDetailClient from './BatchDetailClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BatchDetailPage({ params }) {
  const { batchId } = await params;
  const supabase = createClient();

  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Data
  const [bRes, stockRes, historyRes] = await Promise.all([
    supabase.from('batches').select('*').eq('id', batchId).maybeSingle(),
    supabase.from('inventory_stock').select('id, current_quantity, supplier_batch_number, inventory_items(name, unit, category)').gt('current_quantity', 0),
    supabase
      .from('product_development_formulations')
      .select('id, target_volume_ml, target_ph, target_brix, notes, created_at, employees(full_name), product_development_ingredients(id, item_name, amount, unit)')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
  ]);

  return (
    <BatchDetailClient
      initialBatch={bRes.data || null}
      initialStock={stockRes.data || []}
      initialHistory={historyRes.data || []}
    />
  );
}
