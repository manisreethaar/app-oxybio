import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import GrowthAnalyticsClient from './GrowthAnalyticsClient';

export default async function Page() {
  const supabase = createClient(cookies());
  let from = new Date();
  from.setMonth(from.getMonth() - 6);
  
  const { data: bData } = await supabase.from('batches').select('id, batch_id, created_at, status, product_name').gte('created_at', from.toISOString()).limit(1000);
  
  let products = [];
  const { data: allB } = await supabase.from('batches').select('product_name').limit(1000);
  products = [...new Set((allB || []).map(b => b.product_name).filter(Boolean))];

  let readings = [];
  const batchIds = (bData || []).map(b => b.id);
  
  if (batchIds.length > 0) {
    const { data } = await supabase.from('batch_fermentation_readings').select('batch_id, elapsed_hours, optical_density, ph').limit(5000).in('batch_id', batchIds).order('elapsed_hours', { ascending: true });
    readings = data || [];
  }

  return <GrowthAnalyticsClient initialBatches={bData || []} initialReadings={readings} initialProducts={products} />;
}