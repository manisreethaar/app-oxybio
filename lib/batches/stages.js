// Single source of truth for batch/flask workflow stage names, order, and labels.
//
// Every place that writes or interprets a `current_stage` value — API routes,
// UI pages/components, and the DB CHECK constraints + advance_flask_stage RPC —
// must agree with this list. Before this module existed, the stage list was
// hand-copied into 9+ separate places (two near-identical page files, two API
// routes, two Postgres CHECK constraints, one RPC, two list-view pages), and
// every stage addition/rename had to be applied to all of them by hand. It
// never was, which is why the same "batch/flask stuck at X" bug kept coming
// back in a new file each time (see 20260807000001, 20260810000001, f457de7,
// f0b2977, 87b85f2). Import from here instead of re-declaring the list.
//
// If you add, rename, or remove a stage, update this file AND the matching
// Postgres CHECK constraints / advance_flask_stage's v_stage_ranks (see the
// migration that keeps them in sync) in the same change.

// Batch-level stages before individual flasks are tracked separately.
export const BATCH_PARENT_STAGE_ORDER = [
  'media_prep',
  'sterilisation',
];

// Per-flask stage order — also the batch's "slowest active flask" rank order
// once flasks are tracked individually (post-sterilisation).
export const FLASK_STAGE_ORDER = [
  'inoculation',
  'fermentation',
  'harvest',
  'straining',
  'extract_addition',
  'qc_hold',
  'released',
  'rejected',
];

// Full chronological order across both the parent-batch and flask-level
// phases, for list/summary views that show one stage per batch.
export const FULL_STAGE_ORDER = [
  ...BATCH_PARENT_STAGE_ORDER,
  ...FLASK_STAGE_ORDER,
];

export const STAGE_LABELS = {
  media_prep: 'Media Prep',
  sterilisation: 'Sterilisation',
  inoculation: 'Inoculation',
  fermentation: 'Fermentation',
  harvest: 'Harvest',
  straining: 'Straining',
  extract_addition: 'Extract Addition',
  qc_hold: 'QC Hold',
  released: 'Released',
  rejected: 'Rejected',
};

export const TERMINAL_STAGES = new Set(['released', 'rejected']);

// Legacy/alias spellings that may still exist on old rows. Kept centralized
// so a fix here reaches every page instead of just the one someone happened
// to be editing.
const LEGACY_STAGE_ALIASES = {
  extraction: 'extract_addition',
  qc: 'qc_hold',
  downstream: 'harvest',
};

export function normalizeStage(stage) {
  if (!stage) return stage || '';
  const s = stage.toString().trim().toLowerCase();
  return LEGACY_STAGE_ALIASES[s] || s;
}

export function visibleWorkflowStage(stage) {
  return normalizeStage(stage) || '';
}

export function stageLabel(stage) {
  const normalized = normalizeStage(stage);
  return STAGE_LABELS[normalized] || normalized;
}
