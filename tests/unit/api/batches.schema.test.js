import { describe, it, expect } from 'vitest';
import { createBatchSchema as postSchema } from '@/lib/schemas/batches';

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('batch postSchema', () => {
  const validPayload = {
    formulation_id:    VALID_UUID,
    experiment_type:   'F1',
    sku_target:        'OXY-PRO-250',
    planned_volume_ml: 500,
    num_flasks:        3,
  };

  it('accepts a valid batch creation payload', () => {
    expect(postSchema.safeParse(validPayload).success).toBe(true);
  });

  it('rejects invalid formulation_id (not a UUID)', () => {
    const r = postSchema.safeParse({ ...validPayload, formulation_id: 'not-uuid' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error.format())).toContain('approved formulation');
  });

  it('rejects empty experiment_type', () => {
    const r = postSchema.safeParse({ ...validPayload, experiment_type: '' });
    expect(r.success).toBe(false);
  });

  it('rejects experiment_type longer than 80 characters', () => {
    const r = postSchema.safeParse({ ...validPayload, experiment_type: 'A'.repeat(81) });
    expect(r.success).toBe(false);
  });

  it('rejects num_flasks below minimum (0)', () => {
    const r = postSchema.safeParse({ ...validPayload, num_flasks: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects num_flasks above maximum (11)', () => {
    const r = postSchema.safeParse({ ...validPayload, num_flasks: 11 });
    expect(r.success).toBe(false);
  });

  it('accepts num_flasks boundary values 1 and 10', () => {
    expect(postSchema.safeParse({ ...validPayload, num_flasks: 1 }).success).toBe(true);
    expect(postSchema.safeParse({ ...validPayload, num_flasks: 10 }).success).toBe(true);
  });

  it('rejects non-positive planned_volume_ml', () => {
    expect(postSchema.safeParse({ ...validPayload, planned_volume_ml: 0 }).success).toBe(false);
    expect(postSchema.safeParse({ ...validPayload, planned_volume_ml: -100 }).success).toBe(false);
  });

  it('defaults sku_target to Unassigned when omitted', () => {
    const { sku_target, ...without } = validPayload;
    const r = postSchema.safeParse(without);
    expect(r.success).toBe(true);
    expect(r.data.sku_target).toBe('Unassigned');
  });

  it('defaults assigned_team to empty array when omitted', () => {
    const r = postSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
    expect(r.data.assigned_team).toEqual([]);
  });

  it('rejects non-UUID entries in assigned_team', () => {
    const r = postSchema.safeParse({ ...validPayload, assigned_team: ['not-a-uuid'] });
    expect(r.success).toBe(false);
  });

  it('accepts a valid assigned_team with multiple UUIDs', () => {
    const r = postSchema.safeParse({
      ...validPayload,
      assigned_team: [VALID_UUID, 'a1b2c3d4-e5f6-4789-ab01-cd2345ef6789'],
    });
    expect(r.success).toBe(true);
    expect(r.data.assigned_team).toHaveLength(2);
  });

  it('coerces string planned_volume_ml to number', () => {
    const r = postSchema.safeParse({ ...validPayload, planned_volume_ml: '750' });
    expect(r.success).toBe(true);
    expect(r.data.planned_volume_ml).toBe(750);
  });
});
