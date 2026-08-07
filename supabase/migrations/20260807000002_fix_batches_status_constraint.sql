-- Fix: second half of the "stuck on Extract Addition / Advance to Downstream"
-- bug — the batches.status CHECK constraint is also out of sync with the app.
--
-- Even after 20260807000001 fixes batch_flasks.current_stage, advancing a
-- flask past its current parent-batch rank runs a second write:
--   UPDATE batches SET current_stage = <toStage>, status = <newBatchStatus>
-- (app/batches/[batchId]/page.js confirmFlaskAdvance, and the parent-stage
-- API app/api/batches/[batchId]/stage/route.js via getBatchStatusForStage()
-- in lib/batches/stagePolicy.js). Both currently compute 'processing' as the
-- default in-progress status, and app/api/batches/[batchId]/start/route.js
-- writes 'in-progress' when a batch is started. Neither value is present in
-- batches_status_check (defined in batch_monitoring_v3_migration.sql), which
-- only allows 'in_progress' (underscore). That write is rejected with a
-- check-constraint violation, so even with the flask-level fix applied the
-- batch's own current_stage/status never advances and the UI stays stuck.
--
-- Widen the constraint to a superset covering every status value the app
-- actually writes today, rather than picking one spelling and chasing it
-- through every call site.

ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_status_check;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_status_check
  CHECK (status IN (
    'scheduled', 'planned', 'in_progress', 'in-progress', 'processing',
    'fermenting', 'qc_hold', 'qc-hold', 'released', 'rejected', 'deviation'
  ));
