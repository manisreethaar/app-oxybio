-- Fix: batches stuck on Extract Addition, unable to "Advance to Downstream"
--
-- Root cause: batch_flasks.current_stage has a CHECK constraint (added in
-- batch_monitoring_v4_flask_level.sql) that only allows:
--   'inoculation', 'fermentation', 'straining', 'extract_addition',
--   'qc_hold', 'released', 'rejected'
-- It is missing 'harvest' and 'downstream'. The batches-level constraint
-- (batches_current_stage_check, from batch_monitoring_v3_migration.sql)
-- already includes both. The app UI (ExtractAdditionPanel "Advance to
-- Downstream", DownstreamPanel, HarvestPanel) writes current_stage =
-- 'downstream' / 'harvest' directly to batch_flasks, which Postgres
-- rejects with a check-constraint violation (23514) — the flask never
-- advances and the batch appears permanently stuck on Extract Addition.

ALTER TABLE public.batch_flasks
  DROP CONSTRAINT IF EXISTS batch_flasks_current_stage_check;

ALTER TABLE public.batch_flasks
  ADD CONSTRAINT batch_flasks_current_stage_check
  CHECK (current_stage IN (
    'inoculation', 'fermentation', 'harvest', 'straining',
    'extract_addition', 'downstream', 'qc_hold', 'released', 'rejected'
  ));
