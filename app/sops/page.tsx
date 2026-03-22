import { createClient } from '@/utils/supabase/server';
import SopClient from './SopClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'SOP Library - OxyOS' };

export default async function SopsPage() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect('/login');
  }

  // Pre-fetch active Standard Operating Procedures (SOPs) checking acknowledgment statuses
  const { data: sops } = await supabase
    .from('sop_library')
    .select('*, sop_acknowledgements(employee_id)')
    .eq('is_active', true);

  const initialSops = (sops || []).map(sop => ({
    ...sop,
    is_acknowledged: (sop.sop_acknowledgements || []).some((ack: any) => ack.employee_id === user.id)
  }));

  return <SopClient initialSops={initialSops} />;
}
