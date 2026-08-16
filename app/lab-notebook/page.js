import { createClient } from '@/utils/supabase/server';
import LabNotebookClient from './LabNotebookClient';

export const metadata = { title: 'Digital LNB | OXYBIO' };
export const dynamic = 'force-dynamic';

export default async function LabNotebookPage() {
  const supabase = createClient();
  
  // SSR Data Fetch for 0ms load times
  const [{ data: entries }, { data: batches }] = await Promise.all([
    supabase
      .from('lab_notebook_entries')
      .select(`
        id,
        title,
        status,
        batch_stage,
        created_at,
        created_by,
        batches (
          id,
          batch_id,
          variant,
          status
        ),
        cell_bank_preparations (
          id,
          prep_code,
          type,
          status
        ),
        flask:batch_flasks!lab_notebook_entries_flask_id_fkey (
          flask_label
        ),
        author:employees!lab_notebook_entries_created_by_fkey (
          id,
          full_name,
          initials,
          role
        ),
        countersigner:employees!lab_notebook_entries_countersigned_by_fkey (
          full_name,
          role
        )
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('batches')
      .select('id, batch_id, variant')
      .limit(100)
  ]);

  return (
    <div className="pb-24 min-h-[100dvh] bg-slate-50">
      <LabNotebookClient 
        initialEntries={entries || []} 
        initialBatches={batches || []} 
      />
    </div>
  );
}
