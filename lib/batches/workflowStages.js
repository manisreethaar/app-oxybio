// Single source of truth for which stages live in which UI module.
// Batches ([/batches]) owns the upstream (fermentation-side) stages;
// Downstream ([/downstream]) owns everything from straining onward.
// Keep this in sync with the DB CHECK constraints on batches.current_stage
// and batch_flasks.current_stage (see supabase/migrations/20260814000003_downstream_revamp.sql).
export const SEED_TRAIN_STAGE_IDS = ['protocol', 'seed_1', 'seed_2', 'seed_3', 'production'];
export const LEGACY_UPSTREAM_STAGE_IDS = ['media_prep', 'sterilisation', 'inoculation', 'fermentation', 'harvest'];
export const UPSTREAM_STAGE_IDS = [...SEED_TRAIN_STAGE_IDS, ...LEGACY_UPSTREAM_STAGE_IDS];
export const DOWNSTREAM_STAGE_IDS = ['straining', 'qc_hold', 'released', 'rejected'];
export const ALL_STAGE_IDS = [...UPSTREAM_STAGE_IDS, ...DOWNSTREAM_STAGE_IDS];

export const BATCH_TERMINAL_STAGES = new Set(['released', 'rejected']);

// The one legal-transition map. media_prep/sterilisation are batch-level
// (no flask exists yet); everything else is flask-level. qc_hold is the
// only stage with two legal targets — release or reject is an operator
// decision, not a deterministic "next" stage. 'rejected' is also a legal
// target from every active flask stage (inoculation onward), since the
// Abort/Reject Trial action can be used at any point, not just at QC Hold.
export const STAGE_TRANSITIONS = {
  media_prep: ['sterilisation'],
  sterilisation: ['inoculation'],
  inoculation: ['fermentation', 'rejected'],
  fermentation: ['harvest', 'rejected'],
  harvest: ['straining', 'rejected'],
  straining: ['qc_hold', 'rejected'],
  qc_hold: ['released', 'rejected'],
  // Seed Train batch-level stages. Keep in sync with the
  // advance_seed_train_stage() RPC (supabase/migrations/
  // 20260815190100_advance_seed_train_stage_rpc.sql).
  seed_1: ['seed_2', 'seed_3', 'production'],
  seed_2: ['seed_3', 'production'],
  seed_3: ['production'],
};

// Legacy/alias stage names that may still exist on old rows.
export function normalizeStage(stage) {
  if (!stage) return stage;
  const s = stage.toString().trim().toLowerCase();
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

// Rank of a stage within the full pipeline order — used to find the
// "slowest" (least-progressed) active flask for a batch-level rollup.
// Terminal (rejected) flasks should be excluded by the caller before
// ranking, same as today.
export function stageRank(stage) {
  const s = normalizeStage(stage);
  const idx = ALL_STAGE_IDS.indexOf(s);
  return idx === -1 ? ALL_STAGE_IDS.length : idx;
}

export function getLegalNextStages(currentStage) {
  const s = normalizeStage(currentStage);
  return STAGE_TRANSITIONS[s] || [];
}

export function isLegalTransition(fromStage, toStage) {
  const to = normalizeStage(toStage);
  return !!to && getLegalNextStages(fromStage).includes(to);
}

// The two batch-level (pre-flask) hops — used by the /stage route, which
// only ever handles media_prep->sterilisation and sterilisation->inoculation.
export const BATCH_PARENT_TRANSITIONS = new Map([
  ['media_prep', 'sterilisation'],
  ['sterilisation', 'inoculation'],
]);
