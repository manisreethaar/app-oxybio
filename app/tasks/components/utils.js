/**
 * Shared utilities for the Tasks module.
 */

export const formatMinutes = (mins) => {
  if (!mins || mins === 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
