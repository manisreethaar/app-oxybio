// Soft data-integrity checks for stage advances that have no hard server-side
// validation. These return human-readable warnings (not errors) — the UI
// shows them and requires the operator to type an override reason before
// advancing anyway. The reason is logged to stage_transitions via
// advance_flask_stage()'s p_override_reason (see supabase/migrations/
// 20260814000004_flask_stage_override_reason.sql).

export function getHarvestWarnings(formData) {
  const warnings = [];
  if (!formData.wetCellWeight) warnings.push('Wet cell weight not recorded');
  if (!formData.volumeRecovered) warnings.push('Volume recovered not recorded');
  if (!formData.finalCultureVol) warnings.push('Final culture volume not recorded');
  if (!formData.cellViabilityPct) warnings.push('Cell viability not recorded');
  return warnings;
}

export function getStrainingWarnings(formData) {
  const warnings = [];
  if (!formData.total_weight_obtained_g) warnings.push('Total yield weight not recorded');
  const hasAnyProcessData = [
    'straining_wt_after_g', 'centrifuge_broth_obtained_ml', 'centrifuge_pellet_wet_wt_g', 'dry_pellet_wt_g',
  ].some((key) => formData[key]);
  if (!hasAnyProcessData) warnings.push('No downstream process weights recorded (straining/centrifuge/drying)');
  return warnings;
}

export function getQcReleaseWarnings({ anyFail, failCount }) {
  if (!anyFail) return [];
  return [`${failCount} QC test${failCount === 1 ? '' : 's'} failed`];
}
