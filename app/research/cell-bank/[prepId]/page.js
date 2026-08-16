import { createClient } from '@/utils/supabase/server';
import PrepDetailClient from './PrepDetailClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PrepDetailPage({ params }) {
  const { prepId } = await params;
  const supabase = createClient();

  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Preparation Data
  const { data: prepData } = await supabase
    .from('cell_bank_preparations')
    .select(`
      *,
      linked_formulation:formulations(id, code, name, version, category, status),
      cell_bank_strains(id, name, source_type, accession_number, isolation_source, taxonomy, strain_short_code, notes, formulation_id, characterization, linked_formulation:formulations(id, code, name, version, category, status)),
      parent:parent_id(id, prep_code, type, step_data, formulation_id),
      employees!cell_bank_preparations_created_by_fkey(full_name)
    `)
    .eq('id', prepId)
    .single();

  if (prepData) {
    // Additional queries from the backend route
    if (prepData.qc_released_by) {
      const { data: qcEmp } = await supabase
        .from('employees')
        .select('full_name')
        .eq('id', prepData.qc_released_by)
        .maybeSingle();
      prepData.qc_released_employee = qcEmp || null;
    }

    const { data: incubations } = await supabase
      .from('sample_incubation_records')
      .select('id, sample_name, sample_type, start_time, end_time, duration_hours, sterility_status, colony_count, cfu_per_ml, colony_morphology, microscopic_morphology, incubation_temp_c, media_used, lab_bench_sample_id, source_label, log_hour, timepoint_label, plate_label, plate_index, plate_total')
      .eq('cell_bank_preparation_id', prepId)
      .order('created_at', { ascending: true });
    prepData.incubations = incubations || [];

    const { data: lnbEntry } = await supabase
      .from('lab_notebook_entries')
      .select('id')
      .eq('cell_bank_preparation_id', prepId)
      .neq('status', 'Countersigned')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    prepData.lnb_entry_id = lnbEntry?.id || null;
  }

  // 3. Fetch Vials
  const { data: vials } = await supabase
    .from('cell_bank_vials')
    .select(`
      id, vial_code, storage_temp, freezer_id, rack, box, position, status,
      used_in_batch_id, used_at, notes, created_at,
      batches!used_in_batch_id(id, batch_id),
      cell_bank_preparations!preparation_id(
        id, prep_code, type, passage_number,
        cell_bank_strains(name, strain_short_code)
      )
    `)
    .eq('preparation_id', prepId)
    .order('created_at', { ascending: true });

  if (prepData) {
    prepData.cell_bank_vials = vials || [];
  }

  // 4. Fetch Lab Media Formulations
  const { data: labMedia } = await supabase
    .from('formulations')
    .select('id, code, name, version, status')
    .eq('category', 'Lab Media')
    .order('name', { ascending: true });

  return <PrepDetailClient initialPrep={prepData || null} initialLabMedia={labMedia || []} />;
}
