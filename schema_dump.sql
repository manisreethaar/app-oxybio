-- Schema derived from PostgREST OpenAPI spec

CREATE TABLE public."reading_audit_log" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "table_name" text NOT NULL DEFAULT 'batch_fermentation_readings',
  "reading_id" uuid NOT NULL,
  "action" text NOT NULL,
  "changed_by" uuid NOT NULL,
  "changed_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "old_values" jsonb NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."bioprocess_responses" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "experiment_id" uuid,
  "run_number" integer NOT NULL,
  "response" numeric,
  "notes" text,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."sop_quizzes" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "sop_id" uuid,
  "questions" jsonb,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."growth_studies" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "name" text NOT NULL,
  "study_type" text NOT NULL DEFAULT 'growth_curve',
  "status" text NOT NULL DEFAULT 'setup',
  "cell_bank_strain_id" uuid,
  "cell_bank_preparation_id" uuid,
  "formulation_id" uuid,
  "media_name" text,
  "vessel_type" text,
  "volume_ml" numeric,
  "temperature_c" numeric,
  "agitation_rpm" integer,
  "inoculum_percentage" numeric,
  "inoculum_volume_ml" numeric,
  "od_wavelength" integer DEFAULT 600,
  "initial_od" numeric,
  "initial_ph" numeric,
  "initial_glucose_g_l" numeric,
  "inoculation_time" timestamp with time zone,
  "expected_duration_hours" integer,
  "completed_at" timestamp with time zone,
  "objective" text,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "study_code" text,
  "vial_id" uuid,
  "substrate_conc_g_l" numeric,
  "ks_half_sat" numeric,
  "yx_s_yield_coeff" numeric,
  "qp_spec_prod_rate" numeric,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."rbac_matrix" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "role_name" text NOT NULL,
  "module_name" text NOT NULL,
  "can_read" boolean DEFAULT true,
  "can_write" boolean DEFAULT false,
  "can_delete" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."purchase_requests" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "item_id" uuid,
  "item_name" text NOT NULL,
  "requested_quantity" numeric NOT NULL,
  "unit" text DEFAULT '',
  "reason" text,
  "urgency" text DEFAULT 'Normal',
  "requested_by" uuid,
  "status" text DEFAULT 'Pending',
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."edit_requests" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "record_id" uuid NOT NULL,
  "record_type" text NOT NULL,
  "requested_by" uuid,
  "reason" text,
  "status" text DEFAULT 'pending',
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."bioprocess_experiments" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "title" text NOT NULL,
  "description" text,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'setup',
  "response_variable" text DEFAULT 'OD600 at 24h',
  "response_unit" text DEFAULT '',
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "analysis_result" jsonb,
  "config" jsonb,
  "batch_id" uuid,
  "sop_id" uuid,
  "updated_by" uuid
);

CREATE TABLE public."stability_timepoints" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "study_id" uuid,
  "timepoint_days" integer NOT NULL,
  "test_results" jsonb,
  "evidence_photo_url" text,
  "is_oos" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."batch_costs" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "batch_id" uuid,
  "material_costs" numeric DEFAULT 0,
  "labor_costs" numeric DEFAULT 0,
  "overhead_costs" numeric DEFAULT 0,
  "total_cost" numeric DEFAULT 0,
  "calculated_at" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."bioprocess_kinetics_data" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "experiment_id" uuid,
  "series_label" text,
  "substrate" numeric,
  "rate" numeric,
  "time_h" numeric,
  "biomass" numeric,
  "product" numeric,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."test_results" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "sample_id" uuid NOT NULL,
  "test_type" text NOT NULL,
  "numeric_value" numeric,
  "text_value" text,
  "unit" text,
  "skipped" boolean NOT NULL DEFAULT false,
  "skip_reason" text,
  "detail" jsonb,
  "synced_fermentation_reading_id" uuid,
  "synced_growth_measurement_id" uuid,
  "synced_incubation_record_id" uuid,
  "entered_by" uuid,
  "entered_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."chat_logs" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "employee_id" uuid,
  "employee_role" text,
  "user_message" text NOT NULL,
  "assistant_response" text NOT NULL,
  "tools_called" jsonb,
  "tool_results" jsonb,
  "intent_router_hit" boolean DEFAULT false,
  "intent_name" text,
  "model_used" text DEFAULT 'claude-haiku-4-5',
  "response_time_ms" integer,
  "conversation_length" integer DEFAULT 1,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batch_flasks" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "flask_label" text NOT NULL,
  "flask_full_id" text NOT NULL,
  "status" text DEFAULT 'active',
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "current_stage" text DEFAULT 'inoculation',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."vendors" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "name" text NOT NULL,
  "category" text,
  "status" text DEFAULT 'Approved',
  "contact_info" jsonb,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "address" text,
  "contact_person" text,
  "phone" text,
  "payment_terms" text,
  "lead_time" text,
  "email" text,
  "qualification_status" text DEFAULT 'Unqualified',
  "qualified_at" date,
  "qualification_notes" text,
  "audit_due_date" date,
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."system_health_log" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "date" date NOT NULL,
  "active_employees" integer DEFAULT 0,
  "attendance_today" integer DEFAULT 0,
  "active_batches" integer DEFAULT 0,
  "open_deviations" integer DEFAULT 0,
  "total_documents" integer DEFAULT 0,
  "status" text,
  "timestamp" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."inventory_dashboard" (
  "stock_id" uuid PRIMARY KEY,
  "item_id" uuid PRIMARY KEY,
  "item_code" character varying,
  "item_name" text,
  "category" text,
  "unit" text,
  "lot_number" text,
  "current_quantity" numeric,
  "received_quantity" numeric,
  "min_stock_level" numeric,
  "status" text,
  "expiry_date" date,
  "location" text,
  "vendor_name" text,
  "received_at" timestamp with time zone,
  "days_to_expiry" integer,
  "health_status" text
);

