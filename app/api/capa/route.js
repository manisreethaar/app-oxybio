import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  action: z.enum(['raise', 'investigate', 'spawn_action']),
  payload: z.any()
});

const patchSchema = z.object({
  action: z.enum(['verify_effectiveness', 'close_deviation']),
  payload: z.any()
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, full_name').eq('id', user.id).single();
    if (!emp) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { action, payload } = parsed.data;

    if (action === 'raise') {
      const { title, severity, source, description } = payload;
      if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
      
      const { data, error } = await supabase.from('deviations').insert({
        title, severity, source, description, reported_by: emp.id, status: 'Open'
      }).select().single();
      
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    if (action === 'investigate') {
      const { deviation_id, investigation_id, why_1, why_2, why_3, why_4, why_5, root_cause_identified } = payload;
      if (!root_cause_identified) return NextResponse.json({ error: 'Root cause required' }, { status: 400 });

      const updates = { why_1, why_2, why_3, why_4, why_5, root_cause_identified, investigator_id: emp.id };
      let returnData;

      if (investigation_id) {
        const { error } = await supabase.from('investigations').update(updates).eq('id', investigation_id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('investigations').insert({ deviation_id, ...updates }).select().single();
        if (error) throw error;
        returnData = data;
      }

      await supabase.from('deviations').update({ status: 'Investigating' }).eq('id', deviation_id);
      return NextResponse.json({ success: true, data: returnData });
    }

    if (action === 'spawn_action') {
      const { deviation_id, investigation_id, action_type, title, description, assigned_to, due_date } = payload;
      
      const { data: task, error: taskErr } = await supabase.from('tasks').insert({
        title: `[CAPA] ${title}`,
        description,
        assigned_to,
        assigned_by: emp.id,
        due_date,
        priority: 'high',
        status: 'open',
        approval_status: 'not_required',
        checklist: [],
        logged_minutes: 0,
        is_personal_reminder: false
      }).select().single();

      if (taskErr) throw taskErr;

      const { error: capaErr } = await supabase.from('capa_actions').insert({
        investigation_id,
        action_type,
        task_id: task.id,
        effectiveness_verified: false
      });
      if (capaErr) throw capaErr;

      await supabase.from('deviations').update({ status: 'CAPA Assigned' }).eq('id', deviation_id);
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}


export async function PATCH(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('id', user.id).single();

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

    const { action, payload } = parsed.data;

    if (action === 'verify_effectiveness') {
      const { action_id } = payload;
      const { error } = await supabase.from('capa_actions').update({ effectiveness_verified: true, verified_by: emp.id }).eq('id', action_id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'close_deviation') {
      const { deviation_id } = payload;
      const { data, error } = await supabase.from('deviations').update({ status: 'Closed' }).eq('id', deviation_id).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
