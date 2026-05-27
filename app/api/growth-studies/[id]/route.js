import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const [studyRes, tpRes, measRes, plateRes] = await Promise.all([
      supabase
        .from('growth_studies')
        .select(`
          *,
          cell_bank_strains(id, name, accession_number),
          cell_bank_preparations(id, prep_code, type, passage_number),
          formulations(id, name, code, version),
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
        .select('*, employees!growth_measurements_recorded_by_fkey(full_name)')
        .eq('study_id', id)
        .order('actual_hour'),

      supabase
        .from('growth_plate_observations')
        .select('*, employees!growth_plate_observations_recorded_by_fkey(full_name)')
        .eq('study_id', id)
        .order('time_point_hours'),
    ]);

    if (studyRes.error) throw studyRes.error;

    return NextResponse.json({
      study: studyRes.data,
      time_points: tpRes.data || [],
      measurements: measRes.data || [],
      plate_observations: plateRes.data || [],
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

    const { data, error } = await supabase
      .from('growth_studies')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
