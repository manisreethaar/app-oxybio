-- ============================================================
-- OxyOS Security Lint Fix — WARN level issues
-- Fixes:
--   1. Function search_path mutable (5 functions)
--   2. RLS policies always true (44 policies across 30+ tables)
--   3. Notifications table proper row-level isolation
--   4. Payslips + attendance_log row-level isolation
-- ============================================================

-- ============================================================
-- PART 1: FIX MUTABLE search_path ON ALL 5 FUNCTIONS
-- Risk: A malicious schema on the search_path could shadow
-- system functions, causing privilege escalation.
-- Fix: Pin each function to SET search_path = public, pg_temp
-- ============================================================

-- 1a. fn_sync_batch_alarm (trigger: flags batch has_alarm)
CREATE OR REPLACE FUNCTION public.fn_sync_batch_alarm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.is_ph_alarm = true OR NEW.is_temp_alarm = true) THEN
    UPDATE public.batches SET has_alarm = true WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 1b. is_admin (used in RLS policies)
-- Returns true if the current JWT belongs to an admin/ceo/cto employee
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.employees
    WHERE email = auth.jwt()->>'email'
      AND role IN ('admin', 'ceo', 'cto')
      AND is_active = true
  );
END;
$$;

-- 1c. role_rank (used for hierarchical permission checks)
CREATE OR REPLACE FUNCTION public.role_rank(r TEXT)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN CASE r
    WHEN 'ceo'              THEN 10
    WHEN 'cto'              THEN 9
    WHEN 'admin'            THEN 8
    WHEN 'research_fellow'  THEN 6
    WHEN 'scientist'        THEN 5
    WHEN 'intern'           THEN 3
    WHEN 'research_intern'  THEN 3
    ELSE 1
  END;
END;
$$;

-- 1d. check_ferm_ph_deviation (validates pH is within acceptable range)
CREATE OR REPLACE FUNCTION public.check_ferm_ph_deviation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.ph IS NOT NULL AND (NEW.ph < 3.8 OR NEW.ph > 5.5) THEN
    NEW.is_ph_alarm := true;
  ELSE
    NEW.is_ph_alarm := false;
  END IF;
  RETURN NEW;
END;
$$;

-- 1e. flag_fermentation_alarms (sets alarm flags on fermentation readings)
CREATE OR REPLACE FUNCTION public.flag_fermentation_alarms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- pH alarm: outside 3.8–5.5
  IF NEW.ph IS NOT NULL THEN
    NEW.is_ph_alarm := (NEW.ph < 3.8 OR NEW.ph > 5.5);
  END IF;
  -- Temperature alarm: outside 36–38°C
  IF NEW.incubator_temp_c IS NOT NULL THEN
    NEW.is_temp_alarm := (NEW.incubator_temp_c < 36 OR NEW.incubator_temp_c > 38);
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================
-- PART 2: FIX "ALWAYS TRUE" RLS POLICIES
--
-- Strategy by table type:
--   A) Per-user sensitive data (notifications, payslips,
--      attendance_log, activity_log) → proper row filtering
--   B) Shared lab data (batches, batch_*, compliance, etc.)
--      → replace USING(true) with USING(auth.role()='authenticated')
--      This still grants access to all authenticated users but
--      clears the lint warning and blocks anonymous access
-- ============================================================

-- ── A. SENSITIVE PER-USER TABLES ─────────────────────────────

-- notifications: employees see only their own
DROP POLICY IF EXISTS notifications_all ON public.notifications;
CREATE POLICY "notif_own_select" ON public.notifications
  FOR SELECT USING (employee_id IN (
    SELECT id FROM public.employees WHERE email = auth.jwt()->>'email'
  ));
CREATE POLICY "notif_own_update" ON public.notifications
  FOR UPDATE USING (employee_id IN (
    SELECT id FROM public.employees WHERE email = auth.jwt()->>'email'
  ));
-- INSERT kept open for service-role (cron + API routes use service key)
CREATE POLICY "notif_service_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- payslips: employees see only their own; admins see all
DROP POLICY IF EXISTS payslips_all ON public.payslips;
CREATE POLICY "payslip_own_select" ON public.payslips
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR public.is_admin()
  );
CREATE POLICY "payslip_admin_write" ON public.payslips
  FOR ALL USING (public.is_admin());

