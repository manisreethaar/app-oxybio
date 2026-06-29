export const dynamic = 'force-dynamic';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendServerNotification } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { canAssignTo, isMasterAdmin } from '@/lib/permissions';
import { createTaskSchema, ACTION_PAYLOAD_SCHEMAS, patchSchema } from '@/lib/schemas/tasks';
import { canPatchTaskAction } from '@/lib/tasks/access';
import { requireAccess } from '@/lib/access';

export { createTaskSchema, ACTION_PAYLOAD_SCHEMAS };

export async function POST(request) {
  try {
    const supabase = createClient();
    const { error: accessError, user, employee: creatorInfo } = await requireAccess(supabase, 'tasks', 'create');
    if (accessError) return accessError;

    const body = await request.json();
    const tasks = Array.isArray(body) ? body : [body];

    for (const t of tasks) {
      const parsed = createTaskSchema.safeParse(t);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
      }
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

    // Notify each assignee (service role — creator inserting for other employees)
    const notifyPromises = tasks
      .filter(t => t.assigned_to && t.assigned_to !== creatorInfo.id)
      .map(t => sendServerNotification(
        t.assigned_to,
        `📋 New Task Assigned: ${t.title}`,
        `You have been assigned a new task${t.due_date ? ` due ${new Date(t.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.`,
        '/tasks'
      ));
    await Promise.allSettled(notifyPromises);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = createClient();
    const { error: accessError, user, employee: currentUser } = await requireAccess(supabase, 'tasks', 'edit_own');
    if (accessError) return accessError;

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { action, task_id, payload } = parsed.data;

    const payloadParsed = ACTION_PAYLOAD_SCHEMAS[action].safeParse(payload);
    if (!payloadParsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: payloadParsed.error.format() }, { status: 400 });
    }
    const safePayload = payloadParsed.data;

    let updateData = {};

    const { data: task, error: taskError } = await supabase.from('tasks')
      .select('title, assigned_by, assigned_to, progress_logs, is_personal_reminder, assigned_user:employees!tasks_assigned_to_fkey(full_name)')
      .eq('id', task_id).single();
    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }


    const access = canPatchTaskAction({ action, task, currentUser, userEmail: user.email });
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    switch (action) {
      case 'acknowledge_task':
        updateData = { 
          is_acknowledged: true, 
          acknowledged_at: new Date().toISOString() 
        };
        if (task?.assigned_by && task.assigned_by !== task.assigned_to) {
          await sendServerNotification(
            task.assigned_by,
            'Task Seen',
            `${task.assigned_user?.full_name || 'An employee'} acknowledged: "${task.title}"`,
            '/tasks'
          );
        }
        break;
      case 'start_timer':
        updateData = {
          time_started_at: new Date().toISOString(),
          status: 'in-progress',
          is_acknowledged: true // Implicit acknowledge if started
        };
        if (task?.assigned_by && task.assigned_by !== task.assigned_to) {
          await sendServerNotification(
            task.assigned_by,
            'Task Started',
            `${task.assigned_user?.full_name || 'An employee'} is now working on: "${task.title}"`,
            '/tasks'
          );
        }
        break;
      case 'pause_timer':
        updateData = { time_started_at: null, logged_minutes: safePayload.logged_minutes };
        break;
      case 'update_progress':
        updateData = {
          progress_percentage: safePayload.percentage,
          progress_logs: [
            ...(task.progress_logs || []),
            {
              timestamp: new Date().toISOString(),
              percentage: safePayload.percentage,
              note: safePayload.note || 'Progress update',
            }
          ]
        };
        if (task?.assigned_by && task.assigned_by !== task.assigned_to) {
          await sendServerNotification(
            task.assigned_by,
            'Progress Update',
            `${task.assigned_user?.full_name || 'An employee'} updated "${task.title}" to ${safePayload.percentage}%: ${safePayload.note || ''}`,
            '/tasks'
          );
        }
        break;
      case 'update_checklist':
        updateData = { checklist: safePayload.checklist };
        break;
      case 'submit_review':
        updateData = {
          status: 'done',
          approval_status: task.is_personal_reminder ? 'approved' : 'pending_review',
          completion_note: safePayload.completion_note,
          completed_at: new Date().toISOString(),
          proof_url: safePayload.proof_url || null,
          logged_minutes: safePayload.logged_minutes,
          time_started_at: null,
          progress_percentage: 100
        };
        if (!task.is_personal_reminder && task?.assigned_by && task.assigned_by !== task.assigned_to) {
          await sendServerNotification(
            task.assigned_by,
            'Task Ready for Review',
            `${task.assigned_user?.full_name || 'An employee'} completed "${task.title}". Pending your approval.`,
            '/tasks'
          );
        }
        break;
      case 'approve':
        updateData = { approval_status: 'approved', status: 'done' };
        if (task?.assigned_to && task.assigned_to !== task.assigned_by) {
          await sendServerNotification(
            task.assigned_to,
            '✅ Task Approved',
            `Your task "${task.title}" has been approved. Well done!`,
            '/tasks'
          );
        }
        break;
      case 'reject':
        updateData = {
            approval_status: 'rejected',
            status: 'in-progress',
            completion_note: safePayload.reject_note,
        };
        if (task?.assigned_to && task.assigned_to !== task.assigned_by) {
          await sendServerNotification(
            task.assigned_to,
            '🔄 Task Needs Revision',
            `Your task "${task.title}" was sent back: ${safePayload.reject_note}`,
            '/tasks'
          );
        }
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
    const { error: accessError, user, employee: currentUser } = await requireAccess(supabase, 'tasks', 'delete');
    if (accessError) return accessError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Task ID required' }, { status: 400 });

    const isMaster = isMasterAdmin(user.email);
    const { data: task } = await supabase.from('tasks').select('assigned_to, assigned_by, is_personal_reminder').eq('id', id).single();

    // Allowed to delete if:
    // 1. Master admin
    // 2. Senior role (admin/ceo/cto/research_fellow) who is the creator
    // 3. Any user deleting their OWN personal reminder
    const isCreator = task?.assigned_by === currentUser?.id;
    const isOwnReminder = task?.is_personal_reminder && task?.assigned_to === currentUser?.id;
    const isSenior = ['admin', 'ceo', 'cto', 'research_fellow'].includes(currentUser?.role);

    if (!isMaster && !isOwnReminder && !(isSenior && isCreator)) {
       return NextResponse.json({ error: 'Permission Denied: Only the task creator or an admin can delete this task.' }, { status: 403 });
    }

    const { searchParams: sp2 } = new URL(request.url);
    const permanent = sp2.get('permanent') === 'true';

    if (permanent) {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Task permanently deleted.' });
    }

    const { error } = await supabase.from('tasks')
      .update({ archived_at: new Date().toISOString(), archived_by: currentUser?.id || null })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, message: 'Task archived.' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = createClient();
    const { error: accessError, user, employee: currentUser } = await requireAccess(supabase, 'tasks', 'edit_own');
    if (accessError) return accessError;

    const body = await request.json();
    const { id, title, description, assigned_to, due_date, priority, checklist, is_personal_reminder } = body;

    if (!id) return NextResponse.json({ error: 'Task ID required' }, { status: 400 });

    const isMaster = isMasterAdmin(user.email);
    const { data: task } = await supabase.from('tasks').select('assigned_by').eq('id', id).single();

    if (!isMaster && task?.assigned_by !== currentUser?.id) {
       return NextResponse.json({ error: 'Permission Denied: Only the creator can edit this task.' }, { status: 403 });
    }

    // Role-based assignment check (if assigned_to changed)
    if (assigned_to) {
      const { data: assignee } = await supabase.from('employees').select('role').eq('id', assigned_to).single();
      if (!isMaster && !canAssignTo(currentUser?.role || 'Staff', assignee?.role || 'Staff', user.email)) {
        return NextResponse.json({ error: `Permission Denied: Cannot assign task to a ${assignee?.role || 'Staff'}.` }, { status: 403 });
      }
    }

    const { data: updated, error } = await supabase.from('tasks')
      .update({ 
        title, description, assigned_to, due_date, priority, checklist, is_personal_reminder 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data: updated });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
