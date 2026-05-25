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

export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const { data, error } = await supabase
      .from('cell_bank_preparations')
      .select(`
        *,
        cell_bank_strains(id, name, source_type, accession_number, isolation_source, taxonomy, notes),
        parent:parent_id(id, prep_code, type, step_data),
        employees(full_name),
        cell_bank_vials(id, vial_code, storage_temp, freezer_id, rack, box, position, status, used_in_batch_id, used_at, notes)
      `)
      .eq('id', params.id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // Fetch linked incubation records for this preparation
    const { data: incubations } = await supabase
      .from('sample_incubation_records')
      .select('id, sample_name, sample_type, start_time, end_time, duration_hours, sterility_status, colony_count, cfu_per_ml, colony_morphology, microscopic_morphology, incubation_temp_c, media_used')
      .eq('cell_bank_preparation_id', params.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ success: true, data: { ...data, incubations: incubations || [] } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const body = await request.json();
    const { step_key, step_data_patch, status, vial_count, notes } = body;

    // Fetch current record
    const { data: current, error: fetchErr } = await supabase
      .from('cell_bank_preparations')
      .select('step_data, status')
      .eq('id', params.id)
      .single();
    if (fetchErr || !current) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const updates = {};

    if (step_key && step_data_patch) {
      updates.step_data = {
        ...(current.step_data || {}),
        [step_key]: { ...(current.step_data?.[step_key] || {}), ...step_data_patch },
      };
    }

    if (status) {
      updates.status = status;
      if (status === 'Completed') updates.completed_at = new Date().toISOString();
    }

    if (vial_count !== undefined) updates.vial_count = vial_count;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase
      .from('cell_bank_preparations')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const { searchParams } = new URL(request.url);
    const target = searchParams.get('target') || 'preparation';

    if (target === 'strain') {
      const { error } = await supabase.from('cell_bank_strains').delete().eq('id', params.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('cell_bank_preparations').delete().eq('id', params.id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
