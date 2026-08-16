import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import BatchAnalyticsClient from './BatchAnalyticsClient';

export default async function Page() {
  const supabase = createClient(cookies());
  let from = new Date();
  from.setMonth(from.getMonth() - 6);
  
  const { data: bData } = await supabase.from('batches').select('id, batch_id, created_at, status, product_name').gte('created_at', from.toISOString());
  
  let products = [];
  const { data: aB } = await supabase.from('batches').select('product_name').limit(1000);
  products = [...new Set((aB || []).map(b => b.product_name).filter(Boolean))];

  let readings = [];
  let endpoints = [];
  const ids = (bData || []).map(b => b.id);
  if (ids.length > 0) {
    const [rRes, eRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('batch_id,elapsed_hours,ph,incubator_temp_c,optical_density,brix,titratable_acidity_pct,foam_level,plating_result,visual_appearance,notes,logged_at').limit(5000).in('batch_id', ids).order('elapsed_hours', { ascending: true }),
      supabase.from('batch_flask_endpoints').select('batch_id,flask_id,total_hours,final_ph,sensory_overall,titratable_acidity_pct,aroma,colour_desc,texture,notes').limit(5000).in('batch_id', ids)
    ]);
    readings = rRes.data || [];
    endpoints = eRes.data || [];
  }

  return <BatchAnalyticsClient initialBatches={bData || []} initialReadings={readings} initialEndpoints={endpoints} initialProducts={products} />;
}