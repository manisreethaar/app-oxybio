import { createClient } from '@/utils/supabase/server';
import EquipmentClient from './EquipmentClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EquipmentPage() {
  const supabase = createClient();
  
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Data (0ms latency Server-Side)
  // Fetch equipment and active sterilization batches for usage context
  const [eqRes, sterilRes] = await Promise.all([
    supabase
      .from('equipment')
      .select('*, calibration_logs(*, employees:logged_by(full_name, initials))')
      .order('calibration_date', { foreignTable: 'calibration_logs', ascending: false })
      .limit(5, { foreignTable: 'calibration_logs' })
      .order('name'),
    supabase
      .from('batch_stage_sterilisation')
      .select('equipment_id, batches(id, batch_id, status)')
      .order('created_at', { ascending: false })
      .limit(300)
  ]);

  const initialEquipment = eqRes.data || [];
  const initialSterilData = sterilRes.data || [];

  // Pass data to Client Component for Optimistic UI and interactivity
  return <EquipmentClient initialEquipment={initialEquipment} initialSterilData={initialSterilData} />;
}
