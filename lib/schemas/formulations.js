// Recipe code: R + digits (R01, R12) OR 2–5 uppercase letters optionally followed by digits
const CODE_RE = /^[A-Z]{1,5}\d{0,3}$/;

export function validateCode(code) {
  if (!code || typeof code !== 'string') return 'Recipe code is required.';
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) return 'Recipe code must be 1–5 uppercase letters optionally followed by up to 3 digits (e.g. R01, RKU, RKU01).';
  return null;
}
