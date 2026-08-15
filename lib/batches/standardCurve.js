// Standard curves are OD = slope * concentration + intercept
// => concentration = (OD - intercept) / slope
export function calculateConcentration({ od, slope, intercept }) {
  const m = parseFloat(slope);
  const c = parseFloat(intercept);
  const y = parseFloat(od);
  if (!Number.isFinite(m) || !Number.isFinite(c) || !Number.isFinite(y) || m === 0) return null;
  return (y - c) / m;
}
