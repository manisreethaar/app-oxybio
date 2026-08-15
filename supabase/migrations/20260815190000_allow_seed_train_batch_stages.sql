-- The Seed Train / Production Explosion revamp (58b7ecc) added
-- ProtocolSetupPanel / SeedPhasePanel / ProductionPhasePanel, which write
-- current_stage values 'seed_1', 'seed_2', 'seed_3', 'production' onto
-- batches. batches_current_stage_check was never updated to allow them, so
-- every one of those writes has been rejected by Postgres with a 23514
-- constraint violation since the revamp shipped.
--
-- Only adding values here — the legacy pre-revamp values (media_prep,
-- sterilisation, inoculation, fermentation, harvest) are left in place in
-- case any batch created before the revamp is still sitting at one of
-- those stages; removing them could brick those rows.
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_current_stage_check;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_current_stage_check
  CHECK (current_stage IN (
    'media_prep', 'sterilisation', 'inoculation', 'fermentation', 'harvest', 'straining',
    'qc_hold', 'released', 'rejected',
    'seed_1', 'seed_2', 'seed_3', 'production'
  ));

NOTIFY pgrst, 'reload schema';
