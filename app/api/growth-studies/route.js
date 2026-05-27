import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    let query = supabase
      .from('growth_studies')
      .select(`
        id, name, study_type, status, vessel_type, temperature_c,
        inoculation_time, expected_duration_hours, completed_at, created_at,
        cell_bank_strains(id, name),
        cell_bank_preparations(id, prep_code, type),
        formulations(id, name, code),
        growth_study_time_points(id, status)
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('study_type', type);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await req.json();
    const { time_points, ...studyData } = body;

    const supabaseAdmin = createAdminClient();

    const { data: study, error: studyErr } = await supabaseAdmin
      .from('growth_studies')
      .insert({ ...studyData, created_by: emp.id })
      .select()
      .single();
    if (studyErr) throw studyErr;

    if (time_points?.length && study.inoculation_time) {
      const inoc = new Date(study.inoculation_time);
      const tpRows = time_points.map(tp => ({
        study_id: study.id,
        planned_hour: tp.planned_hour,
        sample_types: tp.sample_types,
        scheduled_at: new Date(inoc.getTime() + tp.planned_hour * 3600000).toISOString()
      }));
      const { error: tpErr } = await supabaseAdmin
        .from('growth_study_time_points')
        .insert(tpRows);
      if (tpErr) throw tpErr;
    }

    return NextResponse.json({ data: study }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
