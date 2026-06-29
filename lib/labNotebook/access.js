import { can, isMasterAdmin } from '@/lib/permissions';

export const LNB_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  COUNTERSIGNED: 'Countersigned',
};

export function isLabNotebookFinaliser(employee, email) {
  return isMasterAdmin(email) || Boolean(employee?.role && can(employee.role, 'lab_notebook', 'finalise'));
}

function sameId(a, b) {
  return Boolean(a && b && String(a) === String(b));
}

export function canEditLabNotebookEntry(entry, employee, email) {
  if (isMasterAdmin(email)) return { allowed: true };
  if (!entry) return { allowed: false, error: 'Entry not found.' };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };
  if (entry.status !== LNB_STATUS.DRAFT) return { allowed: false, error: 'Only drafts can be modified.' };
  if (sameId(entry.created_by, employee.id)) return { allowed: true };
  return ['ceo', 'admin'].includes(String(employee.role || '').toLowerCase())
    ? { allowed: true }
    : { allowed: false, error: 'Only the author or an admin can edit this draft lab notebook entry.' };
}

export function validateLabNotebookStatusUpdate(currentStatus, nextStatus) {
  if (!nextStatus || nextStatus === currentStatus) return { allowed: true, status: currentStatus };
  if (currentStatus !== LNB_STATUS.DRAFT) return { allowed: false, error: 'Only drafts can change status.' };
  if (![LNB_STATUS.DRAFT, LNB_STATUS.SUBMITTED].includes(nextStatus)) {
    return { allowed: false, error: 'Draft entries can only remain Draft or be Submitted for countersignature.' };
  }
  return { allowed: true, status: nextStatus };
}

export function canCountersignLabNotebookEntry(entry, employee, email) {
  if (!entry) return { allowed: false, error: 'Entry not found.' };
  if (!employee?.id && !isMasterAdmin(email)) return { allowed: false, error: 'Employee profile not found.' };
  if (entry.status !== LNB_STATUS.SUBMITTED) {
    return { allowed: false, error: 'Only submitted entries can be countersigned.' };
  }
  if (sameId(entry.created_by, employee?.id)) {
    return { allowed: false, error: 'You cannot countersign your own entries.' };
  }
  return isLabNotebookFinaliser(employee, email)
    ? { allowed: true }
    : { allowed: false, error: 'Insufficient permissions to countersign.' };
}

export function canDeleteLabNotebookEntry(entry, employee, email) {
  if (isMasterAdmin(email)) return { allowed: true };
  if (!entry) return { allowed: false, error: 'Entry not found.' };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };
  if (entry.status !== LNB_STATUS.DRAFT) return { allowed: false, error: 'Only drafts can be deleted.' };
  if (sameId(entry.created_by, employee.id)) return { allowed: true };
  return ['ceo', 'admin'].includes(String(employee.role || '').toLowerCase())
    ? { allowed: true }
    : { allowed: false, error: 'You can only delete your own draft entries.' };
}

export function canResyncLabNotebookEntry(entry, employee, email) {
  if (!entry) return { allowed: false, error: 'Entry not found.' };
  if (entry.status === LNB_STATUS.COUNTERSIGNED) {
    return { allowed: false, error: 'Countersigned lab notebook entries cannot be resynced.' };
  }
  return isLabNotebookFinaliser(employee, email)
    ? { allowed: true }
    : { allowed: false, error: 'Insufficient permissions to resync lab notebook entries.' };
}
