-- Phase 1: Safety, CCP & Sterilisation Validation gaps
-- G-01: BI tracking on sterilisation
-- G-03: CAPA linkage on sterilisation fail
-- G-04: CAPA linkage on inoculation contamination
-- G-06: Allergen declaration on extract addition

ALTER TABLE batch_stage_sterilisation
  ADD COLUMN IF NOT EXISTS bi_used            boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS bi_result          text      CHECK (bi_result IN ('Pass','Fail','Not Used')),
  ADD COLUMN IF NOT EXISTS bi_incubation_date date,
  ADD COLUMN IF NOT EXISTS capa_deviation_id  uuid      REFERENCES deviations(id) ON DELETE SET NULL;

ALTER TABLE batch_flask_inoculations
  ADD COLUMN IF NOT EXISTS capa_deviation_id  uuid      REFERENCES deviations(id) ON DELETE SET NULL;

ALTER TABLE batch_flask_extract_addition
  ADD COLUMN IF NOT EXISTS allergen_declaration text[]   DEFAULT '{}';