CREATE TABLE public."rnd_experiments" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "experiment_id" text NOT NULL,
  "title" text NOT NULL,
  "target_volume_ml" numeric,
  "target_ph" numeric,
  "target_brix" numeric,
  "notes" text,
  "status" text NOT NULL DEFAULT 'pending_review',
  "created_by" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."activity_log" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "employee_id" uuid,
  "log_date" date,
  "batch_id" uuid,
  "activity_description" text NOT NULL,
  "start_time" time without time zone,
  "end_time" time without time zone,
  "issue_observed" boolean DEFAULT false,
  "issue_description" text,
  "founder_comment" text,
  "reviewed_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "severity" text DEFAULT 'normal',
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batches" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" text,
  "variant" text,
  "start_time" timestamp with time zone,
  "volume_litres" numeric,
  "probiotic_strain" text,
  "status" text,
  "notes" text,
  "released_by" uuid,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "current_stage" text DEFAULT 'media_prep',
  "process_flow" jsonb,
  "formulation_id" uuid,
  "equipment_id" uuid,
  "created_by" uuid,
  "experiment_type" text,
  "sku_target" text,
  "planned_volume_ml" numeric,
  "num_flasks" integer DEFAULT 3,
  "assigned_team" uuid[],
  "planned_start_date" date,
  "product_name" text,
  "bmr_url" text,
  "has_alarm" boolean DEFAULT false,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."ip_whitelist" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "cidr_block" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."equipment_tickets" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "equipment_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "severity" text DEFAULT 'Medium',
  "status" text DEFAULT 'Open',
  "reported_by" uuid,
  "resolved_by" uuid,
  "resolution_notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "resolved_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."inventory_stock" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "item_id" uuid,
  "vendor_id" uuid,
  "supplier_batch_number" text,
  "received_quantity" numeric NOT NULL,
  "current_quantity" numeric NOT NULL,
  "expiry_date" date,
  "location" text,
  "status" text DEFAULT 'Available',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "purchase_order_number" character varying,
  "invoice_ref" character varying,
  "condition_on_arrival" character varying,
  "sds_url" text,
  "coa_url" text,
  "notes" text,
  "mispunch_status" text,
  "qc_status" text DEFAULT 'Quarantine',
  "qc_released_by" uuid,
  "qc_released_at" timestamp with time zone,
  "qc_notes" text,
  "sampling_method" text,
  "identity_test_result" text,
  "quarantine_location" text,
  "quarantine_rack" text,
  "rejection_reason" text,
  "rejected_at" timestamp with time zone,
  "rejected_by" uuid,
  "received_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."pending_changes" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "table_name" text NOT NULL,
  "record_id" uuid NOT NULL,
  "module_label" text,
  "change_type" text NOT NULL DEFAULT 'edit',
  "requested_by" uuid NOT NULL,
  "original_data" jsonb NOT NULL,
  "proposed_data" jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "review_note" text,
  "reviewed_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "reviewed_at" timestamp with time zone,
  "requires_qa_review" boolean DEFAULT false,
  "qa_approved_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."user_preferences" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "user_id" uuid,
  "dashboard_layout" jsonb,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."chats" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "name" text,
  "type" text DEFAULT 'individual',
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."lookup_categories" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "type" character varying NOT NULL,
  "name" character varying NOT NULL,
  "color" character varying,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."sop_acknowledgements" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "sop_id" uuid,
  "employee_id" uuid,
  "acknowledged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "signature_text" text,
  "ip_address" text,
  "user_agent" text,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."chat_retention_policies" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "context_type" text NOT NULL,
  "retention_days" integer NOT NULL,
  "auto_archive" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."hr_expenses" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "employee_id" uuid,
  "title" text NOT NULL,
  "amount" numeric NOT NULL,
  "receipt_url" text,
  "status" text DEFAULT 'Pending',
  "payslip_id" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."samples" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_label" text,
  "flask_id" uuid,
  "flask_label" text,
  "log_hour" numeric,
  "timepoint_label" text,
  "sample_label" text NOT NULL,
  "collected_by" uuid,
  "collected_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "status" text NOT NULL DEFAULT 'pending',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "created_by" uuid,
  "laf_cabinet_used" boolean DEFAULT false,
  "contamination_incident" boolean DEFAULT false,
  "contamination_details" text,
  "reagents_used" jsonb,
  "cold_storage_temp_c" numeric,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batch_flask_endpoints" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "flask_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "total_hours" numeric,
  "final_ph" numeric,
  "aroma" text,
  "colour_desc" text,
  "texture" text,
  "sensory_overall" text,
  "gram_stain" text,
  "notes" text,
  "declared_by" uuid,
  "declared_at" timestamp with time zone DEFAULT 'now()',
  "titratable_acidity_pct" numeric,
  "gram_stain_image_url" text,
  "end_time" timestamp with time zone,
  "edited_at" timestamp with time zone,
  "edited_by" uuid,
  "edit_reason" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid
);

