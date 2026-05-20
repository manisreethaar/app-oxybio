-- ============================================================
-- OxyOS Performance Lint Fix
-- Fixes:
--   1. auth_rls_initplan  — wrap auth.role()/auth.jwt() in
--      (select ...) so Postgres evaluates once, not per row
--   2. multiple_permissive_policies — drop stale old policies
--      that survived alongside migration-2 policies; also fix
--      FOR ALL + FOR SELECT overlaps on same table
--   3. duplicate_index — drop redundant employees email index
-- ============================================================

-- ============================================================
-- PART 0: DROP DUPLICATE INDEX
-- ============================================================
DROP INDEX IF EXISTS public.idx_employees_email;
-- employees_email_key (unique constraint) remains

-- ============================================================
-- PART 1: DROP STALE OLD POLICIES (left over from original
-- schema, survived because DROP names in migration-2 were wrong)
-- ============================================================

-- attendance_log: old admin override policy now redundant
DROP POLICY IF EXISTS "Admins can update attendance" ON public.attendance_log;

-- batch_fermentation_feeds
DROP POLICY IF EXISTS admin_all ON public.batch_fermentation_feeds;
DROP POLICY IF EXISTS staff_insert ON public.batch_fermentation_feeds;
DROP POLICY IF EXISTS staff_select ON public.batch_fermentation_feeds;
DROP POLICY IF EXISTS auth_select_batch_fermentation_feeds ON public.batch_fermentation_feeds;

-- batch_flask_endpoints
DROP POLICY IF EXISTS admin_all_flask_ep ON public.batch_flask_endpoints;
DROP POLICY IF EXISTS staff_insert_flask_ep ON public.batch_flask_endpoints;
DROP POLICY IF EXISTS staff_select_flask_ep ON public.batch_flask_endpoints;
DROP POLICY IF EXISTS staff_update_flask_ep ON public.batch_flask_endpoints;

-- batch_flask_extract_addition
DROP POLICY IF EXISTS admin_all_flask_ext ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_insert_flask_ext ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_select_flask_ext ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_update_flask_ext ON public.batch_flask_extract_addition;

-- batch_flask_inoculations
DROP POLICY IF EXISTS admin_all_flask_inocu ON public.batch_flask_inoculations;
DROP POLICY IF EXISTS staff_insert_flask_inocu ON public.batch_flask_inoculations;
DROP POLICY IF EXISTS staff_select_flask_inocu ON public.batch_flask_inoculations;
DROP POLICY IF EXISTS staff_update_flask_inocu ON public.batch_flask_inoculations;

-- batch_flask_qc_samples
DROP POLICY IF EXISTS admin_all_flask_qcs ON public.batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_insert_flask_qcs ON public.batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_select_flask_qcs ON public.batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_update_flask_qcs ON public.batch_flask_qc_samples;

-- batch_flask_qc_tests
DROP POLICY IF EXISTS admin_all_flask_qct ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_insert_flask_qct ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_select_flask_qct ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_update_flask_qct ON public.batch_flask_qc_tests;

-- batch_flask_rejection_record
DROP POLICY IF EXISTS admin_all_flask_reject ON public.batch_flask_rejection_record;
DROP POLICY IF EXISTS staff_select_flask_reject ON public.batch_flask_rejection_record;
DROP POLICY IF EXISTS ceo_insert_flask_reject ON public.batch_flask_rejection_record;
DROP POLICY IF EXISTS ceo_update_flask_reject ON public.batch_flask_rejection_record;

-- batch_flask_release_record
DROP POLICY IF EXISTS admin_all_flask_release ON public.batch_flask_release_record;
DROP POLICY IF EXISTS staff_select_flask_release ON public.batch_flask_release_record;
DROP POLICY IF EXISTS ceo_insert_flask_release ON public.batch_flask_release_record;
DROP POLICY IF EXISTS ceo_update_flask_release ON public.batch_flask_release_record;

-- batch_flask_straining
DROP POLICY IF EXISTS admin_all_flask_strain ON public.batch_flask_straining;
DROP POLICY IF EXISTS staff_insert_flask_strain ON public.batch_flask_straining;
DROP POLICY IF EXISTS staff_select_flask_strain ON public.batch_flask_straining;
DROP POLICY IF EXISTS staff_update_flask_strain ON public.batch_flask_straining;

