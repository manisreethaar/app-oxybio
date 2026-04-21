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

  return NextResponse.json({
    experiment:   expRes.data,
    factors:      factorsRes.data || [],
    responses:    responsesRes.data || [],
    kineticData:  kineticsRes.data || [],
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
