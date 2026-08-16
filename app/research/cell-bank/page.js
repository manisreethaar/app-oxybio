import { createClient } from '@/utils/supabase/server';
import CellBankClient from './CellBankClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CellBankPage() {
  const supabase = createClient();
  
  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  // 2. Fetch Data (Strains, Preparations, Formulations)
  const [strainsRes, prepsRes, formulationsRes] = await Promise.all([
    supabase
      .from('cell_bank_strains')
      .select('*, characterization, employees(full_name, initials), linked_formulation:formulations(id, code, name, version, category, status)')
      .order('created_at', { ascending: false }),
    supabase
      .from('cell_bank_preparations')
      .select(`
        id, type, prep_code, status, passage_number, source_vial_id,
        qc_released, qc_released_by, qc_released_at,
        vial_count, notes,
        formulation_id, created_at, completed_at,
        linked_formulation:formulations(id, code, name, version, category, status),
        cell_bank_strains(id, name, source_type, accession_number, formulation_id, linked_formulation:formulations(id, code, name, version, category, status)),
        parent:parent_id(id, prep_code, type),
        employees!cell_bank_preparations_created_by_fkey(full_name, initials)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('formulations')
      .select('id, code, name, version, category, status')
      .eq('status', 'Approved')
  ]);

  return (
    <CellBankClient
      initialStrains={strainsRes.data || []}
      initialPreps={prepsRes.data || []}
      initialFormulations={formulationsRes.data || []}
    />
  );
}
