import { isMasterAdmin } from '@/lib/permissions';

export const ASSIGNEE_ACTIONS = new Set([
  'acknowledge_task',
  'start_timer',
  'pause_timer',
  'update_checklist',
  'update_progress',
  'submit_review',
]);

export const REVIEWER_ACTIONS = new Set(['approve', 'reject']);
export const REVIEWER_ROLES = new Set(['admin', 'ceo', 'cto']);


function sameId(a, b) {
  return Boolean(a && b && String(a) === String(b));
}

export function canPatchTaskAction({ action, task, currentUser, userEmail }) {
  if (isMasterAdmin(userEmail)) return { allowed: true };
  if (!task) return { allowed: false, error: 'Task not found.' };
  if (!currentUser?.id) return { allowed: false, error: 'Employee profile not found for this account.' };

  const role = String(currentUser.role || '').toLowerCase();
  const isAssignee = sameId(task.assigned_to, currentUser.id);
  const isCreator = sameId(task.assigned_by, currentUser.id);

  if (ASSIGNEE_ACTIONS.has(action)) {
    return isAssignee
      ? { allowed: true }
      : { allowed: false, error: 'Only the assigned employee can update this task.' };
  }

  if (REVIEWER_ACTIONS.has(action)) {
    return isCreator || REVIEWER_ROLES.has(role)
      ? { allowed: true }
      : { allowed: false, error: 'Only the task creator or leadership can review this task.' };
  }

  return { allowed: false, error: 'Unsupported task action.' };
}
