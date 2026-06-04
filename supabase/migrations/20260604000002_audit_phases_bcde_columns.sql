-- Audit Phases B-G: Process panel field additions
-- A-60, A-61: DO + headspace CO₂ on fermentation readings
ALTER TABLE batch_fermentation_readings
  ADD COLUMN IF NOT EXISTS do_percent numeric,
  ADD COLUMN IF NOT EXISTS co2_pressure_kpa numeric;

-- A-50: Thaw protocol on vial logs
ALTER TABLE cell_bank_vial_logs
  ADD COLUMN IF NOT EXISTS thaw_temp_c numeric,
  ADD COLUMN IF NOT EXISTS thaw_duration_min numeric,
  ADD COLUMN IF NOT EXISTS thaw_media text;

-- A-51: Cold chain on vial logs
ALTER TABLE cell_bank_vial_logs
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS transit_temp_c numeric,
  ADD COLUMN IF NOT EXISTS transit_days integer;

-- A-25, A-58, A-59: Starch gelat + buffer capacity + viscosity at media prep
ALTER TABLE batch_stage_media_prep
  ADD COLUMN IF NOT EXISTS starch_gelat_temp_c    numeric,
  ADD COLUMN IF NOT EXISTS starch_gelat_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS buffer_capacity_mmol_l numeric,
  ADD COLUMN IF NOT EXISTS viscosity_cP            numeric;

-- A-26, A-27, A-49: Inoculum viability + post-inocu pH + back-slop prep
ALTER TABLE batch_flask_inoculations
  ADD COLUMN IF NOT EXISTS inoculum_viability_pct   numeric,
  ADD COLUMN IF NOT EXISTS inoculum_viability_method text,
  ADD COLUMN IF NOT EXISTS post_inocu_ph_15min       numeric,
  ADD COLUMN IF NOT EXISTS back_slop_source_batch_id text,
  ADD COLUMN IF NOT EXISTS back_slop_final_ph        numeric,
  ADD COLUMN IF NOT EXISTS back_slop_final_ta_pct    numeric;

-- A-28: Autoclave load configuration
ALTER TABLE batch_stage_sterilisation
  ADD COLUMN IF NOT EXISTS load_description       text,
  ADD COLUMN IF NOT EXISTS load_total_volume_ml   numeric,
  ADD COLUMN IF NOT EXISTS flask_sizes            text[];

-- A-29, A-30, A-53: Cell wash + post-centrifuge viability + hold time
ALTER TABLE batch_flask_straining
  ADD COLUMN IF NOT EXISTS hold_time_before_centrifuge_min numeric,
  ADD COLUMN IF NOT EXISTS wash_steps          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wash_buffer         text,
  ADD COLUMN IF NOT EXISTS wash_volume_ml      numeric,
  ADD COLUMN IF NOT EXISTS post_centrifuge_viability_pct numeric,
  ADD COLUMN IF NOT EXISTS viability_method    text;

-- A-52: Cooling rate checkpoints in harvest
ALTER TABLE batch_stage_harvest
  ADD COLUMN IF NOT EXISTS cooling_rate_c_per_min numeric,
  ADD COLUMN IF NOT EXISTS temp_at_30min          numeric,
  ADD COLUMN IF NOT EXISTS temp_at_60min          numeric;
