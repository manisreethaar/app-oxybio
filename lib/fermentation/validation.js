export const PH_MIN = 0;
export const PH_MAX = 14;
export const ENDPOINT_PH_LOW = 4.2;
export const ENDPOINT_PH_HIGH = 4.5;

export function parseFiniteNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateRange(value, label, min, max, required = false) {
  const parsed = parseFiniteNumber(value);
  if (parsed == null) {
    return required ? { value: null, error: `${label} is required.` } : { value: null, error: null };
  }
  if (parsed < min || parsed > max) {
    return { value: parsed, error: `${label} must be between ${min} and ${max}.` };
  }
  return { value: parsed, error: null };
}

export function calculateElapsedHours(tZero, endTime) {
  if (!tZero || !endTime) return null;
  const start = new Date(tZero).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Number.parseFloat(((end - start) / 3600000).toFixed(2));
}

export function validateReadingPayload(data = {}) {
  const errors = [];
  const ph = validateRange(data.ph, 'pH', PH_MIN, PH_MAX, true);
  if (ph.error) errors.push(ph.error);

  const temp = validateRange(data.incubator_temp_c, 'Incubator temperature', 0, 80, false);
  if (temp.error) errors.push(temp.error);

  if (data.is_retrospective && !String(data.retro_reason || '').trim()) {
    errors.push('Retrospective readings require a reason.');
  }

  if (data.logged_at && Number.isNaN(new Date(data.logged_at).getTime())) {
    errors.push('Reading timestamp is invalid.');
  }

  return {
    ok: errors.length === 0,
    errors,
    values: {
      ph: ph.value,
      incubator_temp_c: temp.value,
    },
  };
}

export function validateEndpointPayload(data = {}) {
  const errors = [];
  const finalPh = validateRange(data.final_ph, 'Final pH', PH_MIN, PH_MAX, true);
  if (finalPh.error) errors.push(finalPh.error);

  const totalHours = validateRange(data.total_hours, 'Total fermentation hours', 0, 10000, true);
  if (totalHours.error) errors.push(totalHours.error);

  if (data.end_time && Number.isNaN(new Date(data.end_time).getTime())) {
    errors.push('Fermentation end time is invalid.');
  }

  if (!data.end_time) {
    errors.push('Fermentation end time is required for endpoint declaration.');
  }

  return {
    ok: errors.length === 0,
    errors,
    values: {
      final_ph: finalPh.value,
      total_hours: totalHours.value,
      is_endpoint_ph_out_of_range: finalPh.value != null && (finalPh.value < ENDPOINT_PH_LOW || finalPh.value > ENDPOINT_PH_HIGH),
    },
  };
}
