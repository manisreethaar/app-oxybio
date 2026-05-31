-- Archive-first deletion for batches and activity logs.
-- Normal delete actions set archived_at/archived_by. Permanent delete is allowed
-- only after a record is already archived.

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.employees(id);

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.employees(id);

CREATE INDEX IF NOT EXISTS idx_batches_archived_at
  ON public.batches(archived_at);

CREATE INDEX IF NOT EXISTS idx_activity_log_archived_at
  ON public.activity_log(archived_at);
