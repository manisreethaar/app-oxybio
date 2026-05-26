-- Store the actual fermentation stop timestamp with each per-flask endpoint.
-- total_hours remains for reporting, but end_time gives the audit trail a
-- source timestamp instead of relying on browser-local draft state.
ALTER TABLE public.batch_flask_endpoints
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS edit_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_batch_flask_endpoints_end_time
  ON public.batch_flask_endpoints(end_time);
