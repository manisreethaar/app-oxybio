export const dynamic = 'force-dynamic';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendServerNotification } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { canAssignTo, isMasterAdmin } from '@/lib/permissions';
import { createTaskSchema, ACTION_PAYLOAD_SCHEMAS, patchSchema } from '@/lib/schemas/tasks';
import { canPatchTaskAction } from '@/lib/tasks/access';
import { requireAccess } from '@/lib/access';
import { checkSopCompletion } from '@/lib/sop/gate';

const SOP_GATED_ACTIONS = new Set(['start_timer', 'update_progress', 'update_checklist', 'submit_review']);



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
      if (t.assigned_to) {
        const { data: assignee } = await supabase.from('employees').select('role').eq('id', t.assigned_to).single();
        if (!canAssignTo(creatorInfo.role, assignee?.role, user.email)) {
          return NextResponse.json({ error: `Permission Denied: Your role (${creatorInfo.role}) cannot assign tasks to a ${assignee?.role || 'Staff'}.` }, { status: 403 });
        }
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
    // For team tasks (assigned_to = null), notify all active staff employees
    const teamTaskTitles = tasks.filter(t => !t.assigned_to);
    const individualTaskAssignees = tasks.filter(t => t.assigned_to && t.assigned_to !== creatorInfo.id);

    const notifyPromises = [];

    // Individual task notifications
    individualTaskAssignees.forEach(t => {
      notifyPromises.push(sendServerNotification(
        t.assigned_to,
        `📋 New Task Assigned: ${t.title}`,
        `You have been assigned a new task${t.due_date ? ` due ${new Date(t.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}.`,
        '/tasks'
      ));
    });

    // Team task notifications — notify all active non-creator staff
    if (teamTaskTitles.length > 0) {
      const adminClient = createAdminClient();
      const { data: allStaff } = await adminClient
        .from('employees')
        .select('id')
        .eq('is_active', true)
        .neq('id', creatorInfo.id);

      if (allStaff && allStaff.length > 0) {
        for (const teamTask of teamTaskTitles) {
          for (const staff of allStaff) {
            notifyPromises.push(sendServerNotification(
              staff.id,
              `📋 New Team Task: ${teamTask.title}`,
              `A new team task is available${teamTask.due_date ? ` due ${new Date(teamTask.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}. Claim it in Tasks.`,
              '/tasks'
            ));
          }
        }
      }
    }

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
      .select('title, assigned_by, assigned_to, progress_logs, is_personal_reminder, sop_id, is_routine, routine_interval, description, due_date, priority, checklist, assigned_user:employees!tasks_assigned_to_fkey(full_name)')
      .eq('id', task_id).single();
    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }


    const access = canPatchTaskAction({ action, task, currentUser, userEmail: user.email });
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    if (SOP_GATED_ACTIONS.has(action) && !isMasterAdmin(user.email)) {
      const sopStatus = await checkSopCompletion(supabase, task.sop_id, currentUser.id);
      if (sopStatus.required && !sopStatus.completed) {
        return NextResponse.json({
          error: `You must complete SOP "${sopStatus.sop.title}" before starting this task.`,
          sop_violation: true,
          sop: sopStatus.sop,
        }, { status: 403 });
      }
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
        if (task.is_routine) {
          if (!safePayload.pin) return NextResponse.json({ error: 'E-Signature PIN required for routine tasks.' }, { status: 400 });
          const { data: validPin, error: pinError } = await supabase.rpc('verify_pin', { user_id: currentUser.id, pin: safePayload.pin });
          if (pinError || !validPin) {
            return NextResponse.json({ error: 'Invalid E-Signature PIN.' }, { status: 403 });
          }
          updateData.esignature_used = true;
        }
        updateData = {
          ...updateData,
          status: 'done',
          approval_status: (task.is_personal_reminder || task.is_routine) ? 'approved' : 'pending_review',
          completion_note: safePayload.completion_note,
          completed_at: new Date().toISOString(),
          completed_by: currentUser.id,
          proof_url: safePayload.proof_url || null,
          logged_minutes: safePayload.logged_minutes,
          time_started_at: null,
          progress_percentage: 100
        };
        if (!task.is_personal_reminder && task?.assigned_by && task.assigned_by !== task.assigned_to) {
          await sendServerNotification(
            task.assigned_by,
            'Task Ready for Review',
            `${task.assigned_user?.full_name || 'An employee'} completed "${task.title}".${task.is_routine ? '' : ' Pending your approval.'}`,
            '/tasks'
          );
        }
        
        // Auto-clone routine tasks
        if (task.is_routine && task.routine_interval) {
          let nextDate = new Date(task.due_date || new Date());
          if (task.routine_interval === 'daily') nextDate.setDate(nextDate.getDate() + 1);
          else if (task.routine_interval === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
          else if (task.routine_interval === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
          
          await supabase.from('tasks').insert({
            title: task.title,
            description: task.description,
            assigned_to: task.assigned_to,
            assigned_by: task.assigned_by,
            due_date: nextDate.toISOString().split('T')[0],
            priority: task.priority,
            checklist: task.checklist ? task.checklist.map(c => ({...c, done: false})) : null,
            sop_id: task.sop_id,
            status: 'open',
            approval_status: 'not_required',
            is_personal_reminder: task.is_personal_reminder,
            is_routine: true,
            routine_interval: task.routine_interval,
            logged_minutes: 0
          });
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
    const { id, title, description, assigned_to, due_date, priority, checklist, is_personal_reminder, is_routine, routine_interval } = body;

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
        title, description, assigned_to, due_date, priority, checklist, is_personal_reminder, is_routine, routine_interval
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
