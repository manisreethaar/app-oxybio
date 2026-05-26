import { describe, expect, it } from 'vitest';
import { filterStock, getStockRisk, getStockStats } from '@/app/inventory/inventoryUtils';

const NOW = new Date('2026-05-26T00:00:00.000Z');

describe('inventory stock risk helpers', () => {
  const stock = [
    {
      id: 'ok',
      current_quantity: 12,
      expiry_date: '2026-08-01',
      inventory_items: { min_stock_level: 5 },
    },
    {
      id: 'low',
      current_quantity: 2,
      expiry_date: '2026-08-01',
      inventory_items: { min_stock_level: 5 },
    },
    {
      id: 'expiring',
      current_quantity: 8,
      expiry_date: '2026-06-02',
      inventory_items: { min_stock_level: 5 },
    },
    {
      id: 'expired',
      current_quantity: 0,
      expiry_date: '2026-05-01',
      inventory_items: { min_stock_level: 5 },
    },
  ];

  it('classifies individual stock risks', () => {
    expect(getStockRisk(stock[1], NOW)).toMatchObject({ isLow: true, isExpired: false, isExpiring: false });
    expect(getStockRisk(stock[2], NOW)).toMatchObject({ isLow: false, isExpired: false, isExpiring: true });
    expect(getStockRisk(stock[3], NOW)).toMatchObject({ isLow: true, isOut: true, isExpired: true });
  });

  it('summarizes operational stock counts', () => {
    expect(getStockStats(stock, NOW)).toEqual({
      total: 4,
      low: 2,
      expiring: 1,
      expired: 1,
      out: 1,
    });
  });

  it('filters stock by action bucket', () => {
    expect(filterStock(stock, 'low', NOW).map((row) => row.id)).toEqual(['low', 'expired']);
    expect(filterStock(stock, 'expiring', NOW).map((row) => row.id)).toEqual(['expiring']);
    expect(filterStock(stock, 'expired', NOW).map((row) => row.id)).toEqual(['expired']);
  });
});
