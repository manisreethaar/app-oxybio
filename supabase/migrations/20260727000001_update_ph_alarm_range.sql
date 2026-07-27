-- Migration to update pH alarm range to < 3 or > 6

-- 1d. check_ferm_ph_deviation (validates pH is within acceptable range)
CREATE OR REPLACE FUNCTION public.check_ferm_ph_deviation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.ph IS NOT NULL AND (NEW.ph < 3 OR NEW.ph > 6) THEN
    NEW.is_ph_alarm := true;
  ELSE
    NEW.is_ph_alarm := false;
  END IF;
  RETURN NEW;
END;
$$;

-- 1e. flag_fermentation_alarms (sets alarm flags on fermentation readings)
CREATE OR REPLACE FUNCTION public.flag_fermentation_alarms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- pH alarm: outside 3–6
  IF NEW.ph IS NOT NULL THEN
    NEW.is_ph_alarm := (NEW.ph < 3 OR NEW.ph > 6);
  END IF;
  -- Temperature alarm: outside 36–38°C
  IF NEW.incubator_temp_c IS NOT NULL THEN
    NEW.is_temp_alarm := (NEW.incubator_temp_c < 36 OR NEW.incubator_temp_c > 38);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Alarm auto-set trigger from fermentation_columns_migration.sql
CREATE OR REPLACE FUNCTION public.fn_set_fermentation_alarms()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_ph_alarm   := (NEW.ph IS NOT NULL AND (NEW.ph < 3 OR NEW.ph > 6));
  NEW.is_temp_alarm := (NEW.incubator_temp_c IS NOT NULL AND (NEW.incubator_temp_c < 36 OR NEW.incubator_temp_c > 38));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
