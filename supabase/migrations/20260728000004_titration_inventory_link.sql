ALTER TABLE public.titration_logs 
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES public.inventory_items(id);

CREATE INDEX IF NOT EXISTS idx_titration_logs_inventory_item ON public.titration_logs(inventory_item_id);

NOTIFY pgrst, 'reload schema';
