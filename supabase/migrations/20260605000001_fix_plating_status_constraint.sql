-- Expand plating_status check constraint to include 'pending' (Log Later) and 'na' (No plating).
-- FermentationPanel sends 'pending' when the user selects "Log Later" and 'na' for "No plating".
-- The previous constraint only allowed not_done / done_incubating / completed,
-- causing a constraint violation on every reading saved with those two intent choices.
ALTER TABLE public.batch_fermentation_readings
  DROP CONSTRAINT IF EXISTS batch_fermentation_readings_plating_status_check;

ALTER TABLE public.batch_fermentation_readings
  ADD CONSTRAINT batch_fermentation_readings_plating_status_check
  CHECK (plating_status = ANY (ARRAY[
    'not_done'::text,
    'pending'::text,
    'na'::text,
    'done_incubating'::text,
    'completed'::text
  ]));
