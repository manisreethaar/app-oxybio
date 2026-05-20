-- ============================================================
-- OxyOS FK Index Migration
-- Adds covering indexes on all unindexed foreign key columns.
-- PostgreSQL does NOT auto-create indexes on FK columns —
-- this fixes JOIN performance and cascade-delete speed.
-- ============================================================

-- ── activity_log ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_log_reviewed_by
  ON public.activity_log(reviewed_by);

-- ── app_settings ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by
  ON public.app_settings(updated_by);

-- ── batch_fermentation_feeds ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bff_batch_id
  ON public.batch_fermentation_feeds(batch_id);
CREATE INDEX IF NOT EXISTS idx_bff_stock_id
  ON public.batch_fermentation_feeds(stock_id);
CREATE INDEX IF NOT EXISTS idx_bff_logged_by
  ON public.batch_fermentation_feeds(logged_by);

-- ── batch_fermentation_readings ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bfr_flask_id
  ON public.batch_fermentation_readings(flask_id);

-- ── batch_flask_endpoints ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bfe_batch_id
  ON public.batch_flask_endpoints(batch_id);
CREATE INDEX IF NOT EXISTS idx_bfe_declared_by
  ON public.batch_flask_endpoints(declared_by);

-- ── batch_flask_extract_addition ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bfext_batch_id
  ON public.batch_flask_extract_addition(batch_id);

-- ── batch_flask_qc_tests ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bfqt_flask_id
  ON public.batch_flask_qc_tests(flask_id);

-- ── batch_flask_straining ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bfs_batch_id
  ON public.batch_flask_straining(batch_id);

-- ── batch_stage_downstream ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bsd_operator_id
  ON public.batch_stage_downstream(operator_id);

-- ── batch_stage_harvest ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bsh_equipment_id
  ON public.batch_stage_harvest(equipment_id);
CREATE INDEX IF NOT EXISTS idx_bsh_operator_id
  ON public.batch_stage_harvest(operator_id);

-- ── batch_stage_media_prep ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bsmp_formulation_id
  ON public.batch_stage_media_prep(formulation_id);
CREATE INDEX IF NOT EXISTS idx_bsmp_operator_id
  ON public.batch_stage_media_prep(operator_id);

-- ── batch_stage_sterilisation ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bss_equipment_id
  ON public.batch_stage_sterilisation(equipment_id);
CREATE INDEX IF NOT EXISTS idx_bss_operator_id
  ON public.batch_stage_sterilisation(operator_id);

-- ── batches ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_batches_released_by
  ON public.batches(released_by);

-- ── calibration_logs ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cal_equipment_id
  ON public.calibration_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_cal_logged_by
  ON public.calibration_logs(logged_by);

-- ── capa_actions ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_capa_investigation_id
  ON public.capa_actions(investigation_id);
CREATE INDEX IF NOT EXISTS idx_capa_task_id
  ON public.capa_actions(task_id);
CREATE INDEX IF NOT EXISTS idx_capa_verified_by
  ON public.capa_actions(verified_by);

-- ── compliance_items ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_compliance_responsible
  ON public.compliance_items(responsible_person);

-- ── deviations ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deviations_reported_by
  ON public.deviations(reported_by);

-- ── documents ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
  ON public.documents(uploaded_by);

-- ── formulations ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_formulations_created_by
  ON public.formulations(created_by);
CREATE INDEX IF NOT EXISTS idx_formulations_approved_by
  ON public.formulations(approved_by);
CREATE INDEX IF NOT EXISTS idx_formulations_base_version
  ON public.formulations(base_version_id);

-- ── inventory_items ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_items_supplier
  ON public.inventory_items(preferred_supplier);

-- ── inventory_movements ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_movements_issued_by
  ON public.inventory_movements(issued_by);

-- ── inventory_usage ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_usage_logged_by
  ON public.inventory_usage(logged_by);

-- ── investigations ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_investigations_deviation
  ON public.investigations(deviation_id);
CREATE INDEX IF NOT EXISTS idx_investigations_investigator
  ON public.investigations(investigator_id);

-- ── lab_logs ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lab_logs_batch_id
  ON public.lab_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_lab_logs_logged_by
  ON public.lab_logs(logged_by);

-- ── lab_notebook_entries ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lne_countersigned_by
  ON public.lab_notebook_entries(countersigned_by);

-- ── leave_applications ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leave_reviewed_by
  ON public.leave_applications(reviewed_by);

-- ── payslips ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payslips_uploaded_by
  ON public.payslips(uploaded_by);

-- ── ph_readings ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ph_readings_ack_by
  ON public.ph_readings(acknowledged_by);

-- ── purchase_requests ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pr_item_id
  ON public.purchase_requests(item_id);
CREATE INDEX IF NOT EXISTS idx_pr_requested_by
  ON public.purchase_requests(requested_by);

-- ── regulatory_milestones ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reg_milestones_created_by
  ON public.regulatory_milestones(created_by);

-- ── shelf_life_studies ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sls_batch_id
  ON public.shelf_life_studies(batch_id);
CREATE INDEX IF NOT EXISTS idx_sls_created_by
  ON public.shelf_life_studies(created_by);

-- ── sop_library ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sop_lib_approved_by
  ON public.sop_library(approved_by);

-- ── stage_transitions ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stage_trans_changed_by
  ON public.stage_transitions(changed_by);
CREATE INDEX IF NOT EXISTS idx_stage_trans_transitioned_by
  ON public.stage_transitions(transitioned_by);

-- ── tasks ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by
  ON public.tasks(assigned_by);


SELECT 'FK indexes created successfully — 50 indexes added.' AS status;
