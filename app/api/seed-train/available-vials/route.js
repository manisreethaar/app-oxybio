import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/seed-train/available-vials
// Returns Available cell bank vials for the Seed Train vial selector.
// Uses admin client to bypass RLS since this is only shown to authenticated users.
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('cell_bank_vials')
      .select('id, vial_code, status, cell_bank_preparations!preparation_id(id, prep_code, cell_bank_strains(name))')
      .eq('status', 'Available')
      .order('vial_code', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