-- batch_flasks
DROP POLICY IF EXISTS bflasks_all ON public.batch_flasks;
DROP POLICY IF EXISTS bflasks_sel ON public.batch_flasks;
DROP POLICY IF EXISTS auth_select_batch_flasks ON public.batch_flasks;

-- batch_stage_downstream
DROP POLICY IF EXISTS admin_all ON public.batch_stage_downstream;
DROP POLICY IF EXISTS staff_insert ON public.batch_stage_downstream;
DROP POLICY IF EXISTS staff_select ON public.batch_stage_downstream;
DROP POLICY IF EXISTS auth_select_batch_stage_downstream ON public.batch_stage_downstream;

-- batch_stage_harvest
DROP POLICY IF EXISTS admin_all ON public.batch_stage_harvest;
DROP POLICY IF EXISTS staff_insert ON public.batch_stage_harvest;
DROP POLICY IF EXISTS staff_select ON public.batch_stage_harvest;
DROP POLICY IF EXISTS auth_select_batch_stage_harvest ON public.batch_stage_harvest;

-- batch_stage_media_prep
DROP POLICY IF EXISTS admin_all ON public.batch_stage_media_prep;
DROP POLICY IF EXISTS staff_insert ON public.batch_stage_media_prep;
DROP POLICY IF EXISTS staff_select ON public.batch_stage_media_prep;
DROP POLICY IF EXISTS staff_upsert ON public.batch_stage_media_prep;
DROP POLICY IF EXISTS auth_select_batch_stage_media_prep ON public.batch_stage_media_prep;

-- batch_stage_sterilisation
DROP POLICY IF EXISTS admin_all ON public.batch_stage_sterilisation;
DROP POLICY IF EXISTS staff_insert ON public.batch_stage_sterilisation;
DROP POLICY IF EXISTS staff_select ON public.batch_stage_sterilisation;
DROP POLICY IF EXISTS staff_upsert ON public.batch_stage_sterilisation;
DROP POLICY IF EXISTS authenticated_can_select_sterilisation ON public.batch_stage_sterilisation;

-- equipment
DROP POLICY IF EXISTS "Allow delete equipment" ON public.equipment;

-- formulations
DROP POLICY IF EXISTS "Staff can delete own formulations" ON public.formulations;
DROP POLICY IF EXISTS "Staff can update formulations" ON public.formulations;
DROP POLICY IF EXISTS formulations_delete ON public.formulations;

-- inventory_items
DROP POLICY IF EXISTS "Allow delete items" ON public.inventory_items;
DROP POLICY IF EXISTS "Staff can delete items" ON public.inventory_items;
DROP POLICY IF EXISTS "Staff can insert items" ON public.inventory_items;
DROP POLICY IF EXISTS "Staff can update items" ON public.inventory_items;

-- inventory_movements
DROP POLICY IF EXISTS "Allow authenticated reads on movements" ON public.inventory_movements;

-- inventory_stock
DROP POLICY IF EXISTS "Staff can update stock" ON public.inventory_stock;

-- stage_transitions
DROP POLICY IF EXISTS auth_select_stage_transitions ON public.stage_transitions;

-- vendors
DROP POLICY IF EXISTS "Staff can delete vendors" ON public.vendors;
DROP POLICY IF EXISTS "Staff can insert vendors" ON public.vendors;
DROP POLICY IF EXISTS "Staff can update vendors" ON public.vendors;


-- ============================================================
-- PART 2: BATCH DATA TABLES
-- All authenticated users can do all operations on lab data.
-- Replace split policies (admin_all + staff_insert + staff_update)
-- with a single FOR ALL policy — no overlap, one evaluation.
-- ============================================================

