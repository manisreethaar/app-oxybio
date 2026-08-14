-- Reconcile batch/flask stage CHECK constraints with the app's canonical
-- stage list (lib/batches/stages.js).
--
-- Context: the "batch stuck at X" bug (20260807000001, 20260810000001) kept
-- recurring because the list of valid stage values was hand-copied into
-- several places that could drift out of sync: two Postgres CHECK
-- constraints, the advance_flask_stage() RPC, and (until this change) a
-- handful of duplicated JS arrays across the frontend. The frontend/API side
-- has now been consolidated to import from lib/batches/stages.js. Postgres
-- can't import a JS module, so this migration is the SQL-side anchor: it
-- re-asserts both CHECK constraints to match lib/batches/stages.js exactly,
-- as a single tracked migration, rather than leaving the live constraint
-- defined only in an untracked root-level script
-- (batch_monitoring_v3_migration.sql) that isn't visible from
-- supabase/migrations/.
--
-- If you change the stage list in lib/batches/stages.js, mirror the change
-- here AND in advance_flask_stage()'s v_stage_ranks array
-- (20260811000001_advance_flask_stage_rpc.sql) in the same commit.

-- Mirrors: BATCH_PARENT_STAGE_ORDER + FLASK_STAGE_ORDER (minus terminal
-- dedupe) in lib/batches/stages.js, i.e. FULL_STAGE_ORDER, plus 'downstream'
-- kept only for legacy rows written before it was retired (8e72945) — the
-- app normalizes 'downstream' to 'harvest' on read and never writes it.
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_current_stage_check;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_current_stage_check
  CHECK (current_stage IN (
    'media_prep', 'sterilisation', 'inoculation', 'fermentation', 'harvest',
    'straining', 'extract_addition', 'qc_hold', 'released', 'rejected',
    'downstream'
  ));

-- Mirrors: FLASK_STAGE_ORDER in lib/batches/stages.js exactly.
ALTER TABLE public.batch_flasks
  DROP CONSTRAINT IF EXISTS batch_flasks_current_stage_check;

ALTER TABLE public.batch_flasks
  ADD CONSTRAINT batch_flasks_current_stage_check
  CHECK (current_stage IN (
    'inoculation', 'fermentation', 'harvest', 'straining',
    'extract_addition', 'qc_hold', 'released', 'rejected'
  ));
