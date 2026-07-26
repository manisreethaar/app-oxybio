import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const [studyRes, tpRes, measRes, plateRes, usageRes] = await Promise.all([
      supabase
        .from('growth_studies')
        .select(`
          *,
          cell_bank_strains(id, name, accession_number),
          cell_bank_preparations(id, prep_code, type, passage_number),
          formulations(id, name, code, version, base_volume_ml, ingredients),
          cell_bank_vials!growth_studies_vial_id_fkey(id, vial_code, storage_temp, freezer_id, rack, box, position, status),
          employees!growth_studies_created_by_fkey(full_name)
        `)
        .eq('id', id)
        .single(),

      supabase
        .from('growth_study_time_points')
        .select('*')
        .eq('study_id', id)
        .order('planned_hour'),

      supabase
        .from('growth_measurements')
        .select('*, recorded_by, recorder:employees!growth_measurements_recorded_by_fkey(id, full_name, initials)')
        .eq('study_id', id)
        .order('actual_hour'),

      supabase
        .from('growth_plate_observations')
        .select('*, employees!growth_plate_observations_recorded_by_fkey(full_name)')
        .eq('study_id', id)
        .order('time_point_hours'),

      supabase
        .from('inventory_usage')
        .select('id, quantity_used, stage, notes, inventory_stock!inventory_usage_stock_id_fkey(id, supplier_batch_number, inventory_items!inventory_stock_item_id_fkey(name, unit))')
        .eq('growth_study_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (studyRes.error) throw studyRes.error;

    return NextResponse.json({
      study: studyRes.data,
      time_points: tpRes.data || [],
      measurements: measRes.data || [],
      plate_observations: plateRes.data || [],
      inventory_usage: usageRes.error ? [] : (usageRes.data || []),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const supabaseAdmin = createAdminClient();

    // Handle vial change: restore old vial, mark new vial
    if ('vial_id' in body) {
      const { data: current } = await supabaseAdmin
        .from('growth_studies')
        .select('vial_id, status')
        .eq('id', id)
        .single();

      const oldVialId = current?.vial_id;
      const newVialId = body.vial_id;

      if (oldVialId && oldVialId !== newVialId) {
        await supabaseAdmin
          .from('cell_bank_vials')
          .update({ status: 'Available', used_in_study_id: null, used_at: null })
          .eq('id', oldVialId);
      }

      if (newVialId && newVialId !== oldVialId && current?.status === 'active') {
        await supabaseAdmin
          .from('cell_bank_vials')
          .update({ status: 'Used', used_in_study_id: id, used_at: new Date().toISOString() })
          .eq('id', newVialId);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('growth_studies')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // If inoculation_time was changed, reschedule all time points
    if (body.inoculation_time) {
      const inocTime = new Date(body.inoculation_time);
      const supabaseAdmin = createAdminClient();
      const { data: tps } = await supabaseAdmin
        .from('growth_study_time_points')
        .select('id, planned_hour')
        .eq('study_id', id);

      if (tps?.length) {
        await Promise.all(tps.map(tp =>
          supabaseAdmin
            .from('growth_study_time_points')
            .update({ scheduled_at: new Date(inocTime.getTime() + tp.planned_hour * 3_600_000).toISOString() })
            .eq('id', tp.id)
        ));
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!['admin', 'ceo', 'cto'].includes(emp?.role)) {
      return NextResponse.json({ error: 'Only admins can delete studies' }, { status: 403 });
    }

    const { id } = await params;
    const supabaseAdmin = createAdminClient();

    // If a vial was used in this study, restore it to Available
    const { data: study } = await supabaseAdmin
      .from('growth_studies')
      .select('vial_id')
      .eq('id', id)
      .single();

    if (study?.vial_id) {
      await supabaseAdmin
        .from('cell_bank_vials')
        .update({ status: 'Available', used_in_study_id: null, used_at: null })
        .eq('id', study.vial_id);
    }

    const { error } = await supabaseAdmin.from('growth_studies').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