CREATE TABLE public."batch_stage_downstream" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "steps" jsonb,
  "final_concentration" text,
  "moisture_pct" numeric,
  "final_weight_kg" numeric,
  "temp_range_c" text,
  "packaging_type" text,
  "operator_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "flask_id" uuid,
  "fill_weight_g" numeric,
  "units_produced" integer,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."stock_qc_releases" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "stock_id" uuid NOT NULL,
  "action" text NOT NULL,
  "actioned_by" uuid NOT NULL,
  "actioned_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "notes" text,
  "previous_status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."shelf_life_studies" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "storage_condition" text,
  "test_parameters" jsonb,
  "status" text DEFAULT 'In Progress',
  "created_by" uuid,
  "start_date" date DEFAULT CURRENT_DATE,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "expiry_date" date,
  "flask_id" text,
  "study_type" text DEFAULT 'Realtime',
  "temperature_c" numeric,
  "accel_temp_c" numeric,
  "q10_factor" numeric DEFAULT 2,
  "projected_expiry_date" date,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."product_development_formulations" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid NOT NULL,
  "target_volume_ml" numeric,
  "target_ph" numeric,
  "target_brix" numeric,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."tasks" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "title" text NOT NULL,
  "description" text,
  "assigned_to" uuid,
  "assigned_by" uuid,
  "due_date" date,
  "priority" text,
  "status" text,
  "completion_note" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "checklist" jsonb,
  "approval_status" text DEFAULT 'not_required',
  "proof_url" text,
  "time_started_at" timestamp with time zone,
  "logged_minutes" integer DEFAULT 0,
  "is_personal_reminder" boolean DEFAULT false,
  "batch_id" uuid,
  "progress_percentage" integer DEFAULT 0,
  "progress_logs" jsonb,
  "is_acknowledged" boolean DEFAULT false,
  "acknowledged_at" timestamp with time zone,
  "progressed_at" timestamp with time zone,
  "created_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "recurrence_rule" text,
  "parent_task_id" uuid,
  "group_role_target" text,
  "sop_id" uuid,
  "is_routine" boolean DEFAULT false,
  "routine_interval" text,
  "completed_by" uuid,
  "esignature_used" boolean DEFAULT false,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."leave_applications" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "employee_id" uuid,
  "leave_type" text,
  "start_date" date,
  "end_date" date,
  "total_days" integer,
  "reason" text,
  "status" text,
  "admin_comment" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "rejection_reason" text,
  "lop_days" numeric DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."predictive_models" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "model_name" text NOT NULL,
  "version" text NOT NULL,
  "target_variable" text NOT NULL,
  "confidence_interval" numeric,
  "feature_weights" jsonb,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."batch_flask_straining" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "flask_id" uuid,
  "batch_id" uuid,
  "method" text,
  "pre_straining_vol_ml" numeric,
  "post_straining_vol_ml" numeric,
  "recovery_pct" numeric,
  "straining_temp" text,
  "filtrate_colour" text,
  "filtrate_clarity" text,
  "filtrate_ph" numeric,
  "operator_id" uuid,
  "supervised_by" uuid,
  "notes" text,
  "centrifuge_rpm" numeric,
  "centrifuge_temp_c" numeric,
  "centrifuge_duration_min" numeric,
  "broth_wt_before_g" numeric,
  "supernatant_wt_after_g" numeric,
  "pellet_wt_g" numeric,
  "centrifuge_equipment_id" uuid,
  "ph_meter_equipment_id" uuid,
  "scale_equipment_id" uuid,
  "rotor_radius_cm" numeric,
  "pass2_rpm" numeric,
  "pass2_duration_min" numeric,
  "pass2_temp_c" numeric,
  "turbidity_ntu" numeric,
  "pellet_resuspension_buffer" text,
  "pellet_resuspension_vol_ml" numeric,
  "hold_time_before_centrifuge_min" numeric,
  "wash_steps" integer DEFAULT 0,
  "wash_buffer" text,
  "wash_volume_ml" numeric,
  "post_centrifuge_viability_pct" numeric,
  "viability_method" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid,
  "freezing_time_hrs" numeric,
  "thawing_time_hrs" numeric,
  "straining_wt_after_g" numeric,
  "straining_pellet_wet_wt_g" numeric,
  "straining_sup_collected_ml" numeric,
  "centrifuge_spins_count" integer,
  "centrifuge_broth_obtained_ml" numeric,
  "centrifuge_pellet_wet_wt_g" numeric,
  "total_weight_obtained_g" numeric,
  "drying_temp_c" numeric,
  "drying_duration_hrs" numeric,
  "dry_pellet_wt_g" numeric,
  "storage_broth_details" text,
  "storage_pellet_details" text
);

CREATE TABLE public."batch_flask_rejection_record" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "flask_id" uuid,
  "rejected_by" uuid,
  "rejected_at" timestamp with time zone DEFAULT 'now()',
  "rejection_reason" text,
  "rejection_stage" text,
  "disposal_method" text,
  "write_off_vol_ml" numeric,
  "capa_required" boolean DEFAULT false,
  "notes" text,
  "supplier_defect" boolean DEFAULT false,
  "implicated_lot_id" uuid,
  "batch_id" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."sop_targets" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "sop_id" uuid,
  "target_role" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."employees" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "email" text NOT NULL,
  "full_name" text NOT NULL,
  "role" text,
  "department" text,
  "phone" text,
  "joined_date" date,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "push_subscription" jsonb,
  "employee_code" text,
  "designation" text,
  "date_of_birth" date,
  "address" text,
  "blood_group" text,
  "emergency_contact" text,
  "emergency_contact_name" text,
  "photo_url" text,
  "verification_token" text DEFAULT '(gen_random_uuid())',
  "base_salary" numeric DEFAULT 0,
  "casual_leave_balance" integer DEFAULT 12,
  "medical_leave_balance" integer DEFAULT 6,
  "earned_leave_balance" integer DEFAULT 15,
  "initials" text,
  "custom_permissions" jsonb,
  "shift_id" uuid,
  "comp_off_balance" numeric DEFAULT 0,
  "esignature_pin_hash" text,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."shelf_life_logs" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "study_id" uuid NOT NULL,
  "day_number" integer NOT NULL,
  "test_data" jsonb NOT NULL,
  "logged_by" uuid,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "created_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."sample_incubation_records" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "sample_name" text NOT NULL,
  "sample_category" text,
  "sample_type" text,
  "incubation_date" date DEFAULT CURRENT_DATE,
  "incubation_temp_c" numeric,
  "start_time" timestamp with time zone,
  "end_time" timestamp with time zone,
  "duration_hours" numeric,
  "od_value" numeric,
  "ph_value" numeric,
  "staining_method" text,
  "microscopic_morphology" text,
  "colony_morphology" text,
  "sterility_status" text,
  "observation" text,
  "logged_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "flask_id" uuid,
  "qc_sample_id" uuid,
  "source_stage" text,
  "source_type" text,
  "sampled_at" timestamp with time zone,
  "colony_count" integer,
  "cfu_per_ml" numeric,
  "cell_bank_preparation_id" uuid,
  "media_used" text,
  "fermentation_reading_id" uuid,
  "lab_bench_sample_id" uuid,
  "source_id" text,
  "source_label" text,
  "log_hour" numeric,
  "timepoint_label" text,
  "plate_label" text,
  "plate_index" integer,
  "plate_total" integer,
  "dilution_factor" numeric,
  "volume_plated_ml" numeric,
  "replicate_label" text,
  "media_lot" text,
  "plate_image_url" text,
  "is_duplicate" boolean DEFAULT false,
  "media_inventory_item_id" uuid,
  "media_volume_used_ml" numeric,
  "manual_entry_no" text,
  "formulation_id" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid,
  "seed_passage_id" uuid
);

