import { describe, it, expect } from 'vitest';
import { ACTION_PAYLOAD_SCHEMAS, createTaskSchema } from '@/lib/schemas/tasks';

// ─── createTaskSchema ──────────────────────────────────────────────────────

describe('createTaskSchema', () => {
  const validTask = {
    title:       'Deploy batch OB-FER-26-001',
    assigned_to: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    due_date:    '2026-06-01',
    priority:    'high',
  };

  it('accepts a valid task payload', () => {
    expect(createTaskSchema.safeParse(validTask).success).toBe(true);
  });

  it('rejects a missing title', () => {
    const r = createTaskSchema.safeParse({ ...validTask, title: '' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error.format())).toContain('Title is required');
  });

  it('rejects an invalid UUID for assigned_to', () => {
    const r = createTaskSchema.safeParse({ ...validTask, assigned_to: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown priority value', () => {
    const r = createTaskSchema.safeParse({ ...validTask, priority: 'critical' });
    expect(r.success).toBe(false);
  });

  it('accepts all four valid priority values', () => {
    for (const p of ['low', 'medium', 'high', 'urgent']) {
      expect(createTaskSchema.safeParse({ ...validTask, priority: p }).success).toBe(true);
    }
  });

  it('defaults status to open and approval_status to not_required', () => {
    const result = createTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('open');
    expect(result.data.approval_status).toBe('not_required');
    expect(result.data.is_personal_reminder).toBe(false);
  });

  it('accepts an optional checklist with valid shape', () => {
    const r = createTaskSchema.safeParse({
      ...validTask,
      checklist: [{ text: 'Step 1', done: false }, { text: 'Step 2', done: true }],
    });
    expect(r.success).toBe(true);
  });
});

// ─── ACTION_PAYLOAD_SCHEMAS ────────────────────────────────────────────────

describe('ACTION_PAYLOAD_SCHEMAS — no-payload actions', () => {
  for (const action of ['start_timer', 'acknowledge_task', 'approve']) {
    it(`${action}: accepts empty payload`, () => {
      expect(ACTION_PAYLOAD_SCHEMAS[action].safeParse({}).success).toBe(true);
    });
  }
});

describe('ACTION_PAYLOAD_SCHEMAS — pause_timer', () => {
  it('accepts valid logged_minutes', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.pause_timer.safeParse({ logged_minutes: 30 }).success).toBe(true);
  });

  it('rejects negative logged_minutes', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.pause_timer.safeParse({ logged_minutes: -1 }).success).toBe(false);
  });

  it('rejects missing logged_minutes', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.pause_timer.safeParse({}).success).toBe(false);
  });

  it('accepts zero (valid — paused immediately)', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.pause_timer.safeParse({ logged_minutes: 0 }).success).toBe(true);
  });
});

describe('ACTION_PAYLOAD_SCHEMAS — update_progress', () => {
  it('accepts valid percentage and optional note', () => {
    const r = ACTION_PAYLOAD_SCHEMAS.update_progress.safeParse({ percentage: 75, note: 'Media prep done' });
    expect(r.success).toBe(true);
  });

  it('rejects percentage above 100', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.update_progress.safeParse({ percentage: 101 }).success).toBe(false);
  });

  it('rejects negative percentage', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.update_progress.safeParse({ percentage: -5 }).success).toBe(false);
  });

  it('accepts boundary values 0 and 100', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.update_progress.safeParse({ percentage: 0 }).success).toBe(true);
    expect(ACTION_PAYLOAD_SCHEMAS.update_progress.safeParse({ percentage: 100 }).success).toBe(true);
  });

  it('accepts percentage without note', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.update_progress.safeParse({ percentage: 50 }).success).toBe(true);
  });
});

describe('ACTION_PAYLOAD_SCHEMAS — update_checklist', () => {
  it('accepts a valid checklist array', () => {
    const r = ACTION_PAYLOAD_SCHEMAS.update_checklist.safeParse({
      checklist: [{ text: 'Sterilise media', done: true }, { text: 'Inoculate', done: false }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects checklist items missing text', () => {
    const r = ACTION_PAYLOAD_SCHEMAS.update_checklist.safeParse({
      checklist: [{ done: true }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects checklist items with non-boolean done field', () => {
    const r = ACTION_PAYLOAD_SCHEMAS.update_checklist.safeParse({
      checklist: [{ text: 'Step', done: 'yes' }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts an empty checklist array', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.update_checklist.safeParse({ checklist: [] }).success).toBe(true);
  });
});

describe('ACTION_PAYLOAD_SCHEMAS — submit_review', () => {
  const valid = { logged_minutes: 45, completion_note: 'All QC passed' };

  it('accepts valid review payload', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.submit_review.safeParse(valid).success).toBe(true);
  });

  it('rejects missing logged_minutes', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.submit_review.safeParse({ completion_note: 'Done' }).success).toBe(false);
  });

  it('rejects negative logged_minutes', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.submit_review.safeParse({ logged_minutes: -10 }).success).toBe(false);
  });

  it('accepts without optional fields', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.submit_review.safeParse({ logged_minutes: 0 }).success).toBe(true);
  });

  it('accepts is_personal_reminder flag', () => {
    const r = ACTION_PAYLOAD_SCHEMAS.submit_review.safeParse({ ...valid, is_personal_reminder: true });
    expect(r.success).toBe(true);
    expect(r.data.is_personal_reminder).toBe(true);
  });
});

describe('ACTION_PAYLOAD_SCHEMAS — reject', () => {
  it('accepts a valid rejection note (≥5 chars)', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.reject.safeParse({ reject_note: 'QC failed pH 3.1' }).success).toBe(true);
  });

  it('rejects a note shorter than 5 characters', () => {
    const r = ACTION_PAYLOAD_SCHEMAS.reject.safeParse({ reject_note: 'bad' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error.format())).toContain('5 characters');
  });

  it('rejects missing reject_note', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.reject.safeParse({}).success).toBe(false);
  });

  it('rejects empty string reject_note', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.reject.safeParse({ reject_note: '' }).success).toBe(false);
  });

  it('accepts exactly 5 characters (boundary)', () => {
    expect(ACTION_PAYLOAD_SCHEMAS.reject.safeParse({ reject_note: '12345' }).success).toBe(true);
  });
});