-- batches (drop separate SELECT + write, merge into one)
DROP POLICY IF EXISTS batches_auth_select ON public.batches;
DROP POLICY IF EXISTS batches_auth_write ON public.batches;
CREATE POLICY "batches_auth_all" ON public.batches
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_fermentation_readings
DROP POLICY IF EXISTS bfr_auth_all ON public.batch_fermentation_readings;
CREATE POLICY "bfr_auth_all" ON public.batch_fermentation_readings
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_fermentation_feeds (old policies dropped in Part 1)
DROP POLICY IF EXISTS bff_auth_insert ON public.batch_fermentation_feeds;
DROP POLICY IF EXISTS bff_auth_update ON public.batch_fermentation_feeds;
CREATE POLICY "bff_auth_all" ON public.batch_fermentation_feeds
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flasks (old policies dropped in Part 1)
DROP POLICY IF EXISTS bflasks_auth_insert ON public.batch_flasks;
DROP POLICY IF EXISTS bflasks_auth_update ON public.batch_flasks;
CREATE POLICY "bflasks_auth_all" ON public.batch_flasks
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flask_inoculations (old + migration-2 policies dropped)
DROP POLICY IF EXISTS bfi_admin_all ON public.batch_flask_inoculations;
DROP POLICY IF EXISTS bfi_staff_insert ON public.batch_flask_inoculations;
DROP POLICY IF EXISTS bfi_staff_update ON public.batch_flask_inoculations;
CREATE POLICY "bfi_auth_all" ON public.batch_flask_inoculations
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flask_endpoints
DROP POLICY IF EXISTS bfe_admin_all ON public.batch_flask_endpoints;
DROP POLICY IF EXISTS bfe_staff_insert ON public.batch_flask_endpoints;
DROP POLICY IF EXISTS bfe_staff_update ON public.batch_flask_endpoints;
CREATE POLICY "bfe_auth_all" ON public.batch_flask_endpoints
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flask_straining
DROP POLICY IF EXISTS bfs_admin_all ON public.batch_flask_straining;
DROP POLICY IF EXISTS bfs_staff_insert ON public.batch_flask_straining;
DROP POLICY IF EXISTS bfs_staff_update ON public.batch_flask_straining;
CREATE POLICY "bfs_auth_all" ON public.batch_flask_straining
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flask_extract_addition
DROP POLICY IF EXISTS bfext_admin_all ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS bfext_staff_insert ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS bfext_staff_update ON public.batch_flask_extract_addition;
CREATE POLICY "bfext_auth_all" ON public.batch_flask_extract_addition
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flask_qc_samples
DROP POLICY IF EXISTS bfqcs_admin_all ON public.batch_flask_qc_samples;
DROP POLICY IF EXISTS bfqcs_staff_insert ON public.batch_flask_qc_samples;
DROP POLICY IF EXISTS bfqcs_staff_update ON public.batch_flask_qc_samples;
CREATE POLICY "bfqcs_auth_all" ON public.batch_flask_qc_samples
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flask_qc_tests
DROP POLICY IF EXISTS bfqct_admin_all ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS bfqct_staff_insert ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS bfqct_staff_update ON public.batch_flask_qc_tests;
CREATE POLICY "bfqct_auth_all" ON public.batch_flask_qc_tests
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_flask_release_record (admin write, all can read)
DROP POLICY IF EXISTS bfrel_admin_all ON public.batch_flask_release_record;
DROP POLICY IF EXISTS bfrel_ceo_insert ON public.batch_flask_release_record;
DROP POLICY IF EXISTS bfrel_ceo_update ON public.batch_flask_release_record;
CREATE POLICY "bfrel_auth_select" ON public.batch_flask_release_record
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "bfrel_admin_insert" ON public.batch_flask_release_record
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "bfrel_admin_update" ON public.batch_flask_release_record
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "bfrel_admin_delete" ON public.batch_flask_release_record
  FOR DELETE USING (public.is_admin());

-- batch_flask_rejection_record (admin write, all can read)
DROP POLICY IF EXISTS bfrej_admin_all ON public.batch_flask_rejection_record;
DROP POLICY IF EXISTS bfrej_ceo_insert ON public.batch_flask_rejection_record;
DROP POLICY IF EXISTS bfrej_ceo_update ON public.batch_flask_rejection_record;
CREATE POLICY "bfrej_auth_select" ON public.batch_flask_rejection_record
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "bfrej_admin_insert" ON public.batch_flask_rejection_record
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "bfrej_admin_update" ON public.batch_flask_rejection_record
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "bfrej_admin_delete" ON public.batch_flask_rejection_record
  FOR DELETE USING (public.is_admin());

