import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import StabilityAnalyticsClient from './StabilityAnalyticsClient';

export default async function Page() {
  const supabase = createClient(cookies());
  
  const { data: sls } = await supabase.from('shelf_life_studies').select('id, title, product_name, start_date, expected_duration_days, status, batch_id, temperature_c, condition_notes').limit(1000);
  
  let testResults = [];
  const studyIds = (sls || []).map(s => s.id);
  
  if (studyIds.length > 0) {
    const { data } = await supabase.from('shelf_life_test_results').select('*').in('study_id', studyIds).limit(5000);
    testResults = data || [];
  }

  return <StabilityAnalyticsClient initialStudies={sls || []} initialTestResults={testResults} />;
}