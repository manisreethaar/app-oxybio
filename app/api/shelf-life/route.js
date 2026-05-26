import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  batch_id: z.string().uuid('Invalid batch ID'),
  storage_condition: z.string().min(1),
  test_parameters: z.array(z.string()).min(1),
  start_date: z.string().min(1)
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { data, error } = await supabase.from('shelf_life_studies').insert({
      ...parsed.data,
      created_by: emp.id,
      status: 'In Progress'
    }).select().single();

    if (error) throw error;

    // Auto-create tasks for each standard shelf-life timepoint
    const { data: batchRow } = await supabase.from('batches').select('batch_id').eq('id', parsed.data.batch_id).single();
    const startDate = new Date(parsed.data.start_date);
    const taskRows = [7, 14, 30, 60, 90].map(day => {
      const due = new Date(startDate);
      due.setDate(due.getDate() + day);
      return {
        title: `Shelf-Life D${day} — ${batchRow?.batch_id || 'Batch'}`,
        description: `Day ${day} shelf-life test. Storage: ${parsed.data.storage_condition}. Tests: ${(parsed.data.test_parameters || []).join(', ')}.`,
        priority: day <= 14 ? 'high' : 'medium',
        status: 'todo',
        batch_id: parsed.data.batch_id,
        assigned_by: emp.id,
        due_date: due.toISOString().slice(0, 10),
      };
    });
    await supabase.from('tasks').insert(taskRows).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, status } = body;
    if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });

    const { data, error } = await supabase.from('shelf_life_studies').update({ status }).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
