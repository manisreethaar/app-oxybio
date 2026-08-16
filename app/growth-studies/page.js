import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import { redirect } from 'next/navigation';
import GrowthStudiesClient from './GrowthStudiesClient';

export const metadata = { title: 'Growth Studies - OxyOS' };

export default async function GrowthStudiesPage() {
  const supabase = createClient();
  const user = getRequestUser();
  if (!user) redirect('/login');

  // Pre-fetch studies
  const { data: studies } = await supabase
    .from('growth_studies')
    .select(`
      id, study_code, name, study_type, status, vessel_type, temperature_c,
      inoculation_time, expected_duration_hours, completed_at, created_at, created_by,
      creator:employees!growth_studies_created_by_fkey(id, full_name, initials),
      cell_bank_strains(id, name),
      cell_bank_preparations(id, prep_code, type),
      formulations(id, name, code),
      growth_study_time_points(id, status)
    `)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  // Pre-fetch pending edit requests
  const { data: editReqs } = await supabase
    .from('edit_requests')
    .select('record_id')
    .eq('status', 'pending');
    
  const initialPendingIds = (editReqs || []).map(r => r.record_id);

  return (
    <GrowthStudiesClient 
      initialStudies={studies || []} 
      initialPendingIds={initialPendingIds}
    />
  );
}
