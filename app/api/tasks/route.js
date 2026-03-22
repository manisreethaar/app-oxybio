import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assigned_to: z.string().uuid(),
  due_date: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  checklist: z.array(z.object({ text: z.string(), done: z.boolean() })).optional(),
  status: z.string().default('open'),
  approval_status: z.string().default('not_required'),
  is_personal_reminder: z.boolean().default(false)
});

const patchSchema = z.object({
  action: z.enum(['start_timer', 'pause_timer', 'update_checklist', 'submit_review', 'approve', 'reject']),
  task_id: z.string().uuid(),
  payload: z.any()
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    
    // Support batch inserts for multiple assignees
    const tasks = Array.isArray(body) ? body : [body];
    
    for (const t of tasks) {
      const parsed = createTaskSchema.safeParse(t);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
      }
    }

    const insertPayload = tasks.map(t => ({
      ...t,
      assigned_by: user.id,
      logged_minutes: 0
    }));

    const { data, error } = await supabase.from('tasks').insert(insertPayload).select();
    if (error) throw error;
    
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
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { action, task_id, payload } = parsed.data;
    let updateData = {};

    switch (action) {
      case 'start_timer':
        updateData = { time_started_at: new Date().toISOString(), status: 'in-progress' };
        break;
      case 'pause_timer':
        updateData = { time_started_at: null, logged_minutes: payload.logged_minutes };
        break;
      case 'update_checklist':
        updateData = { checklist: payload.checklist };
        break;
      case 'submit_review':
        updateData = { 
          status: 'done', 
          approval_status: payload.is_personal_reminder ? 'approved' : 'pending_review',
          completion_note: payload.completion_note,
          completed_at: new Date().toISOString(),
          proof_url: payload.proof_url || null,
          logged_minutes: payload.logged_minutes,
          time_started_at: null
        };
        break;
      case 'approve':
        updateData = { approval_status: 'approved' };
        break;
      case 'reject':
        updateData = { approval_status: 'rejected', status: 'in-progress', completion_note: payload.reject_note || 'Revision required.' };
        break;
    }

    const { error } = await supabase.from('tasks').update(updateData).eq('id', task_id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Task ID required' }, { status: 400 });

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
