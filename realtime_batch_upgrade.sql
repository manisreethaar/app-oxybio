-- Enable Supabase Realtime for Tier-1 Batch Synchronization

-- Supabase realtime uses the 'supabase_realtime' publication.
-- We must explicitly add the tables we want to broadcast changes for.

-- 1. Enable for batches (to catch stage transfers instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE public.batches;

-- 2. Enable for seed trains (to catch media setup, sterilization, formulation changes instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE public.batch_seed_trains;

-- 3. Enable for flasks (to catch new flasks instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE public.batch_flasks;

-- 4. Enable for readings (to catch ALOCA++ readings instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE public.batch_fermentation_readings;

-- Notify postgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
