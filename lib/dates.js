// lib/dates.js

/**
 * Converts a UTC datetime string to a format suitable for datetime-local input fields
 * (YYYY-MM-DDThh:mm) in the user's local timezone.
 */
export function toLocalDatetime(utcStr) {
  if (!utcStr) return '';
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return '';
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

/**
 * Returns the current datetime in a format suitable for datetime-local input fields
 */
export function nowDatetimeLocal() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}
