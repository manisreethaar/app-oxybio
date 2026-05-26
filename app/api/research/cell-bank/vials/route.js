import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MASTER_EMAIL = 'manisreethaar@gmail.com';

async function requireAccess(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
  if (!emp && user.email !== MASTER_EMAIL) return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  return { user, emp };
}

// GET /api/research/cell-bank/vials?status=Available
// Returns vials with strain + prep context for inoculation dropdown
export async function GET(request) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const prepId = searchParams.get('preparation_id');

    let query = supabase
      .from('cell_bank_vials')
      .select(`
        id, vial_code, storage_temp, freezer_id, rack, box, position, status,
        used_in_batch_id, used_at, notes, created_at,
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
