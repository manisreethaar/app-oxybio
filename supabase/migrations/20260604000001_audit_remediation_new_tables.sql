-- Audit Remediation: All missing tables and columns from biotech process audit

-- Environmental Monitoring Programme (EMP)
CREATE TABLE IF NOT EXISTS emp_sampling_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text NOT NULL,
  location_code text,
  sampling_method text CHECK (sampling_method IN ('Settle Plate','Contact Plate','Active Air','Personnel','Surface Swab')),
  frequency text DEFAULT 'Weekly',
  alert_limit_cfu numeric,
  action_limit_cfu numeric,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emp_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES emp_sampling_locations(id) ON DELETE CASCADE,
  sampled_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  incubation_temp_c numeric,
  incubation_hours integer DEFAULT 48,
  colony_count integer,
  organism_identified text,
  result text CHECK (result IN ('Pass','Alert','Action','Pending')) DEFAULT 'Pending',
  notes text,
  capa_deviation_id uuid REFERENCES deviations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Raw material incoming QC
ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS qc_status text DEFAULT 'Quarantine' CHECK (qc_status IN ('Quarantine','Released','Rejected')),
  ADD COLUMN IF NOT EXISTS qc_released_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qc_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS qc_notes text,
  ADD COLUMN IF NOT EXISTS sampling_method text,
  ADD COLUMN IF NOT EXISTS identity_test_result text;

ALTER TABLE batch_stage_harvest ADD COLUMN IF NOT EXISTS flask_id uuid REFERENCES batch_flasks(id) ON DELETE CASCADE;
ALTER TABLE batch_stage_downstream ADD COLUMN IF NOT EXISTS flask_id uuid REFERENCES batch_flasks(id) ON DELETE CASCADE;

ALTER TABLE batch_fermentation_feeds
  ADD COLUMN IF NOT EXISTS flask_id uuid REFERENCES batch_flasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ph_before numeric,
  ADD COLUMN IF NOT EXISTS ph_after numeric,
  ADD COLUMN IF NOT EXISTS flask_label text;

ALTER TABLE shift_handovers
  ADD COLUMN IF NOT EXISTS batch_summaries jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS active_alarms jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS pending_readings jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS shift_date date DEFAULT CURRENT_DATE;

ALTER TABLE batch_flask_release_record
  ADD COLUMN IF NOT EXISTS label_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS label_verified_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label_batch_number text,
  ADD COLUMN IF NOT EXISTS label_mfd date,
  ADD COLUMN IF NOT EXISTS label_bbd date,
  ADD COLUMN IF NOT EXISTS pack_integrity_check text CHECK (pack_integrity_check IN ('Pass','Fail','Not Checked')),
  ADD COLUMN IF NOT EXISTS fill_weight_g numeric;

ALTER TABLE growth_studies
  ADD COLUMN IF NOT EXISTS substrate_conc_g_l numeric,
  ADD COLUMN IF NOT EXISTS ks_half_sat numeric,
  ADD COLUMN IF NOT EXISTS yx_s_yield_coeff numeric,
  ADD COLUMN IF NOT EXISTS qp_spec_prod_rate numeric;

ALTER TABLE cell_bank_preparations
  ADD COLUMN IF NOT EXISTS stability_test_interval_months integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS last_stability_test_date date,
  ADD COLUMN IF NOT EXISTS next_stability_test_date date;

ALTER TABLE batch_flask_qc_samples
  ADD COLUMN IF NOT EXISTS post_packaging_tested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS post_packaging_ph numeric,
  ADD COLUMN IF NOT EXISTS post_packaging_cfu text,
  ADD COLUMN IF NOT EXISTS packaging_type text;
