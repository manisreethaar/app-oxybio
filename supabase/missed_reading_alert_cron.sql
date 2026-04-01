-- ============================================================
-- OxyOS — Batch Monitoring: Missed Reading Alert
-- Deploy as a Supabase Scheduled Function (pg_cron)
-- Trigger every 30 minutes via: Dashboard → Database → Cron
-- ============================================================

-- Step 1: Enable pg_cron (run once in Supabase SQL Editor)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Create the function
CREATE OR REPLACE FUNCTION notify_missed_fermentation_readings()
RETURNS void AS $$
DECLARE
  v_batch        RECORD;
  v_last_reading TIMESTAMPTZ;
  v_elapsed_hrs  NUMERIC;
  v_t_zero       TIMESTAMPTZ;
  v_msg          TEXT;
  v_ceo          RECORD;
  v_rf           RECORD;
BEGIN
  -- Find all batches currently in 'fermentation' status
  FOR v_batch IN
    SELECT b.id, b.batch_id, b.assigned_team
    FROM batches b
    WHERE b.current_stage = 'fermentation'
      AND b.status = 'fermenting'
  LOOP
    -- Check last fermentation reading
    SELECT MAX(logged_at)
      INTO v_last_reading
      FROM batch_fermentation_readings
     WHERE batch_id = v_batch.id;

    -- Get T=0 for this batch
    SELECT t_zero_time
      INTO v_t_zero
      FROM batch_stage_inoculation
     WHERE batch_id = v_batch.id;

    v_elapsed_hrs := EXTRACT(EPOCH FROM (now() - COALESCE(v_last_reading, v_t_zero))) / 3600;

    -- ── Alert 1: No reading in 2.5 hours ─────────────────────
    IF v_elapsed_hrs >= 2.5 THEN
      v_msg := format(
        'No fermentation reading logged for %s in %.1f hours. Log pH + temp now per SOP-004.',
        v_batch.batch_id, v_elapsed_hrs
      );

      -- Notify CEO/admin
      FOR v_ceo IN
        SELECT id FROM employees WHERE role IN ('ceo','admin') AND is_active = true
      LOOP
        INSERT INTO notifications (employee_id, title, message, type, link)
        VALUES (
          v_ceo.id,
          '⏰ Missed Reading: ' || v_batch.batch_id,
          v_msg,
          'alert',
          '/batches/' || v_batch.id
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

      -- Notify assigned Research Fellows
      FOR v_rf IN
        SELECT id FROM employees
        WHERE role = 'research_fellow'
          AND is_active = true
          AND id = ANY(v_batch.assigned_team)
      LOOP
        INSERT INTO notifications (employee_id, title, message, type, link)
        VALUES (
          v_rf.id,
          '⏰ Missed Reading: ' || v_batch.batch_id,
          v_msg,
          'alert',
          '/batches/' || v_batch.id
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    -- ── Alert 2: Fermentation exceeded 20 hours ───────────────
    IF v_t_zero IS NOT NULL THEN
      v_elapsed_hrs := EXTRACT(EPOCH FROM (now() - v_t_zero)) / 3600;

      IF v_elapsed_hrs >= 20 THEN
        -- Check if endpoint already declared — if so, skip
        IF NOT EXISTS (
          SELECT 1 FROM batch_fermentation_endpoint WHERE batch_id = v_batch.id
        ) THEN
          v_msg := format(
            'Batch %s has fermented for %.1f hours without an endpoint declaration. Evaluate for rejection per SOP-004.',
            v_batch.batch_id, v_elapsed_hrs
          );

          FOR v_ceo IN
            SELECT id FROM employees WHERE role IN ('ceo','admin') AND is_active = true
          LOOP
            INSERT INTO notifications (employee_id, title, message, type, link)
            VALUES (
              v_ceo.id,
              '🚨 Over 20hr: ' || v_batch.batch_id,
              v_msg,
              'alert',
              '/batches/' || v_batch.id
            )
            ON CONFLICT DO NOTHING;
          END LOOP;
        END IF;
      END IF;
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Step 3: Schedule to run every 30 minutes
-- Run this in Supabase SQL Editor after Step 1 & 2:
--
-- SELECT cron.schedule(
--   'missed-fermentation-reading-alert',   -- job name
--   '*/30 * * * *',                        -- every 30 minutes
--   'SELECT notify_missed_fermentation_readings()'
-- );
--
-- To verify it's scheduled:
-- SELECT jobid, jobname, schedule, active FROM cron.job;
--
-- To unschedule:
-- SELECT cron.unschedule('missed-fermentation-reading-alert');
