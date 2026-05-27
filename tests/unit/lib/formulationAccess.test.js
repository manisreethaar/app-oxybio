import { describe, expect, it } from 'vitest';
import {
  canCreateFormulation,
  canDeleteFormulation,
  canEditFormulation,
  validateFormulationStatusChange,
} from '@/lib/formulations/access';

const draft = { status: 'Draft', created_by: 'creator-1' };
const review = { status: 'In Review', created_by: 'creator-1' };
const approved = { status: 'Approved', created_by: 'creator-1' };
const creator = { id: 'creator-1', role: 'scientist' };
const outsider = { id: 'user-2', role: 'scientist' };
const approver = { id: 'admin-1', role: 'admin' };

describe('formulation access policy', () => {
  it('allows scientists and above to create recipes through permissions', () => {
    expect(canCreateFormulation(creator, 'creator@example.com').allowed).toBe(true);
    expect(canCreateFormulation({ id: 'intern-1', role: 'intern' }, 'intern@example.com').allowed).toBe(false);
  });

  it('allows only creator or approver to edit non-approved recipes', () => {
    expect(canEditFormulation(draft, creator, 'creator@example.com').allowed).toBe(true);
    expect(canEditFormulation(draft, approver, 'admin@example.com').allowed).toBe(true);
    expect(canEditFormulation(draft, outsider, 'user@example.com').allowed).toBe(false);
    expect(canEditFormulation(approved, approver, 'admin@example.com').allowed).toBe(false);
  });

  it('requires approver and In Review status for approval', () => {
    expect(validateFormulationStatusChange({
      formulation: review,
      employee: approver,
      email: 'admin@example.com',
      nextStatus: 'Approved',
    }).allowed).toBe(true);

    expect(validateFormulationStatusChange({
      formulation: draft,
      employee: approver,
      email: 'admin@example.com',
      nextStatus: 'Approved',
    }).allowed).toBe(false);

    expect(validateFormulationStatusChange({
      formulation: review,
      employee: creator,
      email: 'creator@example.com',
      nextStatus: 'Approved',
    }).allowed).toBe(false);
  });

  it('requires rejection reason when an approver returns review to draft', () => {
    expect(validateFormulationStatusChange({
      formulation: review,
      employee: approver,
      email: 'admin@example.com',
      nextStatus: 'Draft',
      rejectionReason: 'Needs pH correction',
    }).allowed).toBe(true);

    expect(validateFormulationStatusChange({
      formulation: review,
      employee: approver,
      email: 'admin@example.com',
      nextStatus: 'Draft',
      rejectionReason: 'bad',
    }).allowed).toBe(false);
  });

  it('lets the creator recall review to draft without approver rejection reason', () => {
    expect(validateFormulationStatusChange({
      formulation: review,
      employee: creator,
      email: 'creator@example.com',
      nextStatus: 'Draft',
    }).allowed).toBe(true);
  });

  it('blocks unrelated users from deleting drafts', () => {
    expect(canDeleteFormulation(draft, creator, 'creator@example.com').allowed).toBe(true);
    expect(canDeleteFormulation(draft, outsider, 'user@example.com').allowed).toBe(false);
    expect(canDeleteFormulation(review, creator, 'creator@example.com').allowed).toBe(false);
    expect(canDeleteFormulation(approved, approver, 'admin@example.com').allowed).toBe(true);
  });
});
