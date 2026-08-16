import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import InsightsAnalyticsClient from './InsightsAnalyticsClient';

export default async function Page() {
  const supabase = createClient(cookies());
  let from = new Date();
  from.setMonth(from.getMonth() - 6);
  
  const { data: bData } = await supabase.from('batches').select('id, batch_id, created_at, status, product_name, experiment_type, current_stage').gte('created_at', from.toISOString()).limit(1000);
  
  let products = [];
  const { data: allB } = await supabase.from('batches').select('product_name').limit(1000);
  products = [...new Set((allB || []).map(b => b.product_name).filter(Boolean))];

  let readings = [], endpoints = [], tasks = [], notes = [];
  const batchIds = (bData || []).map(b => b.id);
  
  if (batchIds.length > 0) {
    const [rRes, eRes, tRes, nRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('batch_id, elapsed_hours, ph, brix, optical_density, titratable_acidity_pct').limit(5000).in('batch_id', batchIds),
      supabase.from('batch_flask_endpoints').select('batch_id, flask_id, total_hours, final_ph, titratable_acidity_pct, sensory_overall, aroma').limit(5000).in('batch_id', batchIds),
      supabase.from('tasks').select('id, related_record_id, status, title, created_at').in('related_record_id', batchIds),
      supabase.from('lab_notebook_entries').select('id, batch_id, entry_type, content, tags, created_at').in('batch_id', batchIds)
    ]);
    readings = rRes.data || [];
    endpoints = eRes.data || [];
    tasks = tRes.data || [];
    notes = nRes.data || [];
  }

  return <InsightsAnalyticsClient initialBatches={bData || []} initialReadings={readings} initialEndpoints={endpoints} initialTasks={tasks} initialNotes={notes} initialProducts={products} />;
}