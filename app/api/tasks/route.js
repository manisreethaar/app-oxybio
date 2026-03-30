
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAssignTo } from '@/lib/permissions';

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
    // Master Admin Override
    const isMaster = user.email === 'manisreethaar@gmail.com';
    
    // Support batch inserts for multiple assignees
    const tasks = Array.isArray(body) ? body : [body];

    for (const t of tasks) {
      const parsed = createTaskSchema.safeParse(t);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
      }
    }

    // Fix: Verify creator exists in employees table before inserting
    let creatorInfo;
    const { data: creator, error: creatorErr } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    
    if (creatorErr || !creator) {
      if (isMaster) {
        // Fallback for Master Admin if not in employees table yet
        const { data: adminUser } = await supabase.from('employees').select('id').eq('role', 'admin').limit(1).single();
        creatorInfo = { id: adminUser?.id || user.id, role: 'admin' };
      } else {
        return NextResponse.json({
          error: "CRITICAL PROFILE SYNC ERROR: Your user account is authenticated but not registered in the 'employees' table. Please contact an admin to add your ID."
        }, { status: 403 });
      }
    } else {
      creatorInfo = creator;
    }

    // Hierarchical Validation
    for (const t of tasks) {
      const { data: assignee } = await supabase.from('employees').select('role').eq('id', t.assigned_to).single();
      if (!canAssignTo(creatorInfo.role, assignee?.role, user.email)) {
        return NextResponse.json({ error: `Permission Denied: Your role (${creatorInfo.role}) cannot assign tasks to a ${assignee?.role || 'Staff'}.` }, { status: 403 });
      }
    }

    const insertPayload = tasks.map(t => ({
      ...t,
      assigned_by: creatorInfo.id,
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

    const { data: task } = await supabase.from('tasks')
      .select('title, assigned_by, assigned_to, assigned_user:employees!tasks_assigned_to_fkey(full_name)')
      .eq('id', task_id).single();

    switch (action) {
      case 'start_timer':
        updateData = { time_started_at: new Date().toISOString(), status: 'in-progress' };
        if (task?.assigned_by && task.assigned_by !== task.assigned_to) {
          await supabase.from('notifications').insert({
            employee_id: task.assigned_by,
            title: 'Task Acknowledged',
            message: `${task.assigned_user?.full_name || 'An employee'} acknowledged and started: "${task.title}"`,
            link_url: '/tasks'
          });
        }
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
        if (!payload.is_personal_reminder && task?.assigned_by && task.assigned_by !== task.assigned_to) {
          await supabase.from('notifications').insert({
            employee_id: task.assigned_by,
            title: 'Task Ready for Review',
            message: `${task.assigned_user?.full_name || 'An employee'} completed "${task.title}". Pending your approval.`,
            link_url: '/tasks'
          });
        }
        break;
      case 'approve':
        updateData = { approval_status: 'approved' };
        break;
      case 'reject':
        if (!payload.reject_note || payload.reject_note.trim().length < 5) {
            return NextResponse.json({ error: 'A mandatory rejection remark (min 5 chars) is required.' }, { status: 400 });
        }
        updateData = { 
            approval_status: 'rejected', 
            status: 'in-progress', 
            completion_note: payload.reject_note 
        };
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

    const isMaster = user.email === 'manisreethaar@gmail.com';
    const { data: task } = await supabase.from('tasks').select('assigned_by').eq('id', id).single();
    const { data: currentUser } = await supabase.from('employees').select('id').eq('email', user.email).single();

    if (!isMaster && task?.assigned_by !== currentUser?.id) {
       return NextResponse.json({ error: 'Permission Denied: Only the creator can delete this task.' }, { status: 403 });
    }

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
