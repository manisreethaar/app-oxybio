import { describe, expect, it } from 'vitest';
import {
  canManageCompliance,
  canRaiseDeviation,
  requireComplianceManager,
  requireDeviationReporter,
} from '@/lib/compliance/access';

describe('compliance access policy', () => {
  it('allows all known roles to raise deviations', () => {
    expect(canRaiseDeviation({ id: 'intern-1', role: 'intern' }, 'intern@example.com')).toBe(true);
    expect(canRaiseDeviation({ id: 'scientist-1', role: 'scientist' }, 'scientist@example.com')).toBe(true);
  });

  it('limits compliance management to leadership', () => {
    expect(canManageCompliance({ id: 'ceo-1', role: 'ceo' }, 'ceo@example.com')).toBe(true);
    expect(canManageCompliance({ id: 'cto-1', role: 'cto' }, 'cto@example.com')).toBe(true);
    expect(canManageCompliance({ id: 'admin-1', role: 'admin' }, 'admin@example.com')).toBe(true);
    expect(canManageCompliance({ id: 'scientist-1', role: 'scientist' }, 'scientist@example.com')).toBe(false);
  });

  it('returns clear denial messages for non-managers', () => {
    const result = requireComplianceManager({ id: 'scientist-1', role: 'scientist' }, 'scientist@example.com', 'close deviations');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('leadership');
  });

  it('allows master admin override', () => {
    expect(requireComplianceManager(null, 'manisreethaar@gmail.com').allowed).toBe(true);
    expect(requireDeviationReporter(null, 'manisreethaar@gmail.com').allowed).toBe(true);
  });
});
