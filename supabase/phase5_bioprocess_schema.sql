-- Phase 5 Bioprocess & R&D Scaling Schema

-- 74. Statistical Analysis Engine & 78. DoE Visualization
CREATE TABLE IF NOT EXISTS bioprocess_statistics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  experiment_id UUID, -- References whatever bioprocess experiment table exists (e.g. bioprocess_experiments)
  anova_results JSONB,
  r_squared NUMERIC,
  doe_matrix JSONB,
  contour_plot_data JSONB,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 77. Scale-down Models
CREATE TABLE IF NOT EXISTS scale_down_models (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bench_scale_batch_id UUID REFERENCES batches(id),
  production_scale_batch_id UUID REFERENCES batches(id),
  scaling_factor NUMERIC NOT NULL,
  comparability_score NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 76. Predictive Modeling
CREATE TABLE IF NOT EXISTS predictive_models (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  model_name TEXT NOT NULL,
  version TEXT NOT NULL,
  target_variable TEXT NOT NULL,
  confidence_interval NUMERIC,
  feature_weights JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
