-- Fix: batches stuck on Extract Addition / Harvest stage transition
--
-- Root cause: batch_flasks.current_stage has a CHECK constraint that was
-- missing 'harvest'. The HarvestPanel writes current_stage = 'harvest'
-- directly to batch_flasks, which Postgres rejects with a check-constraint
-- violation (23514) — the flask never advances.
-- Note: 'downstream' was a legacy alias that has since been removed.

ALTER TABLE public.batch_flasks
  DROP CONSTRAINT IF EXISTS batch_flasks_current_stage_check;

ALTER TABLE public.batch_flasks
  ADD CONSTRAINT batch_flasks_current_stage_check
  CHECK (current_stage IN (
    'inoculation', 'fermentation', 'harvest', 'straining',
    'extract_addition', 'qc_hold', 'released', 'rejected'
  ));
