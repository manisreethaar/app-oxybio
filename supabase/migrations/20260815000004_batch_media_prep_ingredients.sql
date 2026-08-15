-- MediaPrepPanel's BOM lot-selection UI already captures a lot + quantity
-- for every formulation ingredient (bomUsage state), but the GMP record
-- (batch_stage_media_prep) only ever persisted two of them — ragi and
-- kavuni, via hardcoded ragi_lot_id/kavuni_lot_id columns. Any other
-- ingredient in the formulation lost lot traceability in the GMP record
-- (still deducted from inventory, but with no batch-linked audit trail),
-- and RejectionPanel's "Implicated Lot" dropdown could only ever
-- implicate ragi or kavuni for the same reason. This table captures the
-- full BOM usage generically so both gaps are fixed.
CREATE TABLE IF NOT EXISTS public.batch_media_prep_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  stock_id UUID,
  item_id UUID,
  item_name TEXT,
  used_qty NUMERIC,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_media_prep_ingredients_batch_id ON public.batch_media_prep_ingredients (batch_id);

ALTER TABLE public.batch_media_prep_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY bmpi_auth_all ON public.batch_media_prep_ingredients
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
