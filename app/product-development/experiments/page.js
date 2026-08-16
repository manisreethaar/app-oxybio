import { createClient } from '@/utils/supabase/server';
import ExperimentsClient from './ExperimentsClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExperimentsPage() {
  const supabase = createClient();
  
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Data
  const { data: experiments } = await supabase
    .from('rnd_experiments')
    .select('id, experiment_id, title, status, target_volume_ml, target_ph, target_brix, created_at, employees:created_by(full_name)')
    .order('created_at', { ascending: false });

  return <ExperimentsClient initialExperiments={experiments || []} />;
}
