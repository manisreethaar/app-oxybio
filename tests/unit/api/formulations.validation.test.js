import { describe, it, expect } from 'vitest';
import { validateCode } from '@/lib/schemas/formulations';
import { can, isMasterAdmin, canAssignTo } from '@/lib/permissions';

// ─── validateCode ─────────────────────────────────────────────────────────

describe('validateCode()', () => {
  it('accepts standard single-letter codes (R01, R12)', () => {
    expect(validateCode('R01')).toBeNull();
    expect(validateCode('R12')).toBeNull();
  });

  it('accepts multi-letter codes without digits (RKU, KAVNI)', () => {
    expect(validateCode('RKU')).toBeNull();
    expect(validateCode('KAVNI')).toBeNull();
  });

  it('accepts mixed codes (RKU01, KAVNI99)', () => {
    expect(validateCode('RKU01')).toBeNull();
    expect(validateCode('KAVNI99')).toBeNull();
  });

  it('returns an error for lowercase input (auto-trims and uppercases)', () => {
    // validateCode uppercases internally — lowercase should pass
    expect(validateCode('r01')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateCode('')).not.toBeNull();
  });

  it('returns error for null / undefined', () => {
    expect(validateCode(null)).not.toBeNull();
    expect(validateCode(undefined)).not.toBeNull();
  });

  it('returns error for code with spaces', () => {
    expect(validateCode('R 01')).not.toBeNull();
  });

  it('returns error for code longer than 5 letters + 3 digits', () => {
    expect(validateCode('TOOLONG01')).not.toBeNull();
    expect(validateCode('ABCDEF')).not.toBeNull();
  });

  it('returns error for digits-only code', () => {
    expect(validateCode('123')).not.toBeNull();
  });

  it('returns error for special characters', () => {
    expect(validateCode('R-01')).not.toBeNull();
    expect(validateCode('R_01')).not.toBeNull();
  });
});

// ─── isMasterAdmin ────────────────────────────────────────────────────────

describe('isMasterAdmin()', () => {
  it('returns true for the master admin email', () => {
    expect(isMasterAdmin('manisreethaar@gmail.com')).toBe(true);
  });

  it('returns false for any other email', () => {
    expect(isMasterAdmin('admin@oxygenbioinnovations.com')).toBe(false);
    expect(isMasterAdmin('ceo@oxygenbioinnovations.com')).toBe(false);
  });

  it('returns false for empty or null email', () => {
    expect(isMasterAdmin('')).toBe(false);
    expect(isMasterAdmin(null)).toBe(false);
    expect(isMasterAdmin(undefined)).toBe(false);
  });

  it('is case-insensitive (matches mixed-case variant)', () => {
    expect(isMasterAdmin('Manisreethaar@gmail.com')).toBe(true);
  });
});

// ─── canAssignTo ─────────────────────────────────────────────────────────

describe('canAssignTo()', () => {
  it('master admin can assign to anyone', () => {
    for (const role of ['intern', 'scientist', 'ceo', 'cto', 'admin']) {
      expect(canAssignTo('intern', role, 'manisreethaar@gmail.com')).toBe(true);
    }
  });

  it('ceo and cto can assign to any role', () => {
    expect(canAssignTo('ceo', 'intern')).toBe(true);
    expect(canAssignTo('ceo', 'cto')).toBe(true);
    expect(canAssignTo('cto', 'intern')).toBe(true);
    expect(canAssignTo('cto', 'research_fellow')).toBe(true);
  });

  it('lower roles cannot assign to ceo or cto', () => {
    expect(canAssignTo('admin', 'ceo')).toBe(false);
    expect(canAssignTo('research_fellow', 'cto')).toBe(false);
    expect(canAssignTo('scientist', 'ceo')).toBe(false);
  });

  it('equal-weight roles can assign to each other', () => {
    expect(canAssignTo('scientist', 'scientist')).toBe(true);
    expect(canAssignTo('admin', 'admin')).toBe(true);
  });

  it('higher role can assign to lower role', () => {
    expect(canAssignTo('research_fellow', 'scientist')).toBe(true);
    expect(canAssignTo('scientist', 'intern')).toBe(true);
    expect(canAssignTo('admin', 'research_fellow')).toBe(true);
  });

  it('lower role cannot assign to higher role', () => {
    expect(canAssignTo('intern', 'scientist')).toBe(false);
    expect(canAssignTo('scientist', 'research_fellow')).toBe(false);
  });

  it('returns false when fromRole or toRole is null', () => {
    expect(canAssignTo(null, 'intern')).toBe(false);
    expect(canAssignTo('admin', null)).toBe(false);
  });
});

// ─── can() — formulation/batch approval critical paths ────────────────────

describe('can() — formulation and batch approval', () => {
  it('only leadership can approve formulations', () => {
    expect(can('ceo',             'recipes', 'approve')).toBe(true);
    expect(can('cto',             'recipes', 'approve')).toBe(true);
    expect(can('admin',           'recipes', 'approve')).toBe(true);
    expect(can('research_fellow', 'recipes', 'approve')).toBe(false);
    expect(can('scientist',       'recipes', 'approve')).toBe(false);
    expect(can('intern',          'recipes', 'approve')).toBe(false);
  });

  it('only ceo and admin can release or reject batches', () => {
    expect(can('ceo',             'batches', 'release')).toBe(true);
    expect(can('admin',           'batches', 'release')).toBe(true);
    expect(can('cto',             'batches', 'release')).toBe(false);
    expect(can('research_fellow', 'batches', 'release')).toBe(false);
    expect(can('scientist',       'batches', 'release')).toBe(false);
  });

  it('only research_fellow+ can create batches', () => {
    expect(can('research_fellow', 'batches', 'create')).toBe(true);
    expect(can('ceo',             'batches', 'create')).toBe(true);
    expect(can('admin',           'batches', 'create')).toBe(true);
    expect(can('scientist',       'batches', 'create')).toBe(false);
    expect(can('intern',          'batches', 'create')).toBe(false);
  });

  it('all roles can log fermentation readings', () => {
    for (const role of ['intern', 'research_intern', 'scientist', 'research_fellow', 'cto', 'ceo', 'admin']) {
      expect(can(role, 'batches', 'log_reading')).toBe(true);
    }
  });
});