CREATE TABLE public."growth_plate_observations" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "study_id" uuid NOT NULL,
  "time_point_id" uuid,
  "time_point_hours" numeric NOT NULL,
  "plate_media" text,
  "dilution" text,
  "observation_type" text NOT NULL DEFAULT 'colony_count',
  "incubation_temp_c" numeric,
  "incubation_hours" integer,
  "colony_count" integer,
  "colony_morphology" text,
  "colony_color" text,
  "result" text,
  "image_url" text,
  "notes" text,
  "recorded_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batch_flask_inoculations" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "flask_id" uuid,
  "batch_id" uuid,
  "inoculum_source" text,
  "inoculum_vol_ml" numeric,
  "planned_fermentation_hrs" numeric,
  "t_zero_time" timestamp with time zone,
  "transfer_method" text,
  "contamination_check" text,
  "contamination_notes" text,
  "laf_used" boolean,
  "operator_id" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "cell_bank_vial_id" uuid,
  "inoculum_source_type" text DEFAULT 'other',
  "capa_deviation_id" uuid,
  "pre_inocu_ph" numeric,
  "sampling_plan_hrs" text[],
  "flask_temp_c" numeric,
  "back_slop_ratio_pct" numeric,
  "co_starters" jsonb,
  "inoculum_viability_pct" numeric,
  "inoculum_viability_method" text,
  "post_inocu_ph_15min" numeric,
  "back_slop_source_batch_id" text,
  "back_slop_final_ph" numeric,
  "back_slop_final_ta_pct" numeric,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."sops" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "file_url" text NOT NULL,
  "version" text DEFAULT '1.0',
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "next_review_date" date,
  "lifecycle_status" text DEFAULT 'Published',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."inventory_movements" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "stock_id" uuid,
  "type" character varying NOT NULL,
  "quantity" numeric NOT NULL,
  "purpose" character varying,
  "notes" text,
  "issued_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT 'timezone('utc'::text, now())',
  "batch_id" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."released_employee_codes" (
  "id" integer NOT NULL PRIMARY KEY,
  "employee_code" text NOT NULL,
  "released_at" timestamp with time zone DEFAULT 'now()',
  "released_by" uuid,
  "reason" text DEFAULT 'designation_change',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."emp_samples" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "location_id" uuid,
  "sampled_by" uuid,
  "sampled_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "incubation_temp_c" numeric,
  "incubation_hours" integer DEFAULT 48,
  "colony_count" integer,
  "organism_identified" text,
  "result" text DEFAULT 'Pending',
  "notes" text,
  "capa_deviation_id" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."inventory_stock_consumables" (
  "stock_id" uuid PRIMARY KEY,
  "item_id" uuid,
  "item_name" text,
  "category" text,
  "unit" text,
  "lot_number" text,
  "current_quantity" numeric,
  "status" text,
  "expiry_date" date,
  "vendor_name" text
);

CREATE TABLE public."inventory_items" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "unit" text NOT NULL,
  "min_stock_level" numeric DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "sub_category" character varying,
  "storage_condition" character varying,
  "preferred_supplier" uuid,
  "hazardous" boolean DEFAULT false,
  "cold_chain_required" boolean DEFAULT false,
  "coa_required" boolean DEFAULT false,
  "allergen" boolean DEFAULT false,
  "organic_certified" character varying,
  "item_code" character varying,
  "created_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."customer_complaints" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "customer_name" text NOT NULL,
  "product_batch" uuid,
  "complaint_details" text NOT NULL,
  "capa_id" uuid,
  "status" text DEFAULT 'Open',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "logged_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batch_number_sequences" (
  "year" integer NOT NULL PRIMARY KEY,
  "month" integer NOT NULL PRIMARY KEY,
  "last_seq" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."chat_attachments" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "message_id" uuid,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "encryption_status" text DEFAULT 'Unencrypted',
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."inventory_usage" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "stock_id" uuid,
  "batch_id" uuid,
  "quantity_used" numeric NOT NULL,
  "logged_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "growth_study_id" uuid,
  "stage" text,
  "notes" text,
  "cell_bank_prep_id" uuid,
  "vial_id" uuid,
  "equipment_id" uuid,
  "ticket_id" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."cell_bank_vials" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "preparation_id" uuid NOT NULL,
  "vial_code" text NOT NULL,
  "storage_temp" text DEFAULT '-20°C',
  "freezer_id" text,
  "rack" text,
  "box" text,
  "position" text,
  "status" text DEFAULT 'Available',
  "used_in_batch_id" uuid,
  "used_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "used_in_study_id" uuid,
  "volume_ml" numeric,
  "expires_at" date,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."growth_measurements" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "study_id" uuid NOT NULL,
  "time_point_id" uuid,
  "actual_hour" numeric NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT 'now()',
  "od_value" numeric,
  "ph_value" numeric,
  "temperature_actual_c" numeric,
  "glucose_g_l" numeric,
  "protein_mg_ml" numeric,
  "dissolved_oxygen_pct" numeric,
  "dry_cell_weight_g_l" numeric,
  "wet_cell_weight_g_l" numeric,
  "product_value" numeric,
  "product_unit" text,
  "culture_turbidity" text,
  "culture_color" text,
  "notes" text,
  "recorded_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "acetate_mmol_l" numeric,
  "propionate_mmol_l" numeric,
  "butyrate_mmol_l" numeric,
  "test_temperature_c" numeric,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."inventory_alerts" (
  "stock_id" uuid PRIMARY KEY,
  "item_id" uuid PRIMARY KEY,
  "item_code" character varying,
  "item_name" text,
  "category" text,
  "unit" text,
  "lot_number" text,
  "current_quantity" numeric,
  "received_quantity" numeric,
  "min_stock_level" numeric,
  "status" text,
  "expiry_date" date,
  "location" text,
  "vendor_name" text,
  "received_at" timestamp with time zone,
  "days_to_expiry" integer,
  "health_status" text
);

CREATE TABLE public."scada_streams" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "equipment_id" uuid,
  "batch_id" uuid,
  "sensor_type" text NOT NULL,
  "sensor_value" numeric NOT NULL,
  "unit" text,
  "timestamp" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."product_development_ingredients" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "formulation_id" uuid NOT NULL,
  "stock_id" uuid,
  "item_name" text,
  "amount" numeric NOT NULL,
  "unit" text,
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."leave_encashments" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "employee_id" uuid,
  "leave_type" text NOT NULL,
  "days_encashed" numeric NOT NULL,
  "amount" numeric NOT NULL,
  "status" text DEFAULT 'Pending',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."system_audit_logs" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "table_name" text NOT NULL,
  "record_id" text NOT NULL,
  "action" text NOT NULL,
  "old_data" jsonb,
  "new_data" jsonb,
  "changed_by" uuid,
  "changed_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "reason" text
);

CREATE TABLE public."attendance_log" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "employee_id" uuid,
  "date" date,
  "check_in_time" timestamp with time zone,
  "check_out_time" timestamp with time zone,
  "total_hours" numeric,
  "notes" text,
  "manual_entry" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "location_lat" numeric,
  "location_lng" numeric,
  "photo_url" text,
  "in_geofence" boolean,
  "mispunch_status" text,
  "mispunch_requested_hours" numeric DEFAULT 0,
  "mispunch_reason" text,
  "mispunch_remark" text,
  "overtime_hours" numeric DEFAULT 0,
  "locked" boolean DEFAULT false,
  "manager_signoff_by" uuid,
  "manager_signoff_at" timestamp with time zone,
  "liveness_score" numeric,
  "face_match_score" numeric,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."hr_tax_profiles" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "employee_id" uuid,
  "pan_number" text,
  "uan_number" text,
  "esi_number" text,
  "pf_applicable" boolean DEFAULT true,
  "esi_applicable" boolean DEFAULT false,
  "pt_applicable" boolean DEFAULT true,
  "tds_percentage" numeric DEFAULT 0,
  "standard_deduction" numeric DEFAULT 50000,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."cell_bank_strains" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "name" text NOT NULL,
  "source_type" text NOT NULL DEFAULT 'MTCC',
  "accession_number" text,
  "isolation_source" text,
  "received_date" date,
  "taxonomy" text,
  "status" text DEFAULT 'Active',
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "strain_short_code" text,
  "formulation_id" uuid,
  "characterization" jsonb,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."aql_sampling_plans" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "item_id" uuid,
  "aql_level" text DEFAULT 'II',
  "sample_size_pct" numeric DEFAULT 10,
  "accept_number" integer DEFAULT 0,
  "reject_number" integer DEFAULT 1,
  "tests_required" text[],
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."taste_panels" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "session_title" text NOT NULL,
  "panelist_count" integer DEFAULT 0,
  "sample_ids" text,
  "test_criteria" jsonb,
  "avg_score" numeric DEFAULT 0,
  "scores" jsonb,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "batch_id" uuid,
  "created_by" uuid,
  "scores_history" jsonb NOT NULL,
  "flask_id" text,
  "pass_thresholds" jsonb,
  "attribute_comments" jsonb,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."scale_down_models" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "bench_scale_batch_id" uuid,
  "production_scale_batch_id" uuid,
  "scaling_factor" numeric NOT NULL,
  "comparability_score" numeric,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."lab_logs" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "batch_id" uuid,
  "process_type" text NOT NULL,
  "parameter_name" text NOT NULL,
  "parameter_value" numeric NOT NULL,
  "logged_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."bioprocess_statistics" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "experiment_id" uuid,
  "anova_results" jsonb,
  "r_squared" numeric,
  "doe_matrix" jsonb,
  "contour_plot_data" jsonb,
  "calculated_at" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."bioprocess_factors" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "experiment_id" uuid,
  "position" integer NOT NULL,
  "code" text NOT NULL,
  "variable" text NOT NULL,
  "unit" text,
  "low_value" numeric NOT NULL,
  "center_value" numeric,
  "high_value" numeric NOT NULL,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."system_logs" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "event_type" text NOT NULL,
  "event_details" jsonb,
  "user_id" uuid,
  "ip_address" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."lab_notebook_entries" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "title" text NOT NULL,
  "objective" text,
  "methodology" text,
  "observations" text,
  "conclusions" text,
  "status" text DEFAULT 'Draft',
  "batch_id" uuid,
  "created_by" uuid,
  "countersigned_by" uuid,
  "countersigned_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "attachment_url" text,
  "flask_id" uuid,
  "batch_stage" text,
  "stage_snapshots" jsonb,
  "cell_bank_preparation_id" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "entry_version" integer DEFAULT 1,
  "previous_version_id" uuid,
  "sop_references" text[],
  "sketch_url" text,
  "sop_ids" uuid[],
  "updated_by" uuid
);

