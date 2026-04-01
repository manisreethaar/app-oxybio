-- ============================================================
-- OxyOS Performance Fix — has_alarm column + trigger
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- 1. Add has_alarm column to batches table
ALTER TABLE batches ADD COLUMN IF NOT EXISTS has_alarm boolean DEFAULT false;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS bmr_url text;

-- 2. Create trigger function that flips has_alarm on batches
--    whenever a fermentation reading with an alarm is inserted/updated
CREATE OR REPLACE FUNCTION fn_sync_batch_alarm()
RETURNS TRIGGER AS $$
BEGIN
  -- When an alarm reading is inserted, flag the batch
  IF (NEW.is_ph_alarm = true OR NEW.is_temp_alarm = true) THEN
    UPDATE batches SET has_alarm = true WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to batch_fermentation_readings
DROP TRIGGER IF EXISTS trg_sync_batch_alarm ON batch_fermentation_readings;
CREATE TRIGGER trg_sync_batch_alarm
  AFTER INSERT OR UPDATE OF is_ph_alarm, is_temp_alarm
  ON batch_fermentation_readings
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_batch_alarm();

-- 4. Backfill has_alarm for existing batches
UPDATE batches b
SET has_alarm = true
WHERE EXISTS (
  SELECT 1 FROM batch_fermentation_readings r
  WHERE r.batch_id = b.id
    AND (r.is_ph_alarm = true OR r.is_temp_alarm = true)
);

SELECT 'has_alarm trigger installed and backfilled.' AS status;
