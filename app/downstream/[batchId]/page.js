import { createClient } from '@/utils/supabase/server';
import DownstreamClient from './DownstreamClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DownstreamBatchPage({ params }) {
  const { batchId } = params;
  const supabase = createClient();
  
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Base Batch Data (0ms latency Server-Side)
  // Fetch batch, flasks, and transitions
  const [
    { data: batch },
    { data: flasks },
    { data: transitions },
    { data: employees },
    { data: equipment }
  ] = await Promise.all([
    supabase.from('batches').select(`
      *,
      recipe:formulations(*),
      employees!batches_created_by_fkey(full_name, initials),
      approved_by:employees!batches_approved_by_fkey(full_name, initials),
      discarded_by_emp:employees!batches_discarded_by_fkey(full_name, initials)
    `).eq('id', batchId).single(),
    supabase.from('batch_flasks').select('*').eq('batch_id', batchId).order('flask_number'),
    supabase.from('batch_transitions').select('*').eq('batch_id', batchId).order('created_at', { ascending: false }),
    supabase.from('employees').select('id, full_name, initials, role').eq('status', 'active'),
    supabase.from('equipment').select('id, name, model, status')
  ]);

  if (!batch) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 font-bold text-sm max-w-md">
          Batch not found or you do not have permission to view it.
        </div>
      </div>
    );
  }

  // Also fetch the specific straining data for DSP
  const { data: strainingData } = await supabase.from('batch_flask_straining').select('*').eq('batch_id', batchId);

  return (
    <DownstreamClient 
      initialBatch={batch} 
      initialFlasks={flasks || []} 
      initialTransitions={transitions || []}
      initialEmployees={employees || []}
      initialEquipment={equipment || []}
      initialStrainingData={strainingData || []}
    />
  );
}
