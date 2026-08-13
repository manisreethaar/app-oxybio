-- Add missing columns for Pellet and RTD streams to batch_flask_extract_addition

ALTER TABLE public.batch_flask_extract_addition
ADD COLUMN IF NOT EXISTS product_stream text,
ADD COLUMN IF NOT EXISTS pellet_wet_wt_g numeric,
ADD COLUMN IF NOT EXISTS pellet_dry_wt_g numeric,
ADD COLUMN IF NOT EXISTS pellet_moisture_pct numeric,
ADD COLUMN IF NOT EXISTS pellet_colour text,
ADD COLUMN IF NOT EXISTS pellet_texture text,
ADD COLUMN IF NOT EXISTS pellet_resusp_buffer text,
ADD COLUMN IF NOT EXISTS pellet_resusp_vol_ml numeric,
ADD COLUMN IF NOT EXISTS pellet_packaging_form text,
ADD COLUMN IF NOT EXISTS rtd_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rtd_batch_vol_ml numeric,
ADD COLUMN IF NOT EXISTS rtd_target_brix numeric,
ADD COLUMN IF NOT EXISTS rtd_target_ph numeric,
ADD COLUMN IF NOT EXISTS rtd_final_ph numeric,
ADD COLUMN IF NOT EXISTS rtd_final_brix numeric,
ADD COLUMN IF NOT EXISTS rtd_ingredients text[];