CREATE TABLE public."batch_fermentation_readings" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "flask_id" uuid,
  "batch_id" uuid,
  "flask_label" text,
  "logged_at" timestamp with time zone DEFAULT 'now()',
  "elapsed_hours" numeric,
  "ph" numeric,
  "incubator_temp_c" numeric,
  "foam_level" text,
  "visual_appearance" text,
  "is_ph_alarm" boolean DEFAULT false,
  "is_temp_alarm" boolean DEFAULT false,
  "logged_by" uuid,
  "supervised_by" uuid,
  "is_retrospective" boolean DEFAULT false,
  "retro_reason" text,
  "notes" text,
  "brix" numeric,
  "optical_density" numeric,
  "plating_result" text,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "edit_reason" text,
  "incubator_equipment_id" uuid,
  "edited_at" timestamp with time zone,
  "edited_by" uuid,
  "plating_done" boolean NOT NULL DEFAULT false,
  "plating_status" text NOT NULL DEFAULT 'not_done',
  "plating_config" jsonb NOT NULL,
  "sample_incubation_id" uuid,
  "titratable_acidity_pct" numeric,
  "co2_observed" text,
  "ethanol_pct" numeric,
  "do_percent" numeric,
  "co2_pressure_kpa" numeric,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."batch_fermentation_feeds" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "feed_type" text,
  "stock_id" uuid,
  "volume_ml" numeric,
  "reason" text,
  "logged_by" uuid,
  "logged_at" timestamp with time zone DEFAULT 'now()',
  "flask_id" uuid,
  "ph_before" numeric,
  "ph_after" numeric,
  "flask_label" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."payslips" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "employee_id" uuid,
  "month" text,
  "year" integer,
  "gross_salary" numeric,
  "pf_deduction" numeric,
  "esi_deduction" numeric,
  "net_salary" numeric,
  "payslip_url" text,
  "uploaded_by" uuid,
  "uploaded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "lop_days" numeric DEFAULT 0,
  "working_days" numeric DEFAULT 0,
  "is_auto_generated" boolean DEFAULT false,
  "pt_deduction" numeric DEFAULT 0,
  "tds_deduction" numeric DEFAULT 0,
  "reimbursements" numeric DEFAULT 0,
  "net_payable" numeric DEFAULT 0,
  "is_exported" boolean DEFAULT false,
  "total_hours_worked" numeric,
  "admin_notes" text,
  "override_lop_days" numeric,
  "period_start" date,
  "period_end" date,
  "base_salary" numeric,
  "lop_deduction" numeric,
  "total_working_days" integer,
  "present_days" integer,
  "approved_leave_days" numeric,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."investigations" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "deviation_id" uuid,
  "why_1" text,
  "why_2" text,
  "why_3" text,
  "why_4" text,
  "why_5" text,
  "root_cause_identified" text,
  "investigator_id" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."formulations" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "ingredients" text,
  "notes" text,
  "version" integer DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "base_version_id" uuid,
  "status" text DEFAULT 'active',
  "steps" jsonb,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "rejection_reason" text,
  "search_vector" tsvector,
  "category" text DEFAULT 'Fermentation',
  "base_volume_ml" numeric NOT NULL DEFAULT 1000,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "nutritional_info" jsonb,
  "yield_predicted_ml" numeric,
  "regulatory_claims" text[],
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."hr_holidays" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "name" text NOT NULL,
  "holiday_date" date NOT NULL,
  "is_mandatory" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."cell_bank_vial_logs" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "vial_id" uuid NOT NULL,
  "action" text NOT NULL,
  "batch_id" uuid,
  "flask_id" uuid,
  "operator_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "study_id" uuid,
  "cell_bank_prep_id" uuid,
  "volume_used_ml" numeric,
  "recovery_pct" numeric,
  "destination" text,
  "thaw_temp_c" numeric,
  "thaw_duration_min" numeric,
  "thaw_media" text,
  "carrier" text,
  "transit_temp_c" numeric,
  "transit_days" integer,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."regulatory_milestones" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "title" text NOT NULL,
  "category" text,
  "deadline" date,
  "status" text DEFAULT 'Pending',
  "priority" text DEFAULT 'High',
  "description" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."sso_configurations" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "provider_name" text NOT NULL,
  "client_id" text NOT NULL,
  "client_secret" text,
  "domain_hint" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."messages" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "chat_id" uuid,
  "sender_id" uuid,
  "content" text,
  "image_url" text,
  "pinned_item_type" text DEFAULT 'none',
  "pinned_item_id" text,
  "mentions" uuid[],
  "read_by" uuid[],
  "created_at" timestamp with time zone DEFAULT 'now()',
  "is_edited" boolean DEFAULT false,
  "is_deleted" boolean DEFAULT false,
  "reply_to_id" uuid,
  "attachment_url" text,
  "attachment_name" text,
  "attachment_type" text,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."lot_number_sequences" (
  "year" integer NOT NULL PRIMARY KEY,
  "month" integer NOT NULL PRIMARY KEY,
  "last_seq" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."ph_readings" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "logged_by" uuid,
  "ph_value" numeric,
  "time_elapsed_hours" numeric,
  "is_deviation" boolean DEFAULT false,
  "deviation_acknowledged" boolean DEFAULT false,
  "acknowledged_by" uuid,
  "acknowledged_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."rnd_experiment_ingredients" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "experiment_id" uuid NOT NULL,
  "stock_id" uuid,
  "item_name" text,
  "amount" numeric NOT NULL,
  "unit" text,
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."scale_up_records" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "bench_scale_batch_id" uuid,
  "production_scale_batch_id" uuid,
  "created_by" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."growth_study_time_points" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "study_id" uuid NOT NULL,
  "planned_hour" numeric NOT NULL,
  "sample_types" text[] NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "notification_sent" boolean DEFAULT false,
  "scheduled_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."emp_sampling_locations" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "name" text NOT NULL,
  "area" text NOT NULL,
  "location_code" text,
  "sampling_method" text,
  "frequency" text DEFAULT 'Weekly',
  "alert_limit_cfu" numeric,
  "action_limit_cfu" numeric,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."documents" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "title" text NOT NULL,
  "category" text,
  "file_url" text,
  "file_name" text,
  "uploaded_by" uuid,
  "version" text,
  "effective_date" date,
  "expiry_date" date,
  "access_level" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."batch_qc_holds" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "batch_id" uuid,
  "flask_id" uuid,
  "hold_reason" text,
  "released_by" uuid,
  "released_at" timestamp with time zone,
  "status" text DEFAULT 'Pending',
  "created_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."titration_logs" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "source_type" text NOT NULL DEFAULT 'standalone',
  "source_id" uuid,
  "source_label" text,
  "sample_name" text NOT NULL,
  "sample_description" text,
  "sampled_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "elapsed_hours" numeric,
  "acid_type" text NOT NULL DEFAULT 'Lactic Acid',
  "equivalent_weight" numeric NOT NULL DEFAULT 90.08,
  "titrant_normality" numeric NOT NULL DEFAULT 0.1,
  "sample_volume_ml" numeric NOT NULL,
  "initial_burette_ml" numeric NOT NULL DEFAULT 0,
  "final_burette_ml" numeric NOT NULL,
  "titrant_volume_ml" numeric,
  "ta_percent" numeric,
  "notes" text,
  "logged_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "inventory_item_id" uuid,
  "concordant_enabled" boolean DEFAULT false,
  "initial_burette_2_ml" numeric,
  "final_burette_2_ml" numeric,
  "mean_ta_percent" numeric
);