-- attendance_log: employees see own logs; admins see all
DROP POLICY IF EXISTS attendance_log_all ON public.attendance_log;
CREATE POLICY "attendance_own_select" ON public.attendance_log
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR public.is_admin()
  );
CREATE POLICY "attendance_own_insert" ON public.attendance_log
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
  );
CREATE POLICY "attendance_own_update" ON public.attendance_log
  FOR UPDATE USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR public.is_admin()
  );
CREATE POLICY "attendance_admin_delete" ON public.attendance_log
  FOR DELETE USING (public.is_admin());

-- activity_log: employees see own; admins see all
DROP POLICY IF EXISTS activity_log_all ON public.activity_log;
DROP POLICY IF EXISTS admin_all_activity ON public.activity_log;
DROP POLICY IF EXISTS staff_select_activity ON public.activity_log;
DROP POLICY IF EXISTS staff_insert_activity ON public.activity_log;
CREATE POLICY "activity_own_select" ON public.activity_log
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE email = auth.jwt()->>'email')
    OR public.is_admin()
  );
CREATE POLICY "activity_auth_insert" ON public.activity_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "activity_admin_delete" ON public.activity_log
  FOR DELETE USING (public.is_admin());


-- ── B. SHARED LAB DATA — replace USING(true) with auth check ─

