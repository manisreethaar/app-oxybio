ALTER TABLE public.deviations ADD COLUMN IF NOT EXISTS fmea_severity INTEGER DEFAULT 1;
ALTER TABLE public.deviations ADD COLUMN IF NOT EXISTS fmea_occurrence INTEGER DEFAULT 1;
ALTER TABLE public.deviations ADD COLUMN IF NOT EXISTS fmea_detection INTEGER DEFAULT 1;
ALTER TABLE public.deviations ADD COLUMN IF NOT EXISTS fmea_rpn INTEGER GENERATED ALWAYS AS (fmea_severity * fmea_occurrence * fmea_detection) STORED;
