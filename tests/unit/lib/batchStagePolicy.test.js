import { describe, expect, it } from 'vitest';
import {
  canOperateBatch,
  getBatchStatusForStage,
  validateBatchStart,
  validateParentStageTransition,
} from '@/lib/batches/stagePolicy';

const batch = {
  status: 'in-progress',
  current_stage: 'media_prep',
  created_by: 'creator-1',
  assigned_team: ['operator-1'],
};

describe('batch stage policy', () => {
  it('allows assigned team members to operate the batch', () => {
    const result = canOperateBatch({
      batch,
      employee: { id: 'operator-1', role: 'scientist' },
    });

    expect(result.allowed).toBe(true);
  });

  it('allows leadership to operate the batch', () => {
    const result = canOperateBatch({
      batch,
      employee: { id: 'admin-1', role: 'admin' },
    });

    expect(result.allowed).toBe(true);
  });

  it('blocks unrelated employees from operating the batch', () => {
    const result = canOperateBatch({
      batch,
      employee: { id: 'operator-2', role: 'scientist' },
    });

    expect(result.allowed).toBe(false);
    expect(result.error).toContain('assigned team');
  });

  it('allows planned or scheduled batches to start only before a current stage exists', () => {
    expect(validateBatchStart({ status: 'scheduled', current_stage: null }).ok).toBe(true);
    expect(validateBatchStart({ status: 'planned', current_stage: null }).ok).toBe(true);
    expect(validateBatchStart({ status: 'scheduled', current_stage: 'media_prep' }).ok).toBe(false);
    expect(validateBatchStart({ status: 'released', current_stage: 'released' }).ok).toBe(false);
  });

  it('allows only the next parent stage transition', () => {
    expect(validateParentStageTransition({
      batch,
      fromStage: 'media_prep',
      toStage: 'sterilisation',
    }).ok).toBe(true);

    const skipped = validateParentStageTransition({
      batch,
      fromStage: 'media_prep',
      toStage: 'inoculation',
    });
    expect(skipped.ok).toBe(false);
    expect(skipped.error).toContain('Expected next stage');
  });

  it('blocks terminal transitions through the generic stage API', () => {
    const result = validateParentStageTransition({
      batch: { ...batch, current_stage: 'qc_hold' },
      fromStage: 'qc_hold',
      toStage: 'released',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('controlled disposition');
  });

  it('maps stage status labels consistently', () => {
    expect(getBatchStatusForStage('fermentation')).toBe('fermenting');
    expect(getBatchStatusForStage('qc_hold')).toBe('qc-hold');
    expect(getBatchStatusForStage('sterilisation')).toBe('in-progress');
  });
});
