export type StockFilter = 'all' | 'low' | 'expiring' | 'expired';

export type InventoryItem = {
  id?: string;
  name?: string;
  category?: string;
  sub_category?: string;
  unit?: string;
  min_stock_level?: string | number | null;
  hazardous?: boolean;
  cold_chain_required?: boolean;
  coa_required?: boolean;
  created_at?: string;
  item_code?: string;
};

export type StockEntry = {
  id?: string;
  item_id?: string;
  current_quantity?: string | number | null;
  expiry_date?: string | null;
  coa_expiry_date?: string | null;
  sds_expiry_date?: string | null;
  inventory_items?: InventoryItem | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function daysUntilExpiry(expiryDate?: string | null, now = new Date()) {
  if (!expiryDate) return null;
  return Math.floor((new Date(expiryDate).getTime() - now.getTime()) / DAY_MS);
}

export function getStockRisk(stock: StockEntry, now = new Date()) {
  const daysLeft = daysUntilExpiry(stock.expiry_date, now);
  const coaDaysLeft = daysUntilExpiry(stock.coa_expiry_date, now);
  const sdsDaysLeft = daysUntilExpiry(stock.sds_expiry_date, now);
  
  const quantity = toNumber(stock.current_quantity);
  const minLevel = toNumber(stock.inventory_items?.min_stock_level);

  const isExpired = (daysLeft != null && daysLeft < 0) || (coaDaysLeft != null && coaDaysLeft < 0) || (sdsDaysLeft != null && sdsDaysLeft < 0);
  const isExpiring = !isExpired && ((daysLeft != null && daysLeft < 30) || (coaDaysLeft != null && coaDaysLeft < 30) || (sdsDaysLeft != null && sdsDaysLeft < 30));

  return {
    quantity,
    minLevel,
    daysLeft,
    coaDaysLeft,
    sdsDaysLeft,
    isExpired,
    isExpiring,
    isLow: quantity <= minLevel,
    isOut: quantity <= 0,
  };
}

export function getStockStats(stock: StockEntry[], now = new Date()) {
  return stock.reduce(
    (totals, row) => {
      const risk = getStockRisk(row, now);
      totals.total += 1;
      if (risk.isLow) totals.low += 1;
      if (risk.isExpiring) totals.expiring += 1;
      if (risk.isExpired) totals.expired += 1;
      if (risk.isOut) totals.out += 1;
      return totals;
    },
    { total: 0, low: 0, expiring: 0, expired: 0, out: 0 }
  );
}

export function filterStock(stock: StockEntry[], filter: StockFilter, now = new Date()) {
  return stock.filter((row) => {
    const risk = getStockRisk(row, now);
    if (filter === 'low') return risk.isLow;
    if (filter === 'expiring') return risk.isExpiring;
    if (filter === 'expired') return risk.isExpired;
    return true;
  });
}

export function getItemStats(items: InventoryItem[]) {
  return {
    total: items.length,
    hazardous: items.filter((item) => item.hazardous).length,
    coldChain: items.filter((item) => item.cold_chain_required).length,
    coaRequired: items.filter((item) => item.coa_required).length,
  };
}

export function getStockFilterLabel(filter: StockFilter) {
  const labels: Record<StockFilter, string> = {
    all: 'No stock entries yet',
    low: 'No low-stock items',
    expiring: 'No stock expiring in 30 days',
    expired: 'No expired stock',
  };
  return labels[filter];
}
