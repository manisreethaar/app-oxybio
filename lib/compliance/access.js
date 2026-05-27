import { can, isMasterAdmin } from '@/lib/permissions';

export function canManageCompliance(employee, email) {
  return isMasterAdmin(email) || Boolean(employee?.role && can(employee.role, 'compliance', 'close_capa'));
}

export function canRaiseDeviation(employee, email) {
  return isMasterAdmin(email) || Boolean(employee?.role && can(employee.role, 'compliance', 'create_ncr'));
}

export function requireComplianceManager(employee, email, actionLabel = 'perform this compliance action') {
  if (canManageCompliance(employee, email)) return { allowed: true };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };
  return { allowed: false, error: `Only leadership can ${actionLabel}.` };
}

export function requireDeviationReporter(employee, email) {
  if (canRaiseDeviation(employee, email)) return { allowed: true };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };
  return { allowed: false, error: 'You do not have permission to raise deviations.' };
}
