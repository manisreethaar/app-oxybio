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
  
  // Need to compute derived total since formData might only have raw inputs
  const filterWeight = parseFloat(formData.filtration_solid_wt_g) || 0;
  const centrifugeWeight = parseFloat(formData.centrifuge_pellet_wt_g) || 0;
  const total = filterWeight + centrifugeWeight;

  if (total <= 0) warnings.push('Total yield weight not recorded');
  
  const hasAnyProcessData = [
    'filtration_solid_wt_g', 'centrifuge_post_vol_ml', 'centrifuge_pellet_wt_g', 'dry_pellet_wt_g',
  ].some((key) => formData[key]);
  
  if (!hasAnyProcessData) warnings.push('No downstream process weights recorded (filtration/centrifuge/drying)');
  
  return warnings;
}

export function getQcReleaseWarnings({ anyFail, failCount }) {
  if (!anyFail) return [];
  return [`${failCount} QC test${failCount === 1 ? '' : 's'} failed`];
}

export function getInoculationWarnings(formData) {
  const warnings = [];
  if (!formData.tZero) warnings.push('T=0 inoculation time not set (CCP trial anchor)');
  if (!formData.plannedHr) warnings.push('Planned fermentation time not recorded');
  return warnings;
}

export function getFermentationWarnings(endpoint) {
  const warnings = [];
  if (!endpoint) return ['No endpoint declared'];
  if (!endpoint.gram_stain || endpoint.gram_stain === 'Not done') warnings.push('Gram stain not recorded');
  if (endpoint.titratable_acidity_pct == null) warnings.push('Titratable acidity (TA%) not recorded');
  return warnings;
}
