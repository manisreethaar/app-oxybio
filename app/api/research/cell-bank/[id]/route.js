import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { syncCellBankStepToLNB } from '@/lib/cellBankLNBSync';

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
        linked_formulation:formulations!cell_bank_preparations_formulation_id_fkey(id, code, name, version, category, status),
        cell_bank_strains(id, name, source_type, accession_number, isolation_source, taxonomy, strain_short_code, notes, formulation_id, linked_formulation:formulations!cell_bank_strains_formulation_id_fkey(id, code, name, version, category, status)),
        parent:parent_id(id, prep_code, type, step_data, formulation_id),
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

    // ── Register vials action ──────────────────────────────────────────────
    if (body.action === 'register_vials') {
      const { count, storage_temp, freezer_id, rack, box } = body;
      if (!count || count < 1) return NextResponse.json({ success: false, error: 'count must be >= 1' }, { status: 400 });

      // Fetch prep + strain for code generation
      const { data: prep, error: prepErr } = await supabase
        .from('cell_bank_preparations')
        .select('type, prep_code, strain_id, cell_bank_strains(strain_short_code)')
        .eq('id', params.id)
        .single();
      if (prepErr || !prep) return NextResponse.json({ success: false, error: 'Preparation not found' }, { status: 404 });

      const year = String(new Date().getFullYear()).slice(-2);
      const short = (prep.cell_bank_strains?.strain_short_code || 'XX').toUpperCase();
      const baseCode = `${prep.type}-${year}-${short}`;

      const vialRows = Array.from({ length: count }, (_, i) => ({
        preparation_id: params.id,
        vial_code: `${baseCode}-${String(i + 1).padStart(3, '0')}`,
        storage_temp: storage_temp || '-20°C',
        freezer_id: freezer_id || null,
        rack: rack || null,
        box: box || null,
        status: 'Available',
      }));

      const { data: vials, error: vialErr } = await supabase.from('cell_bank_vials').insert(vialRows).select();
      if (vialErr) throw vialErr;

      // Insert log entries for each vial
      const logRows = vials.map(v => ({
        vial_id: v.id,
        action: 'registered',
        operator_id: access.emp?.id || null,
      }));
      await supabase.from('cell_bank_vial_logs').insert(logRows).catch(() => {});

      // Update prep vial_count
      await supabase.from('cell_bank_preparations').update({ vial_count: count }).eq('id', params.id);

      return NextResponse.json({ success: true, vials });
    }

    // ── Standard step_data / status update ────────────────────────────────
    const { step_key, step_data_patch, status, vial_count, notes, formulation_id } = body;

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
    if (formulation_id !== undefined) updates.formulation_id = formulation_id || null;

    const { data, error } = await supabase
      .from('cell_bank_preparations')
      .update(updates)
      .eq('id', params.id)
      .select('*, cell_bank_strains(name)')
      .single();
    if (error) throw error;

    // Sync step to LNB — fire and forget
    if (step_key && step_data_patch) {
      syncCellBankStepToLNB(
        supabase,
        params.id,
        data.prep_code,
        step_key,
        step_data_patch,
        access.emp?.id
      ).catch(() => {});
    }

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
