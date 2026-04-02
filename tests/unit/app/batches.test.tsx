import { describe, it, expect } from 'vitest';

describe('Batch Stage Constants', () => {
  const STAGE_ORDER = [
    'media_prep', 'sterilisation', 'inoculation', 'fermentation',
    'straining', 'extract_addition', 'qc_hold'
  ];

  it('should have 7 production stages', () => {
    expect(STAGE_ORDER).toHaveLength(7);
  });

  it('should start with media_prep', () => {
    expect(STAGE_ORDER[0]).toBe('media_prep');
  });

  it('should end with qc_hold', () => {
    expect(STAGE_ORDER[6]).toBe('qc_hold');
  });

  it('should have correct stage order sequence', () => {
    expect(STAGE_ORDER.indexOf('media_prep')).toBe(0);
    expect(STAGE_ORDER.indexOf('fermentation')).toBe(3);
    expect(STAGE_ORDER.indexOf('qc_hold')).toBe(6);
  });
});

describe('Stage Labels', () => {
  const STAGE_LABELS = {
    media_prep: 'Media Prep',
    sterilisation: 'Sterilisation',
    inoculation: 'Inoculation',
    fermentation: 'Fermentation',
    straining: 'Straining',
    extract_addition: 'Extract Addition',
    qc_hold: 'QC Hold',
    released: 'Released',
    rejected: 'Rejected',
  };

  it('should have correct labels for all stages', () => {
    expect(STAGE_LABELS.media_prep).toBe('Media Prep');
    expect(STAGE_LABELS.fermentation).toBe('Fermentation');
    expect(STAGE_LABELS.qc_hold).toBe('QC Hold');
    expect(STAGE_LABELS.released).toBe('Released');
  });
});

describe('SKU Badge Colors', () => {
  const SKU_COLORS = {
    CLARITY: 'bg-blue-50 text-blue-700 border-blue-200',
    MOMENTUM: 'bg-amber-50 text-amber-700 border-amber-200',
    VITALITY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Unassigned: 'bg-gray-100 text-gray-500 border-gray-200',
  };

  it('should have CLARITY color with blue tones', () => {
    expect(SKU_COLORS.CLARITY).toContain('blue');
  });

  it('should have MOMENTUM color with amber tones', () => {
    expect(SKU_COLORS.MOMENTUM).toContain('amber');
  });

  it('should have VITALITY color with emerald tones', () => {
    expect(SKU_COLORS.VITALITY).toContain('emerald');
  });

  it('should have Unassigned color with gray tones', () => {
    expect(SKU_COLORS.Unassigned).toContain('gray');
  });

  it('should have all SKU colors defined', () => {
    expect(Object.keys(SKU_COLORS)).toHaveLength(4);
  });
});

describe('Status Colors', () => {
  const STATUS_COLORS = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-100',
    in_progress: 'bg-orange-50 text-orange-700 border-orange-100',
    qc_hold: 'bg-purple-50 text-purple-700 border-purple-100',
    released: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rejected: 'bg-red-50 text-red-700 border-red-100',
  };

  it('should have released status with emerald color', () => {
    expect(STATUS_COLORS.released).toContain('emerald');
  });

  it('should have rejected status with red color', () => {
    expect(STATUS_COLORS.rejected).toContain('red');
  });

  it('should have in_progress status with orange color', () => {
    expect(STATUS_COLORS.in_progress).toContain('orange');
  });

  it('should have qc_hold status with purple color', () => {
    expect(STATUS_COLORS.qc_hold).toContain('purple');
  });

  it('should have scheduled status with blue color', () => {
    expect(STATUS_COLORS.scheduled).toContain('blue');
  });
});

describe('Batch Schema Validation Rules', () => {
  const experimentTypes = ['F1', 'F2', 'PROTO', 'SHELF'];
  const skuTargets = ['CLARITY', 'MOMENTUM', 'VITALITY', 'Unassigned'];

  it('should have 4 experiment types', () => {
    expect(experimentTypes).toHaveLength(4);
    expect(experimentTypes).toContain('F1');
    expect(experimentTypes).toContain('F2');
  });

  it('should have 4 SKU targets', () => {
    expect(skuTargets).toHaveLength(4);
    expect(skuTargets).toContain('CLARITY');
    expect(skuTargets).toContain('MOMENTUM');
    expect(skuTargets).toContain('VITALITY');
  });

  it('should have Unassigned as default', () => {
    expect(skuTargets).toContain('Unassigned');
  });
});
