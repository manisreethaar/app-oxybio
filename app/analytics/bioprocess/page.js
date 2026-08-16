import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import BioprocessAnalyticsClient from './BioprocessAnalyticsClient';

export default async function Page() {
  const supabase = createClient(cookies());
  let from = new Date();
  from.setMonth(from.getMonth() - 6);
  
  const { data: bData } = await supabase.from('batches').select('id, batch_id, product_name, status, created_at').gte('created_at', from.toISOString()).limit(1000);
  
  let products = [];
  const { data: allB } = await supabase.from('batches').select('product_name').limit(1000);
  products = [...new Set((allB || []).map(b => b.product_name).filter(Boolean))];

  let readings = [], endpoints = [], titrationLogs = [];
  const batchIds = (bData || []).map(b => b.id);
  
  if (batchIds.length > 0) {
    const [rRes, eRes, tRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('batch_id, elapsed_hours, ph, brix, optical_density, titratable_acidity_pct, incubator_temp_c').limit(5000).in('batch_id', batchIds),
      supabase.from('batch_flask_endpoints').select('batch_id, flask_id, total_hours, final_ph, titratable_acidity_pct, sensory_overall').limit(5000).in('batch_id', batchIds),
      supabase.from('titration_logs').select('*').limit(5000).in('source_id', batchIds).eq('source_type', 'batch').order('created_at', { ascending: false }),
    ]);
    readings = rRes.data || [];
    endpoints = eRes.data || [];
    titrationLogs = tRes.data || [];
  }

  return <BioprocessAnalyticsClient initialBatches={bData || []} initialReadings={readings} initialEndpoints={endpoints} initialTitrationLogs={titrationLogs} initialProducts={products} />;
}