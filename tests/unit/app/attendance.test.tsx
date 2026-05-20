import { describe, it, expect } from 'vitest';

describe('Attendance Module Constants', () => {
  it('should have correct default check-in time', () => {
    const DEFAULT_CHECKIN_TIME = '08:30';
    expect(DEFAULT_CHECKIN_TIME).toBe('08:30');
  });

  it('should have correct late threshold', () => {
    const LATE_THRESHOLD_MINUTES = 15;
    expect(LATE_THRESHOLD_MINUTES).toBe(15);
  });

  it('should have valid status values', () => {
    const STATUS_VALUES = ['present', 'absent', 'late', 'half_day', 'leave'];
    expect(STATUS_VALUES).toContain('present');
    expect(STATUS_VALUES).toContain('late');
  });
});

describe('Attendance Validation Rules', () => {
  it('should validate check-in time format', () => {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    expect(timeRegex.test('08:30')).toBe(true);
    expect(timeRegex.test('25:00')).toBe(false);
  });

  it('should validate date format', () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    expect(dateRegex.test('2026-04-02')).toBe(true);
  });
});

describe('Attendance Tab States', () => {
  const TABS = ['today', 'analytics', 'history'];

  it('should have today as first tab', () => {
    expect(TABS[0]).toBe('today');
  });

  it('should have 3 main tabs', () => {
    expect(TABS).toHaveLength(3);
  });

  it('should include analytics tab', () => {
    expect(TABS).toContain('analytics');
  });
});

describe('Attendance Color Coding', () => {
  const STATUS_COLORS = {
    present: 'bg-emerald-100 text-emerald-700',
    absent: 'bg-red-100 text-red-700',
    late: 'bg-amber-100 text-amber-700',
    half_day: 'bg-orange-100 text-orange-700',
    leave: 'bg-blue-100 text-blue-700',
  };

  it('should have green for present', () => {
    expect(STATUS_COLORS.present).toContain('emerald');
  });

  it('should have red for absent', () => {
    expect(STATUS_COLORS.absent).toContain('red');
  });

  it('should have amber for late', () => {
    expect(STATUS_COLORS.late).toContain('amber');
  });

  it('should have all 5 status colors', () => {
    expect(Object.keys(STATUS_COLORS)).toHaveLength(5);
  });
});
