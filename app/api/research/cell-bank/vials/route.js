import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { requireResearchAccess } from '@/lib/research/access';

export const dynamic = 'force-dynamic';



// GET /api/research/cell-bank/vials?status=Available
// Returns vials with strain + prep context for inoculation dropdown
export async function GET(request) {
  try {
    const supabase = createClient();
    const access = await requireResearchAccess(supabase);
    if (access.error) return access.error;

    const adminSupabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const prepId = searchParams.get('preparation_id');

    let query = adminSupabase
      .from('cell_bank_vials')
      .select(`
        id, vial_code, storage_temp, freezer_id, rack, box, position, status,
        used_in_batch_id, used_at, notes, created_at,
        batches!used_in_batch_id(id, batch_id),
        cell_bank_preparations!preparation_id(
          id, prep_code, type, passage_number,
          cell_bank_strains(id, name, accession_number, strain_short_code)
        )
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (prepId) query = query.eq('preparation_id', prepId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
