import { createClient } from '@/utils/supabase/server';
import { getRequestUser } from '@/utils/supabase/request-user';
import { redirect } from 'next/navigation';
import GrowthStudyDetailClient from './GrowthStudyDetailClient';

export const metadata = { title: 'Growth Study Detail - OxyOS' };

export default async function GrowthStudyDetailPage({ params }) {
  const supabase = createClient();
  const user = getRequestUser();
  if (!user) redirect('/login');

  const { id } = await params;

  const [studyRes, tpRes, measRes, plateRes, usageRes, editReqsRes] = await Promise.all([
    supabase
      .from('growth_studies')
      .select(`
        *,
        cell_bank_strains(id, name, accession_number),
        cell_bank_preparations(id, prep_code, type, passage_number),
        formulations(id, name, code, version, base_volume_ml, ingredients),
        cell_bank_vials!growth_studies_vial_id_fkey(id, vial_code, storage_temp, freezer_id, rack, box, position, status),
        employees!growth_studies_created_by_fkey(full_name)
      `)
      .eq('id', id)
      .single(),

    supabase
      .from('growth_study_time_points')
      .select('*')
      .eq('study_id', id)
      .order('planned_hour'),

    supabase
      .from('growth_measurements')
      .select('*, recorded_by, recorder:employees!growth_measurements_recorded_by_fkey(id, full_name, initials)')
      .eq('study_id', id)
      .order('actual_hour'),

    supabase
      .from('growth_plate_observations')
      .select('*, employees!growth_plate_observations_recorded_by_fkey(full_name)')
      .eq('study_id', id)
      .order('time_point_hours'),

    supabase
      .from('inventory_usage')
      .select('id, quantity_used, stage, notes, inventory_stock!inventory_usage_stock_id_fkey(id, supplier_batch_number, inventory_items!inventory_stock_item_id_fkey(name, unit))')
      .eq('growth_study_id', id)
      .order('created_at', { ascending: true }),

    supabase
      .from('edit_requests')
      .select('record_id')
      .eq('status', 'pending')
  ]);

  if (studyRes.error) {
    console.error("Growth Study Detail SSR Error:", studyRes.error);
    // Not returning redirect here to let the client component handle 404/not found state if desired,
    // or we could throw. The original code just had data = null if failed.
  }

  const initialData = {
    study: studyRes.data,
    time_points: tpRes.data || [],
    measurements: measRes.data || [],
    plate_observations: plateRes.data || [],
    inventory_usage: usageRes.data || [],
  };

  const initialPendingIds = (editReqsRes.data || []).map(r => r.record_id);

  return (
    <GrowthStudyDetailClient 
      initialData={initialData} 
      initialPendingIds={initialPendingIds} 
    />
  );
}