-- batch_stage_media_prep (old dropped in Part 1)
DROP POLICY IF EXISTS bsmp_auth_insert ON public.batch_stage_media_prep;
DROP POLICY IF EXISTS bsmp_auth_update ON public.batch_stage_media_prep;
CREATE POLICY "bsmp_auth_all" ON public.batch_stage_media_prep
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_stage_sterilisation (old dropped in Part 1)
DROP POLICY IF EXISTS bss_auth_insert ON public.batch_stage_sterilisation;
DROP POLICY IF EXISTS bss_auth_update ON public.batch_stage_sterilisation;
CREATE POLICY "bss_auth_all" ON public.batch_stage_sterilisation
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_stage_harvest (old dropped in Part 1)
DROP POLICY IF EXISTS bsh_auth_insert ON public.batch_stage_harvest;
DROP POLICY IF EXISTS bsh_auth_update ON public.batch_stage_harvest;
CREATE POLICY "bsh_auth_all" ON public.batch_stage_harvest
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- batch_stage_downstream (old dropped in Part 1)
DROP POLICY IF EXISTS bsd_auth_insert ON public.batch_stage_downstream;
DROP POLICY IF EXISTS bsd_auth_update ON public.batch_stage_downstream;
CREATE POLICY "bsd_auth_all" ON public.batch_stage_downstream
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- stage_transitions (old dropped in Part 1)
DROP POLICY IF EXISTS st_auth_all ON public.stage_transitions;
CREATE POLICY "st_auth_all" ON public.stage_transitions
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- ph_readings
DROP POLICY IF EXISTS ph_auth_all ON public.ph_readings;
CREATE POLICY "ph_auth_all" ON public.ph_readings
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- lab_logs
DROP POLICY IF EXISTS lab_logs_auth_all ON public.lab_logs;
CREATE POLICY "lab_logs_auth_all" ON public.lab_logs
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- lab_notebook_entries
DROP POLICY IF EXISTS lne_auth_all ON public.lab_notebook_entries;
CREATE POLICY "lne_auth_all" ON public.lab_notebook_entries
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- shelf_life_studies
DROP POLICY IF EXISTS sls_auth_all ON public.shelf_life_studies;
CREATE POLICY "sls_auth_all" ON public.shelf_life_studies
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- taste_panels
DROP POLICY IF EXISTS taste_auth_all ON public.taste_panels;
CREATE POLICY "taste_auth_all" ON public.taste_panels
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- deviations
DROP POLICY IF EXISTS dev_auth_all ON public.deviations;
CREATE POLICY "dev_auth_all" ON public.deviations
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- investigations
DROP POLICY IF EXISTS invest_auth_all ON public.investigations;
CREATE POLICY "invest_auth_all" ON public.investigations
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- capa_actions
DROP POLICY IF EXISTS capa_auth_all ON public.capa_actions;
CREATE POLICY "capa_auth_all" ON public.capa_actions
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- sop_acknowledgements
DROP POLICY IF EXISTS sop_ack_auth_all ON public.sop_acknowledgements;
CREATE POLICY "sop_ack_auth_all" ON public.sop_acknowledgements
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- inventory_movements (old dropped in Part 1)
DROP POLICY IF EXISTS inv_mov_auth_all ON public.inventory_movements;
CREATE POLICY "inv_mov_auth_all" ON public.inventory_movements
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- inventory_stock (old dropped in Part 1)
DROP POLICY IF EXISTS inv_stock_auth_all ON public.inventory_stock;
CREATE POLICY "inv_stock_auth_all" ON public.inventory_stock
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- inventory_usage
DROP POLICY IF EXISTS inv_usage_auth_all ON public.inventory_usage;
CREATE POLICY "inv_usage_auth_all" ON public.inventory_usage
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- formulations (old dropped in Part 1)
DROP POLICY IF EXISTS form_auth_insert ON public.formulations;
DROP POLICY IF EXISTS form_auth_update ON public.formulations;
CREATE POLICY "form_auth_insert" ON public.formulations
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "form_auth_update" ON public.formulations
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK (
    (status = 'Approved' AND public.is_admin()) OR status <> 'Approved'
  );

-- calibration_logs: merge 3 overlapping policies into 1
DROP POLICY IF EXISTS cal_auth_select ON public.calibration_logs;
DROP POLICY IF EXISTS cal_auth_insert ON public.calibration_logs;
DROP POLICY IF EXISTS cal_admin_write ON public.calibration_logs;
CREATE POLICY "cal_auth_all" ON public.calibration_logs
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');


-- ============================================================
-- PART 3: ADMIN-WRITE TABLES
-- Pattern: SELECT open to all authenticated, writes admin-only.
-- Split FOR ALL (is_admin) into INSERT+UPDATE+DELETE only, so
-- SELECT policy doesn't overlap with the admin write policy.
-- ============================================================

