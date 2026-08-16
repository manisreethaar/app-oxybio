import { createClient } from '@/utils/supabase/server';
import ProductDevelopmentClient from './ProductDevelopmentClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProductDevelopmentPage() {
  const supabase = createClient();
  
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Data
  const { data: batches } = await supabase
    .from('batches')
    .select('id, batch_id, current_stage, status, created_at, product_development_formulations!inner(id, created_at)')
    .order('created_at', { ascending: false });

  return <ProductDevelopmentClient initialBatches={batches || []} />;
}
