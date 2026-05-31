import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  action: z.enum(['log_activity']),
  payload: z.object({
    activity_description: z.string().min(1, 'Description required'),
    start_time: z.string().min(1, 'Start time required'),
    end_time: z.string().min(1, 'End time required'),
    issue_observed: z.boolean(),
    issue_description: z.string().nullable().optional(),
    batch_id: z.string().nullable().optional(),
    equipment_id: z.string().nullable().optional()
  })
});

const patchSchema = z.object({
  action: z.enum(['add_comment']),
  payload: z.object({
    log_id: z.string().uuid(),
    comment: z.string().min(1, 'Comment required')
  })
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, full_name').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { action, payload } = parsed.data;

    if (action === 'log_activity') {
      if (!payload.issue_observed) {
        payload.issue_description = null;
      }

      // Innovation 1: Severity Scoring
      let severity = 'normal';
      if (payload.issue_observed) severity = 'high';
      const desc = payload.activity_description.toLowerCase();
      if (desc.includes('delete') || desc.includes('remove') || desc.includes('fail')) severity = 'high';
      if (desc.includes('viewed') || desc.includes('read')) severity = 'info';

      const { data, error } = await supabase.from('activity_log').insert({
        ...payload,
        batch_id: payload.batch_id || null,
        equipment_id: payload.equipment_id || null,
        issue_description: payload.issue_description || null,
        employee_id: emp.id,
        severity: severity,
        log_date: new Date().toISOString().split('T')[0],
      }).select().single();

      if (error) throw error;
      return NextResponse.json({ success: true, data });
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

    const { data: emp, error: empError } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { action, payload } = parsed.data;

    if (action === 'add_comment') {
      const { error } = await supabase.from('activity_log').update({ 
        founder_comment: payload.comment,
        reviewed_by: emp.id 
      }).eq('id', payload.log_id);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const supabaseAdmin = createAdminClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';
    if (!id) return NextResponse.json({ error: 'Missing activity ID' }, { status: 400 });

    const { data: emp, error: empError } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const isAdmin = ['admin', 'ceo', 'cto'].includes(emp.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });

    const { data: log, error: fetchErr } = await supabaseAdmin
      .from('activity_log')
      .select('id, archived_at')
      .eq('id', id)
      .single();
    if (fetchErr || !log) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });

    if (!permanent) {
      if (log.archived_at) {
        return NextResponse.json({ success: true, message: 'Activity is already archived.' });
      }

      const { error } = await supabaseAdmin
        .from('activity_log')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: emp.id,
        })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true, archived: true, message: 'Activity archived.' });
    }

    if (!log.archived_at) {
      return NextResponse.json({ error: 'Archive this activity before permanently deleting it.' }, { status: 409 });
    }

    const { error } = await supabaseAdmin.from('activity_log').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true, permanentlyDeleted: true, message: 'Archived activity permanently deleted.' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
