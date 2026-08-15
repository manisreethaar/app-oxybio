import { describe, expect, it } from 'vitest';
import { getLegalNextStages, isLegalTransition, STAGE_TRANSITIONS } from '@/lib/batches/workflowStages';

describe('Seed Train stage transitions', () => {
  it('allows seed_1 to move to seed_2, seed_3, or production', () => {
    expect(getLegalNextStages('seed_1')).toEqual(['seed_2', 'seed_3', 'production']);
    expect(isLegalTransition('seed_1', 'seed_2')).toBe(true);
    expect(isLegalTransition('seed_1', 'seed_3')).toBe(true);
    expect(isLegalTransition('seed_1', 'production')).toBe(true);
  });

  it('allows seed_2 to skip to production but not back to seed_1', () => {
    expect(getLegalNextStages('seed_2')).toEqual(['seed_3', 'production']);
    expect(isLegalTransition('seed_2', 'seed_1')).toBe(false);
  });

  it('only allows seed_3 to move to production', () => {
    expect(getLegalNextStages('seed_3')).toEqual(['production']);
    expect(isLegalTransition('seed_3', 'production')).toBe(true);
    expect(isLegalTransition('seed_3', 'seed_2')).toBe(false);
  });

  it('production has no batch-level next stage — flasks drive progress from here', () => {
    expect(getLegalNextStages('production')).toEqual([]);
  });

  it('mirrors the legal-transition table embedded in the advance_seed_train_stage RPC', () => {
    // supabase/migrations/20260815190100_advance_seed_train_stage_rpc.sql
    expect(STAGE_TRANSITIONS.seed_1).toEqual(['seed_2', 'seed_3', 'production']);
    expect(STAGE_TRANSITIONS.seed_2).toEqual(['seed_3', 'production']);
    expect(STAGE_TRANSITIONS.seed_3).toEqual(['production']);
  });
});
