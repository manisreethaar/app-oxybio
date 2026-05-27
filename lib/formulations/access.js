import { can, isMasterAdmin } from '@/lib/permissions';

export const FORMULATION_STATUSES = new Set(['Draft', 'In Review', 'Approved', 'Archived', 'active']);

function sameId(a, b) {
  return Boolean(a && b && String(a) === String(b));
}

export function isFormulationApprover(employee, email) {
  return isMasterAdmin(email) || Boolean(employee?.role && can(employee.role, 'recipes', 'approve'));
}

export function canCreateFormulation(employee, email) {
  if (isMasterAdmin(email)) return { allowed: true };
  if (!employee?.role) return { allowed: false, error: 'Employee profile not found.' };
  return can(employee.role, 'recipes', 'create')
    ? { allowed: true }
    : { allowed: false, error: 'Insufficient permissions to create recipes.' };
}

export function canEditFormulation(formulation, employee, email) {
  if (isMasterAdmin(email)) return { allowed: true };
  if (!formulation) return { allowed: false, error: 'Recipe not found.' };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };
  if (formulation.status === 'Approved' || formulation.status === 'Archived') {
    return { allowed: false, error: 'Cannot edit an approved or archived formulation. Create a new version instead.' };
  }
  if (sameId(formulation.created_by, employee.id) || isFormulationApprover(employee, email)) return { allowed: true };
  return { allowed: false, error: 'Only the creator or an approver can edit this recipe.' };
}

export function validateFormulationStatusChange({ formulation, employee, email, nextStatus, rejectionReason }) {
  if (!FORMULATION_STATUSES.has(nextStatus)) return { allowed: false, error: `Invalid status: ${nextStatus}` };
  if (isMasterAdmin(email)) return { allowed: true };
  if (!formulation) return { allowed: false, error: 'Recipe not found.' };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };

  const isOwner = sameId(formulation.created_by, employee.id);
  const isApprover = isFormulationApprover(employee, email);

  if (nextStatus === 'Approved') {
    if (!isApprover) return { allowed: false, error: 'Only CEO, CTO, or Admin can approve formulations.' };
    if (formulation.status !== 'In Review') return { allowed: false, error: 'Only recipes In Review can be approved.' };
    return { allowed: true };
  }

  if (nextStatus === 'In Review') {
    if (!['Draft', 'active'].includes(formulation.status)) return { allowed: false, error: 'Only Draft recipes can be submitted for review.' };
    return isOwner || isApprover
      ? { allowed: true }
      : { allowed: false, error: 'Only the creator or an approver can submit this recipe for review.' };
  }

  if (nextStatus === 'Draft') {
    if (formulation.status !== 'In Review') return { allowed: false, error: 'Only recipes In Review can be returned to Draft.' };
    if (isApprover) {
      if (!rejectionReason || rejectionReason.trim().length < 5) {
        return { allowed: false, error: 'A mandatory rejection reason (min 5 characters) is required to return a recipe to Draft.' };
      }
      return { allowed: true };
    }
    return isOwner
      ? { allowed: true }
      : { allowed: false, error: 'Only the creator can recall this recipe to Draft.' };
  }

  if (nextStatus === 'Archived') {
    if (formulation.status === 'Approved') {
      return isApprover
        ? { allowed: true }
        : { allowed: false, error: 'Only CEO, CTO, or Admin can archive approved recipes.' };
    }
    return isOwner || isApprover
      ? { allowed: true }
      : { allowed: false, error: 'Only the creator or an approver can archive this recipe.' };
  }

  return { allowed: false, error: `Invalid status: ${nextStatus}` };
}

export function canDeleteFormulation(formulation, employee, email) {
  if (isMasterAdmin(email)) return { allowed: true };
  if (!formulation) return { allowed: false, error: 'Recipe not found.' };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };

  const isOwner = sameId(formulation.created_by, employee.id);
  const isApprover = isFormulationApprover(employee, email);

  if (formulation.status === 'Approved') {
    return isApprover
      ? { allowed: true }
      : { allowed: false, error: 'Only admin/CEO/CTO can delete an approved recipe. Use Archive to hide it instead.' };
  }
  if (formulation.status === 'In Review') {
    return isApprover
      ? { allowed: true }
      : { allowed: false, error: 'Only an approver can delete a recipe that is In Review.' };
  }
  return isOwner || isApprover
    ? { allowed: true }
    : { allowed: false, error: 'Only the creator or an approver can delete this recipe.' };
}