CREATE TABLE public."chat_members" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "chat_id" uuid,
  "employee_id" uuid,
  "role" text DEFAULT 'member',
  "joined_at" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."calibration_logs" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "equipment_id" uuid,
  "calibration_date" date DEFAULT CURRENT_DATE,
  "next_due_date" date,
  "result" text,
  "certificate_url" text,
  "logged_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "buffer_values_used" text,
  "log_type" text DEFAULT 'Calibration',
  "status" text DEFAULT 'Operational',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."seed_passages" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "target_type" text NOT NULL,
  "target_batch_id" uuid,
  "target_growth_study_id" uuid,
  "passage_number" integer NOT NULL,
  "vial_id" uuid,
  "source_passage_id" uuid,
  "media_name" text,
  "media_volume_ml" numeric,
  "inoculum_volume_ml" numeric,
  "incubation_temperature_c" numeric,
  "incubation_agitation_rpm" numeric,
  "start_time" timestamp with time zone,
  "target_od" numeric,
  "target_ph" numeric,
  "status" text DEFAULT 'in_progress',
  "completion_time" timestamp with time zone,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()'
);

CREATE TABLE public."inventory" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "item_name" text NOT NULL,
  "category" text,
  "quantity" numeric DEFAULT 0,
  "unit" text NOT NULL,
  "minimum_threshold" numeric DEFAULT 0,
  "last_restocked" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."equipment" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "name" text NOT NULL,
  "model" text,
  "serial_number" text,
  "calibration_due_date" date,
  "status" text DEFAULT 'Operational',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "iq_doc_url" text,
  "oq_doc_url" text,
  "pq_doc_url" text,
  "requires_calibration" boolean NOT NULL DEFAULT false,
  "registered_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid,
  "pm_frequency_days" integer,
  "next_pm_date" date
);

