const fs = require('fs');

const tables = [
  'activity_log', 'app_settings', 'aql_sampling_plans', 'attendance_log', 'batch_costs',
  'batch_fermentation_feeds', 'batch_fermentation_readings', 'batch_flask_endpoints',
  'batch_flask_extract_addition', 'batch_flask_inoculations', 'batch_flask_qc_samples',
  'batch_flask_qc_tests', 'batch_flask_rejection_record', 'batch_flask_release_record',
  'batch_flask_straining', 'batch_flasks', 'batch_stage_downstream', 'batch_stage_harvest',
  'batch_stage_media_prep', 'batch_stage_sterilisation', 'batches', 'bioprocess_experiments',
  'bioprocess_factors', 'bioprocess_kinetics_data', 'bioprocess_responses', 'calibration_logs',
  'capa_actions', 'cell_bank_preparations', 'cell_bank_strains', 'compliance_items',
  'customer_complaints', 'deviations', 'documents', 'emp_samples', 'emp_sampling_locations',
  'employees', 'equipment', 'equipment_tickets', 'formulations', 'hr_delegations',
  'hr_expenses', 'hr_holidays', 'hr_shifts', 'hr_tax_profiles', 'internal_audits',
  'inventory', 'inventory_items', 'inventory_movements', 'inventory_stock', 'inventory_usage',
  'investigations', 'lab_notebook_entries', 'leave_applications', 'leave_encashments',
  'messages', 'notifications', 'payslips', 'ph_readings', 'predictive_models',
  'regulatory_milestones', 'sample_incubation_records', 'samples', 'scale_down_models',
  'shelf_life_logs', 'shelf_life_studies', 'shift_handovers', 'sop_acknowledgements',
  'sop_library', 'stability_timepoints', 'stage_transitions', 'system_config',
  'system_health_log', 'tasks', 'taste_panels', 'test_results', 'titration_logs', 'vendors'
];

let sql = `-- SAFE GLOBAL RLS PATCH
-- This script explicitly targets only the app's tables to prevent permissions errors.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

`;

tables.forEach(t => {
  sql += `-- Table: ${t}\n`;
  sql += `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;\n`;
  sql += `DROP POLICY IF EXISTS "global_select_all" ON public.${t};\n`;
  sql += `DROP POLICY IF EXISTS "global_insert_all" ON public.${t};\n`;
  sql += `DROP POLICY IF EXISTS "global_update_all" ON public.${t};\n`;
  sql += `DROP POLICY IF EXISTS "global_delete_admin" ON public.${t};\n`;
  sql += `CREATE POLICY "global_select_all" ON public.${t} FOR SELECT TO authenticated USING (true);\n`;
  sql += `CREATE POLICY "global_insert_all" ON public.${t} FOR INSERT TO authenticated WITH CHECK (true);\n`;
  sql += `CREATE POLICY "global_update_all" ON public.${t} FOR UPDATE TO authenticated USING (true);\n`;
  sql += `CREATE POLICY "global_delete_admin" ON public.${t} FOR DELETE TO authenticated USING (public.get_my_role() IN ('admin', 'ceo', 'cto'));\n\n`;
});

fs.writeFileSync('C:/Users/manis/.gemini/antigravity-ide/brain/201970c3-2b4e-4cd5-88f5-493d96879d3f/safe_global_rls_patch.sql', sql);
console.log('Done');
