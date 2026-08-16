import { createClient } from '@/utils/supabase/server';
import ExperimentDetailClient from './ExperimentDetailClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExperimentDetailPage({ params }) {
  const { id } = await params;
  const supabase = createClient();

  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Data
  const { data: experiment } = await supabase
    .from('rnd_experiments')
    .select(`
      id, experiment_id, title, status, target_volume_ml, target_ph, target_brix, notes,
      review_notes, reviewed_at, created_at,
      created_by_employee:created_by(full_name),
      reviewed_by_employee:reviewed_by(full_name),
      rnd_experiment_ingredients(id, item_name, amount, unit)
    `)
    .eq('id', id)
    .maybeSingle();

  return <ExperimentDetailClient initialExperiment={experiment || null} />;
}