CREATE TABLE public."sop_library" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "sop_id" text NOT NULL,
  "title" text NOT NULL,
  "category" text,
  "version" text,
  "effective_date" date,
  "approved_by" uuid,
  "document_url" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "quiz_data" jsonb,
  "target_roles" text[],
  "target_departments" text[],
  "target_employees" uuid[],
  "uploaded_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."batch_stage_sterilisation" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "method" text,
  "equipment_id" uuid,
  "cycle_temp_c" numeric,
  "cycle_pressure_bar" numeric,
  "hold_time_min" numeric,
  "f0_value" numeric,
  "cycle_start" timestamp with time zone,
  "cycle_end" timestamp with time zone,
  "pass_fail" text,
  "printout_url" text,
  "operator_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "autoclave_tape" text,
  "bi_used" boolean DEFAULT false,
  "bi_result" text,
  "bi_incubation_date" date,
  "capa_deviation_id" uuid,
  "cycle2_temp_c" numeric,
  "cycle2_hold_min" numeric,
  "cycle2_start" timestamp with time zone,
  "cycle2_end" timestamp with time zone,
  "cycle2_tape" text,
  "cooling_time_min" numeric,
  "steam_quality_check" text,
  "condensate_check" text,
  "load_description" text,
  "load_total_volume_ml" numeric,
  "flask_sizes" text[],
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."app_settings" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "key" character varying NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid
);

