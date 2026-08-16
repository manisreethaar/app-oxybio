import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import LabAnalyticsClient from './LabAnalyticsClient';

export default async function Page() {
  const supabase = createClient(cookies());
  let from = new Date();
  from.setMonth(from.getMonth() - 6);
  
  const { data: sData } = await supabase.from('lab_samples').select('id, sample_id, source_type, source_label, flask_label, log_hour, collected_at, status').gte('collected_at', from.toISOString()).limit(1000);
  
  let testResults = [];
  const sampleIds = (sData || []).map(s => s.id);
  
  if (sampleIds.length > 0) {
    const { data } = await supabase.from('lab_test_results').select('*').in('sample_id', sampleIds).limit(5000);
    testResults = data || [];
  }

  return <LabAnalyticsClient initialSamples={sData || []} initialTestResults={testResults} />;
}