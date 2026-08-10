-- Fix: batches whose current_stage is out of sync with their flasks
-- due to the batches.status CHECK constraint rejecting 'qc-hold'/'processing'.
--
-- For each active batch, re-derive current_stage from the slowest active flask.
-- This is a one-time recovery migration for batches that got stuck.
--
-- Safe to run multiple times (idempotent).

DO $$
DECLARE
  batch_rec RECORD;
  slowest_stage TEXT;
  new_status TEXT;
BEGIN
  FOR batch_rec IN
    SELECT b.id
    FROM   public.batches b
    WHERE  b.status NOT IN ('released', 'rejected')
      AND  b.current_stage NOT IN ('media_prep', 'sterilisation')  -- pre-inoculation stages are batch-level only
  LOOP
    -- Find slowest active flask stage for this batch
    SELECT
      CASE
        WHEN MIN(CASE f.current_stage
          WHEN 'inoculation'     THEN 0
          WHEN 'fermentation'    THEN 1
          WHEN 'harvest'         THEN 2
          WHEN 'straining'       THEN 3
          WHEN 'extract_addition'THEN 4
          WHEN 'qc_hold'         THEN 5
          WHEN 'released'        THEN 6
          ELSE -1
        END) = 0  THEN 'inoculation'
        WHEN MIN(CASE f.current_stage
          WHEN 'inoculation'     THEN 0
          WHEN 'fermentation'    THEN 1
          WHEN 'harvest'         THEN 2
          WHEN 'straining'       THEN 3
          WHEN 'extract_addition'THEN 4
          WHEN 'qc_hold'         THEN 5
          WHEN 'released'        THEN 6
          ELSE -1
        END) = 1  THEN 'fermentation'
        WHEN MIN(CASE f.current_stage
          WHEN 'inoculation'     THEN 0
          WHEN 'fermentation'    THEN 1
          WHEN 'harvest'         THEN 2
          WHEN 'straining'       THEN 3
          WHEN 'extract_addition'THEN 4
          WHEN 'qc_hold'         THEN 5
          WHEN 'released'        THEN 6
          ELSE -1
        END) = 2  THEN 'harvest'
        WHEN MIN(CASE f.current_stage
          WHEN 'inoculation'     THEN 0
          WHEN 'fermentation'    THEN 1
          WHEN 'harvest'         THEN 2
          WHEN 'straining'       THEN 3
          WHEN 'extract_addition'THEN 4
          WHEN 'qc_hold'         THEN 5
          WHEN 'released'        THEN 6
          ELSE -1
        END) = 3  THEN 'straining'
        WHEN MIN(CASE f.current_stage
          WHEN 'inoculation'     THEN 0
          WHEN 'fermentation'    THEN 1
          WHEN 'harvest'         THEN 2
          WHEN 'straining'       THEN 3
          WHEN 'extract_addition'THEN 4
          WHEN 'qc_hold'         THEN 5
          WHEN 'released'        THEN 6
          ELSE -1
        END) = 4  THEN 'extract_addition'
        WHEN MIN(CASE f.current_stage
          WHEN 'inoculation'     THEN 0
          WHEN 'fermentation'    THEN 1
          WHEN 'harvest'         THEN 2
          WHEN 'straining'       THEN 3
          WHEN 'extract_addition'THEN 4
          WHEN 'qc_hold'         THEN 5
          WHEN 'released'        THEN 6
          ELSE -1
        END) = 5  THEN 'qc_hold'
        ELSE 'released'
      END
    INTO slowest_stage
    FROM public.batch_flasks f
    WHERE f.batch_id = batch_rec.id
      AND f.status   != 'rejected';

    -- Skip if no active flasks found
    IF slowest_stage IS NULL THEN
      CONTINUE;
    END IF;

    -- Map to batch status
    new_status := CASE slowest_stage
      WHEN 'fermentation'   THEN 'fermenting'
      WHEN 'qc_hold'        THEN 'qc-hold'
      WHEN 'released'       THEN 'released'
      ELSE 'processing'
    END;

    -- Only update if out of sync
    UPDATE public.batches
    SET    current_stage = slowest_stage,
           status        = new_status
    WHERE  id            = batch_rec.id
      AND  (current_stage != slowest_stage OR status != new_status);

  END LOOP;
END;
$$;