-- compliance_items
DROP POLICY IF EXISTS compliance_auth_select ON public.compliance_items;
DROP POLICY IF EXISTS compliance_admin_write ON public.compliance_items;
CREATE POLICY "compliance_auth_select" ON public.compliance_items
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "compliance_admin_insert" ON public.compliance_items
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "compliance_admin_update" ON public.compliance_items
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "compliance_admin_delete" ON public.compliance_items
  FOR DELETE USING (public.is_admin());

-- documents
DROP POLICY IF EXISTS docs_auth_select ON public.documents;
DROP POLICY IF EXISTS docs_admin_write ON public.documents;
CREATE POLICY "docs_auth_select" ON public.documents
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "docs_admin_insert" ON public.documents
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "docs_admin_update" ON public.documents
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "docs_admin_delete" ON public.documents
  FOR DELETE USING (public.is_admin());

-- equipment (old dropped in Part 1)
DROP POLICY IF EXISTS equip_auth_select ON public.equipment;
DROP POLICY IF EXISTS equip_admin_write ON public.equipment;
CREATE POLICY "equip_auth_select" ON public.equipment
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "equip_admin_insert" ON public.equipment
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "equip_admin_update" ON public.equipment
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "equip_admin_delete" ON public.equipment
  FOR DELETE USING (public.is_admin());

-- inventory_items (old dropped in Part 1)
DROP POLICY IF EXISTS inv_items_auth_select ON public.inventory_items;
DROP POLICY IF EXISTS inv_items_admin_write ON public.inventory_items;
CREATE POLICY "inv_items_auth_select" ON public.inventory_items
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "inv_items_admin_insert" ON public.inventory_items
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "inv_items_admin_update" ON public.inventory_items
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "inv_items_admin_delete" ON public.inventory_items
  FOR DELETE USING (public.is_admin());

-- sop_library
DROP POLICY IF EXISTS sop_lib_auth_select ON public.sop_library;
DROP POLICY IF EXISTS sop_lib_admin_write ON public.sop_library;
CREATE POLICY "sop_lib_auth_select" ON public.sop_library
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "sop_lib_admin_insert" ON public.sop_library
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "sop_lib_admin_update" ON public.sop_library
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "sop_lib_admin_delete" ON public.sop_library
  FOR DELETE USING (public.is_admin());

-- vendors (old dropped in Part 1)
DROP POLICY IF EXISTS vendors_auth_select ON public.vendors;
DROP POLICY IF EXISTS vendors_admin_write ON public.vendors;
CREATE POLICY "vendors_auth_select" ON public.vendors
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "vendors_admin_insert" ON public.vendors
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "vendors_admin_update" ON public.vendors
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "vendors_admin_delete" ON public.vendors
  FOR DELETE USING (public.is_admin());

-- purchase_requests
DROP POLICY IF EXISTS pr_auth_select ON public.purchase_requests;
DROP POLICY IF EXISTS pr_auth_insert ON public.purchase_requests;
DROP POLICY IF EXISTS pr_admin_write ON public.purchase_requests;
CREATE POLICY "pr_auth_select" ON public.purchase_requests
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "pr_auth_insert" ON public.purchase_requests
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "pr_admin_update" ON public.purchase_requests
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "pr_admin_delete" ON public.purchase_requests
  FOR DELETE USING (public.is_admin());

-- app_settings (split FOR ALL into SELECT + writes to avoid overlap)
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY "app_settings_select" ON public.app_settings
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "app_settings_admin_insert" ON public.app_settings
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = (select auth.jwt())->>'email'
      AND role IN ('admin', 'ceo', 'cto')
  ));
CREATE POLICY "app_settings_admin_update" ON public.app_settings
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = (select auth.jwt())->>'email'
      AND role IN ('admin', 'ceo', 'cto')
  ));
CREATE POLICY "app_settings_admin_delete" ON public.app_settings
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = (select auth.jwt())->>'email'
      AND role IN ('admin', 'ceo', 'cto')
  ));

-- regulatory_milestones (fix auth.jwt() → (select auth.jwt()))
DROP POLICY IF EXISTS regulatory_milestones_select ON public.regulatory_milestones;
DROP POLICY IF EXISTS regulatory_milestones_admin_write ON public.regulatory_milestones;
DROP POLICY IF EXISTS regulatory_milestones_admin_update ON public.regulatory_milestones;
DROP POLICY IF EXISTS regulatory_milestones_admin_delete ON public.regulatory_milestones;
CREATE POLICY "regulatory_milestones_select" ON public.regulatory_milestones
  FOR SELECT USING ((select auth.role()) = 'authenticated');
