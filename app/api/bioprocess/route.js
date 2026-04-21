import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  title:             z.string().min(1, 'Title required'),
  description:       z.string().optional(),
  type:              z.enum(['pbd', 'rsm', 'kinetics']),
  response_variable: z.string().default('OD600 at 24h'),
  response_unit:     z.string().default(''),
  config:            z.record(z.any()).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('bioprocess_experiments')
    .select('*, creator:employees!created_by(full_name, employee_code)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('email', user.email)
    .single();
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { title, description, type, response_variable, response_unit, config } = parsed.data;

  const { data: experiment, error } = await supabase
    .from('bioprocess_experiments')
    .insert({
      title, description, type, response_variable, response_unit,
      config: config || {},
      created_by: employee.id,
      status: 'setup',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pre-populate response rows based on type
  if (type === 'pbd') {
    const runs = Array.from({ length: 12 }, (_, i) => ({
      experiment_id: experiment.id,
      run_number: i + 1,
    }));
    await supabase.from('bioprocess_responses').insert(runs);
  } else if (type === 'rsm') {
    const runs = Array.from({ length: 15 }, (_, i) => ({
      experiment_id: experiment.id,
      run_number: i + 1,
    }));
    await supabase.from('bioprocess_responses').insert(runs);
  }

  return NextResponse.json({ data: experiment }, { status: 201 });
}
