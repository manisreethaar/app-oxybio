import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const [expRes, factorsRes, responsesRes, kineticsRes] = await Promise.all([
    supabase.from('bioprocess_experiments')
      .select('*, creator:employees!created_by(full_name, employee_code)')
      .eq('id', id).single(),
    supabase.from('bioprocess_factors')
      .select('*').eq('experiment_id', id).order('position'),
    supabase.from('bioprocess_responses')
      .select('*').eq('experiment_id', id).order('run_number'),
    supabase.from('bioprocess_kinetics_data')
      .select('*').eq('experiment_id', id).order('sort_order'),
  ]);

  if (expRes.error) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let kineticData = kineticsRes.data || [];
  
  // ── Unified Process Bus: Batch Readings ↔ Bioprocess Charts ──
  // If this experiment is linked to a batch, dynamically pull real-time fermentation readings
  if (expRes.data?.batch_id) {
    const { data: batchReadings } = await supabase
      .from('batch_fermentation_readings')
      .select('elapsed_hours, optical_density, ph, brix')
      .eq('batch_id', expRes.data.batch_id)
      .order('elapsed_hours', { ascending: true });

    if (batchReadings && batchReadings.length > 0) {
      kineticData = batchReadings.map((r, i) => ({
        id: `auto-${i}`,
        sort_order: i,
        time_h: r.elapsed_hours || 0,
        od600: r.optical_density || null,
        ph: r.ph || null,
        glucose_gl: r.brix || null, // Mapping Brix to glucose column for chart compatibility
      }));
    }
  }

  return NextResponse.json({
    experiment:   expRes.data,
    factors:      factorsRes.data || [],
    responses:    responsesRes.data || [],
    kineticData:  kineticData,
  });
}

export async function PATCH(req, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const allowed = ['title', 'description', 'status', 'response_variable', 'response_unit', 'config', 'analysis_result'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('bioprocess_experiments')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from('bioprocess_experiments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
