-- ============================================================
-- OxyOS Batch Fermentation — Missing Columns Migration (Safe)
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- 1. batch_fermentation_readings — extended measurement columns
-- Added without FK constraints to avoid type mismatch errors

ALTER TABLE batch_fermentation_readings
  ADD COLUMN IF NOT EXISTS titratable_acidity_pct  numeric,
  ADD COLUMN IF NOT EXISTS do_percent               numeric,
  ADD COLUMN IF NOT EXISTS co2_pressure_kpa         numeric,
  ADD COLUMN IF NOT EXISTS co2_observed             text,
  ADD COLUMN IF NOT EXISTS ethanol_pct              numeric,
  ADD COLUMN IF NOT EXISTS incubator_equipment_id   uuid,
  ADD COLUMN IF NOT EXISTS is_ph_alarm              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_temp_alarm            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervised_by            uuid,
  ADD COLUMN IF NOT EXISTS edited_at                timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by                uuid,
  ADD COLUMN IF NOT EXISTS edit_reason              text,
  ADD COLUMN IF NOT EXISTS is_retrospective         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS retro_reason             text,
  ADD COLUMN IF NOT EXISTS plating_config           jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sample_incubation_id     uuid,
  ADD COLUMN IF NOT EXISTS plating_status           text,
  ADD COLUMN IF NOT EXISTS plating_result           text,
  ADD COLUMN IF NOT EXISTS plating_done             boolean DEFAULT false;

-- 2. batch_flask_endpoints — extended endpoint columns
ALTER TABLE batch_flask_endpoints
  ADD COLUMN IF NOT EXISTS gram_stain             text,
  ADD COLUMN IF NOT EXISTS gram_stain_image_url   text,
  ADD COLUMN IF NOT EXISTS titratable_acidity_pct numeric,
  ADD COLUMN IF NOT EXISTS colour_desc            text,
  ADD COLUMN IF NOT EXISTS texture                text,
  ADD COLUMN IF NOT EXISTS sensory_overall        text,
  ADD COLUMN IF NOT EXISTS aroma                  text,
  ADD COLUMN IF NOT EXISTS declared_by            uuid,
  ADD COLUMN IF NOT EXISTS notes                  text;

-- 3. batch_fermentation_feeds — feed log table (create if missing)
CREATE TABLE IF NOT EXISTS batch_fermentation_feeds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid,
  flask_id    uuid,
  flask_label text,
  feed_type   text NOT NULL,
  volume_ml   numeric,
  ph_before   numeric,
  ph_after    numeric,
  reason      text,
  logged_by   uuid,
  logged_at   timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

-- RLS for batch_fermentation_feeds
ALTER TABLE batch_fermentation_feeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read feeds" ON batch_fermentation_feeds;
CREATE POLICY "Authenticated users can read feeds" ON batch_fermentation_feeds
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can insert feeds" ON batch_fermentation_feeds;
CREATE POLICY "Authenticated users can insert feeds" ON batch_fermentation_feeds
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 4. Alarm auto-set trigger (sets is_ph_alarm / is_temp_alarm on insert)
CREATE OR REPLACE FUNCTION fn_set_fermentation_alarms()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_ph_alarm   := (NEW.ph IS NOT NULL AND (NEW.ph < 3.8 OR NEW.ph > 5.5));
  NEW.is_temp_alarm := (NEW.incubator_temp_c IS NOT NULL AND (NEW.incubator_temp_c < 36 OR NEW.incubator_temp_c > 38));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fermentation_alarms ON batch_fermentation_readings;
CREATE TRIGGER trg_fermentation_alarms
  BEFORE INSERT OR UPDATE ON batch_fermentation_readings
  FOR EACH ROW EXECUTE FUNCTION fn_set_fermentation_alarms();

-- 5. Batch alarm sync trigger
CREATE OR REPLACE FUNCTION fn_sync_batch_alarm()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.is_ph_alarm = true OR NEW.is_temp_alarm = true) THEN
    UPDATE batches SET has_alarm = true WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_batch_alarm ON batch_fermentation_readings;
CREATE TRIGGER trg_sync_batch_alarm
  AFTER INSERT OR UPDATE OF is_ph_alarm, is_temp_alarm
  ON batch_fermentation_readings
  FOR EACH ROW EXECUTE FUNCTION fn_sync_batch_alarm();

-- 6. batches table — add has_alarm if missing
ALTER TABLE batches ADD COLUMN IF NOT EXISTS has_alarm boolean DEFAULT false;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS bmr_url text;

SELECT 'Fermentation schema migration complete.' AS status;