CREATE POLICY "regulatory_milestones_admin_insert" ON public.regulatory_milestones
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = (select auth.jwt())->>'email'
      AND role IN ('admin', 'ceo', 'cto')
  ));
CREATE POLICY "regulatory_milestones_admin_update" ON public.regulatory_milestones
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = (select auth.jwt())->>'email'
      AND role IN ('admin', 'ceo', 'cto')
  ));
CREATE POLICY "regulatory_milestones_admin_delete" ON public.regulatory_milestones
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = (select auth.jwt())->>'email'
      AND role IN ('admin', 'ceo', 'cto')
  ));

-- released_employee_codes (fix auth.jwt())
DROP POLICY IF EXISTS released_codes_admin_only ON public.released_employee_codes;
CREATE POLICY "released_codes_admin_only" ON public.released_employee_codes
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = (select auth.jwt())->>'email'
      AND role IN ('admin', 'ceo', 'cto')
  ));


-- ============================================================
-- PART 4: PER-USER TABLES
-- Fix auth.jwt() → (select auth.jwt()) in row-level filters
-- ============================================================

-- notifications
DROP POLICY IF EXISTS notif_own_select ON public.notifications;
DROP POLICY IF EXISTS notif_own_update ON public.notifications;
DROP POLICY IF EXISTS notif_service_insert ON public.notifications;
CREATE POLICY "notif_own_select" ON public.notifications
  FOR SELECT USING (employee_id IN (
    SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email'
  ));
CREATE POLICY "notif_own_update" ON public.notifications
  FOR UPDATE USING (employee_id IN (
    SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email'
  ));
CREATE POLICY "notif_service_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    (select auth.role()) = 'authenticated' OR (select auth.role()) = 'service_role'
  );

-- payslips: split admin_write (was FOR ALL) into separate ops to avoid SELECT overlap
DROP POLICY IF EXISTS payslip_own_select ON public.payslips;
DROP POLICY IF EXISTS payslip_admin_write ON public.payslips;
CREATE POLICY "payslip_own_select" ON public.payslips
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR public.is_admin()
  );
CREATE POLICY "payslip_admin_insert" ON public.payslips
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "payslip_admin_update" ON public.payslips
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "payslip_admin_delete" ON public.payslips
  FOR DELETE USING (public.is_admin());

-- attendance_log (old "Admins can update attendance" dropped in Part 1)
DROP POLICY IF EXISTS attendance_own_select ON public.attendance_log;
DROP POLICY IF EXISTS attendance_own_insert ON public.attendance_log;
DROP POLICY IF EXISTS attendance_own_update ON public.attendance_log;
DROP POLICY IF EXISTS attendance_admin_delete ON public.attendance_log;
CREATE POLICY "attendance_own_select" ON public.attendance_log
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR public.is_admin()
  );
CREATE POLICY "attendance_own_insert" ON public.attendance_log
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
  );
CREATE POLICY "attendance_own_update" ON public.attendance_log
  FOR UPDATE USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR public.is_admin()
  );
CREATE POLICY "attendance_admin_delete" ON public.attendance_log
  FOR DELETE USING (public.is_admin());

-- activity_log
DROP POLICY IF EXISTS activity_own_select ON public.activity_log;
DROP POLICY IF EXISTS activity_auth_insert ON public.activity_log;
DROP POLICY IF EXISTS activity_admin_delete ON public.activity_log;
CREATE POLICY "activity_own_select" ON public.activity_log
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = (select auth.jwt())->>'email')
    OR public.is_admin()
  );
CREATE POLICY "activity_auth_insert" ON public.activity_log
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "activity_admin_delete" ON public.activity_log
  FOR DELETE USING (public.is_admin());


-- ============================================================
-- PART 5: EMPLOYEES TABLE — consolidate duplicate UPDATE policies
-- ============================================================
DROP POLICY IF EXISTS admin_update_any_employee ON public.employees;
DROP POLICY IF EXISTS "update own profile" ON public.employees;
CREATE POLICY "employees_update" ON public.employees
  FOR UPDATE USING (
    auth.uid() = id
    OR public.is_admin()
  );


SELECT 'Performance lint fixes applied successfully.' AS status;
