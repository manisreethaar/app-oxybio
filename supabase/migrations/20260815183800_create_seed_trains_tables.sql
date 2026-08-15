CREATE TABLE IF NOT EXISTS public.batch_seed_trains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  stage_type TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  formulation_id UUID REFERENCES public.formulations(id),
  media_volume_ml NUMERIC,
  media_recipe_notes TEXT,
  is_sterilised BOOLEAN DEFAULT false,
  sterilised_at TIMESTAMPTZ,
  inoculum_source_type TEXT,
  cell_bank_vial_id UUID REFERENCES public.cell_bank_vials(id),
  inoculum_source_details TEXT,
  inoculated_at TIMESTAMPTZ,
  inoculated_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.standard_curves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slope NUMERIC NOT NULL,
  y_intercept NUMERIC NOT NULL,
  r_squared NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.employees(id)
);

CREATE TABLE IF NOT EXISTS public.batch_fermentation_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  seed_train_id UUID REFERENCES public.batch_seed_trains(id) ON DELETE CASCADE,
  flask_id UUID REFERENCES public.batch_flasks(id) ON DELETE CASCADE,
  ph NUMERIC,
  optical_density NUMERIC,
  is_blank BOOLEAN DEFAULT false,
  anthrone_od NUMERIC,
  anthrone_conc NUMERIC,
  standard_curve_id UUID REFERENCES public.standard_curves(id),
  gram_staining TEXT,
  microscopic_test TEXT,
  dilution_factor NUMERIC,
  logged_at TIMESTAMPTZ DEFAULT now(),
  logged_by UUID REFERENCES public.employees(id)
);

ALTER TABLE public.batch_seed_trains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_curves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_fermentation_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY seed_train_auth ON public.batch_seed_trains FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY standard_curves_auth ON public.standard_curves FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY ferm_readings_auth ON public.batch_fermentation_readings FOR ALL USING (auth.role() = 'authenticated');