CREATE TABLE public."api_keys" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "key_name" text NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" jsonb,
  "is_revoked" boolean DEFAULT false,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."cell_bank_preparations" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "strain_id" uuid NOT NULL,
  "type" text NOT NULL,
  "parent_id" uuid,
  "prep_code" text NOT NULL,
  "status" text DEFAULT 'In Progress',
  "passage_number" integer DEFAULT 1,
  "step_data" jsonb,
  "vial_count" integer DEFAULT 0,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "completed_at" timestamp with time zone,
  "formulation_id" uuid,
  "source_vial_id" uuid,
  "qc_released" boolean DEFAULT false,
  "qc_released_by" uuid,
  "qc_released_at" timestamp with time zone,
  "stability_test_interval_months" integer DEFAULT 6,
  "last_stability_test_date" date,
  "next_stability_test_date" date,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batch_fermentation_reading_audit" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "reading_id" uuid NOT NULL,
  "changed_by" uuid,
  "reason" text NOT NULL,
  "previous_values" jsonb NOT NULL,
  "new_values" jsonb NOT NULL,
  "changed_at" timestamp with time zone NOT NULL DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."stage_transitions" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "batch_id" uuid,
  "from_stage" text,
  "to_stage" text NOT NULL,
  "changed_by" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "transitioned_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."compliance_items" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "title" text NOT NULL,
  "category" text,
  "due_date" date,
  "responsible_person" uuid,
  "status" text,
  "document_link" text,
  "notes" text,
  "is_recurring" boolean DEFAULT false,
  "recurrence" text,
  "reminder_sent" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."batch_stage_harvest" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "harvest_start" timestamp with time zone,
  "final_culture_vol_l" numeric,
  "method" text,
  "equipment_id" uuid,
  "centrifuge_rpm" numeric,
  "centrifuge_dur_min" numeric,
  "wet_cell_weight_g" numeric,
  "biomass_yield_pct" numeric,
  "harvest_temp_c" numeric,
  "cell_viability_pct" numeric,
  "volume_recovered_l" numeric,
  "operator_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "flask_id" uuid,
  "cooling_rate_c_per_min" numeric,
  "temp_at_30min" numeric,
  "temp_at_60min" numeric,
  "viability_method" text,
  "cooling_time_mins" numeric,
  "hold_temp_c" numeric,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batch_flask_release_record" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "flask_id" uuid,
  "released_by" uuid,
  "released_at" timestamp with time zone DEFAULT 'now()',
  "final_volume_ml" numeric,
  "storage_condition" text,
  "storage_location" text,
  "release_notes" text,
  "batch_id" uuid,
  "yield_volume_ml" numeric,
  "bottles_produced" integer,
  "bottle_volume_ml" numeric,
  "release_date" timestamp with time zone DEFAULT 'now()',
  "bmr_url" text,
  "formulation_id" uuid,
  "sku_name" text,
  "esig_confirmed_at" timestamp with time zone,
  "label_verified" boolean DEFAULT false,
  "label_verified_by" uuid,
  "label_batch_number" text,
  "label_mfd" date,
  "label_bbd" date,
  "pack_integrity_check" text,
  "fill_weight_g" numeric,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."hr_delegations" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "delegator_id" uuid,
  "delegatee_id" uuid,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text DEFAULT 'Active',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."shift_handovers" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "outgoing_shift_id" uuid,
  "incoming_shift_id" uuid,
  "handover_notes" text NOT NULL,
  "critical_alerts" text,
  "signed_off_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "batch_summaries" jsonb,
  "active_alarms" jsonb,
  "pending_readings" jsonb,
  "shift_date" date DEFAULT CURRENT_DATE,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."sop_quiz_results" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "quiz_id" uuid,
  "employee_id" uuid,
  "score" numeric NOT NULL,
  "passed" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."hr_shifts" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "name" text NOT NULL,
  "start_time" time without time zone NOT NULL,
  "end_time" time without time zone NOT NULL,
  "is_night_shift" boolean DEFAULT false,
  "grace_period_mins" integer DEFAULT 15,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."batch_flask_qc_tests" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "sample_id" uuid,
  "flask_id" uuid,
  "test_name" text,
  "target_spec" text,
  "result_value" text,
  "result_unit" text,
  "tested_at" timestamp with time zone,
  "pass_fail" text DEFAULT 'Pending',
  "retest_of" uuid,
  "tested_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."batch_flask_qc_samples" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "flask_id" uuid,
  "sample_id" text NOT NULL,
  "sampling_date" date,
  "sampling_operator" uuid,
  "volume_ml" numeric,
  "testing_location" text,
  "external_lab" text,
  "ext_ref_number" text,
  "sample_sent_date" date,
  "expected_date" date,
  "batch_id" uuid,
  "plating_enabled" boolean DEFAULT false,
  "plating_config" jsonb,
  "result_received_date" date,
  "coa_url" text,
  "post_packaging_tested" boolean DEFAULT false,
  "post_packaging_ph" numeric,
  "post_packaging_cfu" text,
  "packaging_type" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."capa_actions" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "investigation_id" uuid,
  "action_type" text NOT NULL,
  "task_id" uuid,
  "effectiveness_verified" boolean DEFAULT false,
  "verified_by" uuid,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."deviations" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "title" text NOT NULL,
  "severity" text NOT NULL,
  "source" text NOT NULL,
  "description" text NOT NULL,
  "reported_by" uuid,
  "status" text DEFAULT 'Open',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "batch_id" uuid,
  "flask_id" uuid,
  "equipment_id" uuid,
  "inventory_stock_id" uuid,
  "sample_incubation_id" uuid,
  "batch_stage" text,
  "root_cause" text,
  "corrective_action" text,
  "preventive_action" text,
  "closed_at" timestamp with time zone,
  "created_by" uuid,
  "grade" text DEFAULT 'Minor',
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."formulations_latest" (
  "id" uuid PRIMARY KEY,
  "code" text,
  "name" text,
  "ingredients" text,
  "notes" text,
  "version" integer,
  "created_at" timestamp with time zone,
  "created_by" uuid,
  "base_version_id" uuid,
  "status" text,
  "steps" jsonb,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "rejection_reason" text,
  "search_vector" tsvector
);

CREATE TABLE public."batch_stage_media_prep" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "batch_id" uuid,
  "formulation_id" uuid,
  "volume_prepared_l" numeric,
  "initial_ph" numeric,
  "dissolving_temp_c" numeric,
  "mixing_duration_min" numeric,
  "operator_id" uuid,
  "notes" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "ragi_lot_id" uuid,
  "ragi_weight_g" numeric,
  "ragi_moisture_pass" boolean,
  "kavuni_lot_id" uuid,
  "kavuni_weight_g" numeric,
  "kavuni_precook_temp_c" numeric,
  "kavuni_precook_min" numeric,
  "water_volume_ml" numeric,
  "total_volume_ml" numeric,
  "is_complete" boolean,
  "supervised_by" uuid,
  "scale_equipment_id" uuid,
  "ph_meter_equipment_id" uuid,
  "particle_size_mesh" text,
  "aw_value" numeric,
  "pre_treatment_steps" jsonb,
  "substrate_photo_url" text,
  "starch_gelat_temp_c" numeric,
  "starch_gelat_confirmed" boolean DEFAULT false,
  "buffer_capacity_mmol_l" numeric,
  "viscosity_cp" numeric,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."notifications" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "employee_id" uuid,
  "title" text,
  "message" text,
  "type" text,
  "is_read" boolean DEFAULT false,
  "link" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

CREATE TABLE public."system_config" (
  "id" uuid NOT NULL DEFAULT 'gen_random_uuid()' PRIMARY KEY,
  "key" character varying NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "created_at" timestamp with time zone DEFAULT 'now()',
  "created_by" uuid,
  "updated_by" uuid
);

CREATE TABLE public."internal_audits" (
  "id" uuid NOT NULL DEFAULT 'extensions.uuid_generate_v4()' PRIMARY KEY,
  "audit_title" text NOT NULL,
  "auditor_id" uuid,
  "audit_date" date,
  "status" text DEFAULT 'Planned',
  "findings" text,
  "created_at" timestamp with time zone DEFAULT 'now()',
  "updated_at" timestamp with time zone DEFAULT 'now()',
  "updated_by" uuid
);

