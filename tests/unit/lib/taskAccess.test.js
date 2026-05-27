import { describe, expect, it } from 'vitest';
import { canPatchTaskAction, isMasterAdmin } from '@/lib/tasks/access';

const task = {
  assigned_to: 'employee-1',
  assigned_by: 'creator-1',
};

describe('task action access', () => {
  it('allows the assignee to update their own work actions', () => {
    const result = canPatchTaskAction({
      action: 'update_progress',
      task,
      currentUser: { id: 'employee-1', role: 'scientist' },
      userEmail: 'employee@example.com',
    });

    expect(result.allowed).toBe(true);
  });

  it('blocks another employee from updating assignee work actions', () => {
    const result = canPatchTaskAction({
      action: 'submit_review',
      task,
      currentUser: { id: 'employee-2', role: 'scientist' },
      userEmail: 'employee@example.com',
    });

    expect(result.allowed).toBe(false);
    expect(result.error).toContain('assigned employee');
  });

  it('allows the creator to approve or reject', () => {
    const result = canPatchTaskAction({
      action: 'approve',
      task,
      currentUser: { id: 'creator-1', role: 'scientist' },
      userEmail: 'creator@example.com',
    });

    expect(result.allowed).toBe(true);
  });

  it('allows leadership to approve or reject even when not the creator', () => {
    const result = canPatchTaskAction({
      action: 'reject',
      task,
      currentUser: { id: 'admin-1', role: 'admin' },
      userEmail: 'admin@example.com',
    });

    expect(result.allowed).toBe(true);
  });

  it('blocks unrelated employees from reviewing', () => {
    const result = canPatchTaskAction({
      action: 'approve',
      task,
      currentUser: { id: 'employee-2', role: 'scientist' },
      userEmail: 'employee@example.com',
    });

    expect(result.allowed).toBe(false);
    expect(result.error).toContain('creator or leadership');
  });

  it('allows the master admin override by email', () => {
    expect(isMasterAdmin('MANISREETHAAR@gmail.com')).toBe(true);
    expect(canPatchTaskAction({
      action: 'approve',
      task,
      currentUser: null,
      userEmail: 'manisreethaar@gmail.com',
    }).allowed).toBe(true);
  });
});
