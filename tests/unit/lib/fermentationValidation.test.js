import { describe, expect, it } from 'vitest';
import {
  calculateElapsedHours,
  validateEndpointPayload,
  validateReadingPayload,
} from '@/lib/fermentation/validation';

describe('fermentation validation', () => {
  it('rejects out-of-range pH readings', () => {
    const result = validateReadingPayload({ ph: 15 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/pH must be between/);
  });

  it('requires a reason for retrospective readings', () => {
    const result = validateReadingPayload({ ph: 4.4, is_retrospective: true, retro_reason: '' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Retrospective readings require a reason.');
  });

  it('calculates elapsed fermentation hours from T0 to endpoint end time', () => {
    expect(calculateElapsedHours('2026-05-26T00:00:00.000Z', '2026-05-27T06:30:00.000Z')).toBe(30.5);
  });

  it('requires endpoint pH, total hours, and end time', () => {
    const result = validateEndpointPayload({ final_ph: 4.3, total_hours: 24 });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Fermentation end time is required for endpoint declaration.');
  });

  it('marks endpoint pH outside target band without rejecting valid pH values', () => {
    const result = validateEndpointPayload({
      final_ph: 5.1,
      total_hours: 24,
      end_time: '2026-05-27T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    expect(result.values.is_endpoint_ph_out_of_range).toBe(true);
  });
});
