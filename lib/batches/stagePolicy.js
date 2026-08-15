export const BATCH_STAGE_ORDER = [
  'media_prep',
  'sterilisation',
  'inoculation',
  'fermentation',
  'harvest',
  'straining',
  'qc_hold',
];

export const BATCH_TERMINAL_STAGES = new Set(['released', 'rejected']);
export const BATCH_LEADERSHIP_ROLES = new Set(['ceo', 'cto', 'admin']);
export const BATCH_START_STATUSES = new Set(['planned', 'scheduled']);

export const BATCH_PARENT_TRANSITIONS = new Map([
  ['media_prep', 'sterilisation'],
  ['sterilisation', 'inoculation'],
]);

export function normaliseStage(stage) {
  return typeof stage === 'string' ? stage.trim() : '';
}

export function isAssignedToBatch(batch, employeeId) {
  if (!employeeId) return false;
  const assignedTeam = Array.isArray(batch?.assigned_team) ? batch.assigned_team : [];
  return assignedTeam.map(String).includes(String(employeeId));
}

export function canOperateBatch({ batch, employee, isMaster = false }) {
  if (isMaster) return { allowed: true };
  if (!batch) return { allowed: false, error: 'Batch not found.' };
  if (!employee?.id) return { allowed: false, error: 'Employee profile not found.' };

  const role = String(employee.role || '').toLowerCase();
  const isCreator = batch.created_by && String(batch.created_by) === String(employee.id);
  if (isCreator || isAssignedToBatch(batch, employee.id) || BATCH_LEADERSHIP_ROLES.has(role)) {
    return { allowed: true };
  }

  return { allowed: false, error: 'Only assigned team members, the creator, or leadership can operate this batch.' };
}

export function validateBatchStart(batch) {
  if (!batch) return { ok: false, error: 'Batch not found.' };
  if (!BATCH_START_STATUSES.has(batch.status) || batch.current_stage) {
    return { ok: false, error: 'Batch is already started or completed.' };
  }
  return { ok: true };
}

export function getBatchStatusForStage(stage) {
  if (stage === 'fermentation') return 'fermenting';
  if (stage === 'qc_hold') return 'qc-hold';
  if (BATCH_TERMINAL_STAGES.has(stage)) return stage;
  return 'in-progress';
}

export function validateParentStageTransition({ batch, fromStage, toStage }) {
  const cleanFrom = normaliseStage(fromStage);
  const cleanTo = normaliseStage(toStage);

  if (!cleanTo) return { ok: false, error: 'Target stage is required.' };
  if (BATCH_TERMINAL_STAGES.has(cleanTo)) {
    return { ok: false, error: 'Release or rejection must use the controlled disposition workflow.' };
  }
  if (!BATCH_STAGE_ORDER.includes(cleanTo)) {
    return { ok: false, error: 'Unknown target stage.' };
  }
  if (!batch) return { ok: false, error: 'Batch not found.' };
  if (BATCH_TERMINAL_STAGES.has(batch.status) || BATCH_TERMINAL_STAGES.has(batch.current_stage)) {
    return { ok: false, error: 'Finalised batches cannot be advanced.' };
  }

  const currentStage = normaliseStage(batch.current_stage);
  if (!currentStage) return { ok: false, error: 'Start the batch before advancing stages.' };
  if (cleanFrom && cleanFrom !== currentStage) {
    return { ok: false, error: `Batch is currently at ${currentStage.replace(/_/g, ' ')}, not ${cleanFrom.replace(/_/g, ' ')}.` };
  }

  const expectedTo = BATCH_PARENT_TRANSITIONS.get(currentStage);
  if (expectedTo !== cleanTo) {
    return { ok: false, error: `Invalid stage transition. Expected next stage is ${expectedTo?.replace(/_/g, ' ') || 'not available here'}.` };
  }

  return { ok: true, fromStage: currentStage, toStage: cleanTo };
}
