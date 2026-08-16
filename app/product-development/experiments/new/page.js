import { createClient } from '@/utils/supabase/server';
import NewExperimentClient from './NewExperimentClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NewExperimentPage() {
  const supabase = createClient();
  
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Data
  const { data: stockData } = await supabase
    .from('inventory_stock')
    .select('id, current_quantity, supplier_batch_number, inventory_items(name, unit, category)')
    .gt('current_quantity', 0);

  return <NewExperimentClient initialStock={stockData || []} />;
}
