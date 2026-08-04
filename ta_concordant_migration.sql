-- TA Lab: Concordant Reading Columns Migration
-- ALOCA++ compliance: store both titration readings and mean result
-- Run this migration in Supabase SQL Editor

ALTER TABLE titration_logs
  ADD COLUMN IF NOT EXISTS concordant_enabled   BOOLEAN        DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS initial_burette_2_ml NUMERIC(8, 2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_burette_2_ml   NUMERIC(8, 2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mean_ta_percent      NUMERIC(10, 6) DEFAULT NULL;

COMMENT ON COLUMN titration_logs.concordant_enabled   IS 'True when a second duplicate reading was entered for concordance verification (ALOCA++)';
COMMENT ON COLUMN titration_logs.initial_burette_2_ml IS 'Initial burette reading for concordant (second) titration, in mL';
COMMENT ON COLUMN titration_logs.final_burette_2_ml   IS 'Final burette reading for concordant (second) titration, in mL';
COMMENT ON COLUMN titration_logs.mean_ta_percent      IS 'Mean TA% of reading 1 and reading 2, committed when concordant (ALOCA++)';