-- batches
DROP POLICY IF EXISTS batches_all ON public.batches;
CREATE POLICY "batches_auth_select" ON public.batches
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "batches_auth_write" ON public.batches
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_fermentation_readings (admin_all policy had role "-")
DROP POLICY IF EXISTS admin_all ON public.batch_fermentation_readings;
CREATE POLICY "bfr_auth_all" ON public.batch_fermentation_readings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_fermentation_feeds
DROP POLICY IF EXISTS auth_insert_batch_fermentation_feeds ON public.batch_fermentation_feeds;
DROP POLICY IF EXISTS auth_update_batch_fermentation_feeds ON public.batch_fermentation_feeds;
CREATE POLICY "bff_auth_insert" ON public.batch_fermentation_feeds
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bff_auth_update" ON public.batch_fermentation_feeds
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flasks
DROP POLICY IF EXISTS auth_insert_batch_flasks ON public.batch_flasks;
DROP POLICY IF EXISTS auth_update_batch_flasks ON public.batch_flasks;
DROP POLICY IF EXISTS bflasks_ins ON public.batch_flasks;
DROP POLICY IF EXISTS bflasks_upd ON public.batch_flasks;
CREATE POLICY "bflasks_auth_insert" ON public.batch_flasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bflasks_auth_update" ON public.batch_flasks
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flask_inoculations
DROP POLICY IF EXISTS admin_all ON public.batch_flask_inoculations;
DROP POLICY IF EXISTS staff_insert_flask_inocu ON public.batch_flask_inoculations;
DROP POLICY IF EXISTS staff_update_flask_inocu ON public.batch_flask_inoculations;
CREATE POLICY "bfi_admin_all" ON public.batch_flask_inoculations
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfi_staff_insert" ON public.batch_flask_inoculations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bfi_staff_update" ON public.batch_flask_inoculations
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flask_endpoints
DROP POLICY IF EXISTS admin_all ON public.batch_flask_endpoints;
DROP POLICY IF EXISTS staff_insert_flask_ep ON public.batch_flask_endpoints;
DROP POLICY IF EXISTS staff_update_flask_ep ON public.batch_flask_endpoints;
CREATE POLICY "bfe_admin_all" ON public.batch_flask_endpoints
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfe_staff_insert" ON public.batch_flask_endpoints
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bfe_staff_update" ON public.batch_flask_endpoints
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flask_straining
DROP POLICY IF EXISTS admin_all ON public.batch_flask_straining;
DROP POLICY IF EXISTS staff_insert_flask_strain ON public.batch_flask_straining;
DROP POLICY IF EXISTS staff_update_flask_strain ON public.batch_flask_straining;
CREATE POLICY "bfs_admin_all" ON public.batch_flask_straining
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfs_staff_insert" ON public.batch_flask_straining
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bfs_staff_update" ON public.batch_flask_straining
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flask_extract_addition
DROP POLICY IF EXISTS admin_all ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_insert_flask_ext ON public.batch_flask_extract_addition;
DROP POLICY IF EXISTS staff_update_flask_ext ON public.batch_flask_extract_addition;
CREATE POLICY "bfext_admin_all" ON public.batch_flask_extract_addition
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfext_staff_insert" ON public.batch_flask_extract_addition
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bfext_staff_update" ON public.batch_flask_extract_addition
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flask_qc_samples
DROP POLICY IF EXISTS admin_all ON public.batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_insert_flask_qcs ON public.batch_flask_qc_samples;
DROP POLICY IF EXISTS staff_update_flask_qcs ON public.batch_flask_qc_samples;
CREATE POLICY "bfqcs_admin_all" ON public.batch_flask_qc_samples
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfqcs_staff_insert" ON public.batch_flask_qc_samples
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bfqcs_staff_update" ON public.batch_flask_qc_samples
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flask_qc_tests
DROP POLICY IF EXISTS admin_all ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_insert_flask_qct ON public.batch_flask_qc_tests;
DROP POLICY IF EXISTS staff_update_flask_qct ON public.batch_flask_qc_tests;
CREATE POLICY "bfqct_admin_all" ON public.batch_flask_qc_tests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfqct_staff_insert" ON public.batch_flask_qc_tests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bfqct_staff_update" ON public.batch_flask_qc_tests
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- batch_flask_release_record
DROP POLICY IF EXISTS admin_all ON public.batch_flask_release_record;
DROP POLICY IF EXISTS ceo_insert_flask_release ON public.batch_flask_release_record;
DROP POLICY IF EXISTS ceo_update_flask_release ON public.batch_flask_release_record;
CREATE POLICY "bfrel_admin_all" ON public.batch_flask_release_record
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfrel_ceo_insert" ON public.batch_flask_release_record
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "bfrel_ceo_update" ON public.batch_flask_release_record
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- batch_flask_rejection_record
DROP POLICY IF EXISTS admin_all ON public.batch_flask_rejection_record;
DROP POLICY IF EXISTS ceo_insert_flask_reject ON public.batch_flask_rejection_record;
DROP POLICY IF EXISTS ceo_update_flask_reject ON public.batch_flask_rejection_record;
CREATE POLICY "bfrej_admin_all" ON public.batch_flask_rejection_record
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bfrej_ceo_insert" ON public.batch_flask_rejection_record
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "bfrej_ceo_update" ON public.batch_flask_rejection_record
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- batch_stage_* tables
DROP POLICY IF EXISTS auth_insert_batch_stage_media_prep ON public.batch_stage_media_prep;
DROP POLICY IF EXISTS auth_update_batch_stage_media_prep ON public.batch_stage_media_prep;
CREATE POLICY "bsmp_auth_insert" ON public.batch_stage_media_prep
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bsmp_auth_update" ON public.batch_stage_media_prep
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS authenticated_can_insert_sterilisation ON public.batch_stage_sterilisation;
DROP POLICY IF EXISTS authenticated_can_update_sterilisation ON public.batch_stage_sterilisation;
CREATE POLICY "bss_auth_insert" ON public.batch_stage_sterilisation
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bss_auth_update" ON public.batch_stage_sterilisation
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS auth_insert_batch_stage_harvest ON public.batch_stage_harvest;
DROP POLICY IF EXISTS auth_update_batch_stage_harvest ON public.batch_stage_harvest;
CREATE POLICY "bsh_auth_insert" ON public.batch_stage_harvest
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bsh_auth_update" ON public.batch_stage_harvest
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS auth_insert_batch_stage_downstream ON public.batch_stage_downstream;
DROP POLICY IF EXISTS auth_update_batch_stage_downstream ON public.batch_stage_downstream;
CREATE POLICY "bsd_auth_insert" ON public.batch_stage_downstream
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "bsd_auth_update" ON public.batch_stage_downstream
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- stage_transitions
DROP POLICY IF EXISTS auth_insert_stage_transitions ON public.stage_transitions;
DROP POLICY IF EXISTS auth_update_stage_transitions ON public.stage_transitions;
DROP POLICY IF EXISTS stage_transitions_all ON public.stage_transitions;
CREATE POLICY "st_auth_all" ON public.stage_transitions
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- calibration_logs
DROP POLICY IF EXISTS calibration_logs_all ON public.calibration_logs;
CREATE POLICY "cal_auth_select" ON public.calibration_logs
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cal_auth_insert" ON public.calibration_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "cal_admin_write" ON public.calibration_logs
  FOR ALL USING (public.is_admin());

