// Single source of truth for which stages live in which UI module.
// Batches ([/batches]) owns the upstream (fermentation-side) stages;
// Downstream ([/downstream]) owns everything from straining onward.
// Keep this in sync with the DB CHECK constraints on batches.current_stage
// and batch_flasks.current_stage (see supabase/migrations/20260814000003_downstream_revamp.sql).
export const UPSTREAM_STAGE_IDS = ['media_prep', 'sterilisation', 'inoculation', 'fermentation', 'harvest'];
export const DOWNSTREAM_STAGE_IDS = ['straining', 'qc_hold', 'released', 'rejected'];
export const ALL_STAGE_IDS = [...UPSTREAM_STAGE_IDS, ...DOWNSTREAM_STAGE_IDS];

// Legacy/alias stage names that may still exist on old rows.
export function normalizeStage(stage) {
  if (!stage) return stage;
  const s = stage.toString().toLowerCase();
  if (s === 'extraction' || s === 'extract_addition') return 'straining';
  if (s === 'qc') return 'qc_hold';
  if (s === 'downstream') return 'harvest';
  return s;
}

export function visibleWorkflowStage(stage) {
  return normalizeStage(stage) || '';
}

export function isUpstreamStage(stage) {
  const s = normalizeStage(stage);
  return !!s && UPSTREAM_STAGE_IDS.includes(s);
}

export function isDownstreamStage(stage) {
  const s = normalizeStage(stage);
  return !!s && DOWNSTREAM_STAGE_IDS.includes(s);
}
