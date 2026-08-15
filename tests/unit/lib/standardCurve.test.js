import { describe, expect, it } from 'vitest';
import { calculateConcentration } from '@/lib/batches/standardCurve';

describe('calculateConcentration', () => {
  it('solves concentration from OD, slope, and intercept', () => {
    // OD = slope * concentration + intercept => concentration = (OD - intercept) / slope
    expect(calculateConcentration({ od: 1.2, slope: 0.4, intercept: 0.1 })).toBeCloseTo((1.2 - 0.1) / 0.4);
  });

  it('returns null instead of throwing when slope is zero', () => {
    expect(calculateConcentration({ od: 1.2, slope: 0, intercept: 0.1 })).toBeNull();
  });

  it('returns null for non-numeric input instead of crashing (regression for the anthroneConc ReferenceError)', () => {
    expect(calculateConcentration({ od: 'abc', slope: 0.4, intercept: 0.1 })).toBeNull();
    expect(calculateConcentration({ od: 1.2, slope: undefined, intercept: 0.1 })).toBeNull();
  });
});
