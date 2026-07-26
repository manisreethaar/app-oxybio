export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  batch_id:        z.string().uuid().optional().nullable(),
  flask_id:        z.string().optional().nullable(),
  session_title:   z.string().min(1, 'Session title required'),
  panelist_count:  z.preprocess((val) => Number(val), z.number().min(1)),
  sample_ids:      z.string().optional(),
  test_criteria:   z.array(z.string()).min(1),
  pass_thresholds: z.record(z.string(), z.number()).optional().nullable(),
});

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('taste_panels')
      .select('*, creator:employees!created_by(full_name, initials), batches(id, batch_id, variant, experiment_type, batch_flasks(id, flask_label, status, current_stage))')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .single();
    if (empErr || !employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json();

    // Normalize empty string to null for optional UUID field
    if (body.batch_id === '') body.batch_id = null;

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { session_title, panelist_count, batch_id, pass_thresholds, ...rest } = parsed.data;

    const { data: panel, error } = await supabase
      .from('taste_panels')
      .insert({
        ...rest,
        session_title,
        panelist_count,
        batch_id:        batch_id || null,
        avg_score:       0,
        scores:          [],
        pass_thresholds: pass_thresholds || null,
        created_by:      employee.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-sync to Lab Notebook (non-blocking)
    supabase.from('lab_notebook_entries').insert({
      title:       `Taste Panel: ${session_title}`,
      content:     `Sensory panel session created. Panelists: ${panelist_count}. Batch: ${batch_id || 'N/A'}.`,
      created_by:  employee.id,
      source_type: 'taste_panel',
      source_id:   panel.id,
    }).catch(() => {});

    return NextResponse.json({ success: true, panel });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