-- capa_actions
DROP POLICY IF EXISTS capa_actions_all ON public.capa_actions;
CREATE POLICY "capa_auth_all" ON public.capa_actions
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- compliance_items
DROP POLICY IF EXISTS compliance_items_all ON public.compliance_items;
CREATE POLICY "compliance_auth_select" ON public.compliance_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "compliance_admin_write" ON public.compliance_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- deviations
DROP POLICY IF EXISTS deviations_all ON public.deviations;
CREATE POLICY "dev_auth_all" ON public.deviations
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- documents
DROP POLICY IF EXISTS documents_all ON public.documents;
CREATE POLICY "docs_auth_select" ON public.documents
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "docs_admin_write" ON public.documents
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- equipment
DROP POLICY IF EXISTS equipment_all ON public.equipment;
CREATE POLICY "equip_auth_select" ON public.equipment
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "equip_admin_write" ON public.equipment
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- formulations
DROP POLICY IF EXISTS formulations_insert ON public.formulations;
DROP POLICY IF EXISTS formulations_update ON public.formulations;
CREATE POLICY "form_auth_insert" ON public.formulations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "form_auth_update" ON public.formulations
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (
    (status = 'Approved' AND public.is_admin()) OR status <> 'Approved'
  );

-- inventory_items
DROP POLICY IF EXISTS inventory_items_all ON public.inventory_items;
CREATE POLICY "inv_items_auth_select" ON public.inventory_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "inv_items_admin_write" ON public.inventory_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- inventory_movements
DROP POLICY IF EXISTS inventory_movements_all ON public.inventory_movements;
DROP POLICY IF EXISTS "Allow authenticated inserts on movements" ON public.inventory_movements;
CREATE POLICY "inv_mov_auth_all" ON public.inventory_movements
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- inventory_stock
DROP POLICY IF EXISTS inventory_stock_all ON public.inventory_stock;
CREATE POLICY "inv_stock_auth_all" ON public.inventory_stock
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- inventory_usage
DROP POLICY IF EXISTS inventory_usage_all ON public.inventory_usage;
CREATE POLICY "inv_usage_auth_all" ON public.inventory_usage
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- investigations
DROP POLICY IF EXISTS investigations_all ON public.investigations;
CREATE POLICY "invest_auth_all" ON public.investigations
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- lab_logs
DROP POLICY IF EXISTS lab_logs_all ON public.lab_logs;
CREATE POLICY "lab_logs_auth_all" ON public.lab_logs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- lab_notebook_entries
DROP POLICY IF EXISTS lab_notebook_entries_all ON public.lab_notebook_entries;
CREATE POLICY "lne_auth_all" ON public.lab_notebook_entries
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ph_readings
DROP POLICY IF EXISTS ph_readings_all ON public.ph_readings;
CREATE POLICY "ph_auth_all" ON public.ph_readings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- purchase_requests
DROP POLICY IF EXISTS purchase_requests_all ON public.purchase_requests;
CREATE POLICY "pr_auth_select" ON public.purchase_requests
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "pr_auth_insert" ON public.purchase_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "pr_admin_write" ON public.purchase_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- shelf_life_studies
DROP POLICY IF EXISTS shelf_life_studies_all ON public.shelf_life_studies;
CREATE POLICY "sls_auth_all" ON public.shelf_life_studies
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- sop_acknowledgements
DROP POLICY IF EXISTS sop_acknowledgements_all ON public.sop_acknowledgements;
CREATE POLICY "sop_ack_auth_all" ON public.sop_acknowledgements
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- sop_library
DROP POLICY IF EXISTS sop_library_all ON public.sop_library;
CREATE POLICY "sop_lib_auth_select" ON public.sop_library
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sop_lib_admin_write" ON public.sop_library
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- taste_panels
DROP POLICY IF EXISTS taste_panels_all ON public.taste_panels;
CREATE POLICY "taste_auth_all" ON public.taste_panels
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- vendors
DROP POLICY IF EXISTS vendors_all ON public.vendors;
CREATE POLICY "vendors_auth_select" ON public.vendors
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "vendors_admin_write" ON public.vendors
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


SELECT 'Security lint fixes applied successfully.' AS status;
