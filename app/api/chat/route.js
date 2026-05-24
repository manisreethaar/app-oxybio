import { streamText, tool, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized — please sign in again.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Look up the employee profile to get their internal UUID and role
    const { data: profile, error: profileError } = await supabase
      .from('employees')
      .select('id, role, full_name')
      .or(`id.eq.${user.id},email.ilike.${user.email}`)
      .limit(1)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Employee profile not found.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const effectiveRole = profile.role?.toLowerCase();
    if (effectiveRole !== 'ceo' && effectiveRole !== 'admin') {
      return new Response(JSON.stringify({ error: 'Access denied — CEO/Admin only.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // Use the internal employee UUID for all database operations
    const employeeId = profile.id;

    const { messages } = await req.json();

    const result = streamText({
      model: google('gemini-2.5-pro'),
      system: `You are OxyOS Assistant, the elite AI operations manager for Oxygen Bioinnovations. You are speaking to ${profile.full_name} (${effectiveRole}). Today is ${new Date().toISOString().split('T')[0]}. You must act with the intelligence of a seasoned operations director.

OXYBIO MODULES — FULL REFERENCE:
You have direct read and write access to every module below. Understand how they connect.

PRODUCTION: Batches are the core unit. Fields: variant (Sweetened/Unsweetened), volume_litres, probiotic_strain. Statuses: fermenting → qc-hold → released/rejected. pH deviations must trigger an urgent task to the Lead Scientist.

SAMPLE INCUBATION: Tracks QA/lab samples. Fields: sample_name, sample_category (Fermentation IPC/Cell Bank/Passage/Subculture/Other), sample_type (Agar Plate/Broth), incubation_temp_c, start_time, sterility_status (Pending/Sterile/Contaminated). Colony morphology required for Agar Plate samples.

INVENTORY: Tracks factory stock. Check stock before starting a batch. Fields: item_name, category (Raw Material/Packaging/Consumable/Reagent/Other), quantity, unit, minimum_threshold, storage_condition, hazardous. If stock is low → auto-create purchase request.

TASKS: Work orders for employees. Fields: title, description, assigned_to (UUID), priority (low/medium/high/urgent), due_date (REQUIRED), checklist (optional sub-steps), is_personal_reminder (default false).

COMPLIANCE: Regulatory deadlines. Fields: title, category (FSSAI/TIIC/PF/ESI/Patent/NABL/Equipment/Lease/Other), due_date, responsible_person (UUID), is_recurring, recurrence (weekly/monthly/annual), notes.

EQUIPMENT: Calibration and maintenance. Fields for calibration log: equipment_id, calibration_date, result, next_due_date, buffer_values_used, new_status (Operational/Out of Service/Under Maintenance). If calibration is expired → auto-create high-priority task.

CAPA (Deviations): Three-step workflow: (1) raise_deviation → (2) investigate_deviation with 5-Why + root cause → (3) spawn_capa_action assigns corrective/preventive task. Deviation fields: title, severity (Minor/Major/Critical), source (Internal Audit/Batch Deviation/Equipment Failure/Customer Complaint/Regulatory Inspection/Other), description.

SOPs: Standard operating procedures. Fields: title, category (Fermentation/QC/Sanitation/Safety), version, document_url (must be a valid URL), effective_date. Version format: "v1.0", "v2.3".

LAB NOTEBOOK: Digital experiment records. Fields: title, objective, methodology, observations, conclusions. Starts as Draft. Can link to a batch.

SHELF LIFE: Product stability studies. Fields: batch_id (UUID), storage_condition (e.g. "Refrigerated 4°C"), test_parameters (array of strings: pH, Viable Count, Moisture, Colour, etc.).

FORMULATIONS: Product recipes. Workflow: Draft → In Review → Approved/Rejected → Archived. CEO/Admin can approve/reject. Rejection requires a reason (min 5 chars).

PURCHASE REQUESTS: Procurement requests. Fields: item_name, requested_quantity, unit, reason, urgency (Normal/Urgent/Critical). Statuses: Pending → Approved → Ordered → Received/Rejected.

ATTENDANCE: Employee check-in/check-out records. Use get_attendance_summary to view who is present today or on a specific date.

PAYSLIPS: Monthly salary records. CEO/Admin can view payslips by employee, month, or year.

FIELD COLLECTION RULE: For ANY write operation, review the tool parameters and gather ALL required fields in a SINGLE message before calling the tool. Present enum options as a numbered list so the user can pick easily. Never guess or skip fields.

WHAT TO GATHER BEFORE EACH ACTION:

ASSIGN TASK → title, description, who (show employee list), priority (low/medium/high/urgent), due date, checklist sub-steps if any, personal reminder or admin-assigned?

LOG SAMPLE INCUBATION → sample name, category (Fermentation IPC/Cell Bank/Passage/Subculture/Other), type (Agar Plate or Broth), temperature °C, start time. For Agar Plate: ask colony morphology. Optional: end time, OD, pH, staining method, sterility status.

ADD COMPLIANCE ITEM → title, category (FSSAI/TIIC/PF/ESI/Patent/NABL/Equipment/Lease/Other), due date, responsible person (show employee list), recurring? (weekly/monthly/annual if yes), notes.

ADD INVENTORY ITEM → item name, category, quantity, unit, minimum stock threshold, storage condition, hazardous? (yes/no).

LOG EQUIPMENT CALIBRATION → which equipment (call get_equipment), calibration date, result/notes, next due date, buffer values used, new status.

RAISE DEVIATION (CAPA) → title, severity (Minor/Major/Critical), source (Internal Audit/Batch Deviation/Equipment Failure/Customer Complaint/Regulatory Inspection/Other), full description, related batch?

INVESTIGATE DEVIATION → which deviation (call get_open_deviations), 5-Why chain (why_1 through why_5), root cause identified.

SPAWN CAPA ACTION → investigation ID, action type (Corrective/Preventive), task title and description, who to assign, due date.

CREATE SOP → title, category (Fermentation/QC/Sanitation/Safety), version number (e.g. v1.0), document URL.

CREATE LAB NOTEBOOK ENTRY → experiment title, objective, methodology, observations, conclusions, related batch?

START SHELF LIFE STUDY → which batch (call search_batches), storage condition, test parameters (list at least 2-3).

CREATE PURCHASE REQUEST → item name, quantity and unit, reason, urgency (Normal/Urgent/Critical).

BATCH WORKFLOW ORCHESTRATION:
When the user says "start a batch", follow this EXACT multi-step protocol:
  Step 1: Check inventory for raw materials.
  Step 2: Ask for batch details (variant, volume, strain) if not provided.
  Step 3: Call create_batch to create it.
  Step 4: Ask "Who should handle media preparation?" -> Call get_employees to show the team, then use assign_task. BE SMART: Set priority to 'high' and calculate the due_date as TODAY. Do not leave due_date empty.
  Step 5: Ask "Who will handle inoculation monitoring?" -> use assign_task. BE SMART: Set priority to 'urgent' and calculate the due_date as TOMORROW.
  Step 6: Summarize everything done in a clean checklist format.

MORNING BRIEFING BEHAVIOR:
When the user says "good morning", "briefing", or "overview", IMMEDIATELY call the morning_briefing tool. Present the results in a clean, organized format with emoji headers. Highlight anything that needs immediate attention (deviations, overdue items, pending approvals).

Always convert relative dates (last month, tomorrow, next week) to YYYY-MM-DD using today's date.

CONTEXT AND MEMORY: You have the full conversation history. Never re-ask what was already answered. "Same person/priority/batch as before" means use the value from earlier in this conversation.

ADAPTIVE BEHAVIOUR: If asked about a module or action not listed above, ask what the user needs, then use the most relevant tool. If no tool fits, explain what you can and cannot currently do and suggest the closest alternative.`,
      messages,
      stopWhen: stepCountIs(8), // AI SDK v6: replaces maxSteps — allows tool call chains up to 8 steps
      tools: {
        // ══════════════════════════════════════════════════════════════════════════
        // SAMPLE INCUBATION TOOLS
        // ══════════════════════════════════════════════════════════════════════════
        log_sample_incubation: tool({
          description: 'Log a new sample incubation record. Gather ALL fields before calling.',
          parameters: z.object({
            sample_name: z.string().describe('Sample name/ID, e.g. "F2 Plate A"'),
            sample_category: z.enum(['Fermentation IPC', 'Cell Bank', 'Passage', 'Subculture', 'Other']).describe('Category of sample'),
            sample_type: z.enum(['Agar Plate', 'Broth']).describe('Type of sample medium'),
            incubation_temp_c: z.number().describe('Incubation temperature in Celsius'),
            start_time: z.string().describe('Start time in ISO format, e.g. 2026-05-24T10:00:00'),
            end_time: z.string().optional().describe('End time in ISO format (optional)'),
            batch_id: z.string().uuid().optional().describe('UUID of the associated batch (optional)'),
            sterility_status: z.enum(['Pending', 'Sterile', 'Contaminated']).optional().describe('Sterility result — default Pending'),
            od_value: z.number().optional().describe('Optical density value (optional)'),
            ph_value: z.number().optional().describe('pH value of the sample (optional)'),
            staining_method: z.string().optional().describe('Staining method used (optional)'),
            microscopic_morphology: z.string().optional().describe('Microscopic morphology notes (optional)'),
            colony_morphology: z.string().optional().describe('Colony morphology — required for Agar Plate samples'),
            observation: z.string().optional().describe('General observations (optional)'),
          }),
          execute: async ({ sample_name, sample_category, sample_type, incubation_temp_c, start_time, end_time, batch_id, sterility_status, od_value, ph_value, staining_method, microscopic_morphology, colony_morphology, observation }) => {
            const { data, error } = await supabase.from('sample_incubation_records').insert({
              sample_name, sample_category, sample_type, incubation_temp_c, start_time,
              end_time: end_time || null,
              batch_id: batch_id || null,
              sterility_status: sterility_status || 'Pending',
              od_value: od_value || null,
              ph_value: ph_value || null,
              staining_method: staining_method || null,
              microscopic_morphology: microscopic_morphology || null,
              colony_morphology: colony_morphology || null,
              observation: observation || null,
              logged_by: employeeId,
            }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Incubation logged for "${sample_name}" (${sample_type}, ${incubation_temp_c}°C).`, record: data };
          },
        }),
        get_incubation_records: tool({
          description: 'Get recent sample incubation records.',
          parameters: z.object({
            sample_name: z.string().optional().describe('Filter by specific sample name')
          }),
          execute: async ({ sample_name }) => {
            let query = supabase.from('sample_incubation_records').select('*').order('created_at', { ascending: false }).limit(20);
            if (sample_name) query = query.ilike('sample_name', `%${sample_name}%`);
            const { data, error } = await query;
            if (error) return { error: error.message };
            return data;
          },
        }),

        // ══════════════════════════════════════════════
        //  PRODUCTION TOOLS
        // ══════════════════════════════════════════════
        get_active_batches: tool({
          description: 'Get all currently active batches (status: fermenting or qc-hold). Returns their UUID, human-readable batch_id, variant, and status.',
          parameters: z.object({}),
          execute: async () => {
            const { data, error } = await supabase
              .from('batches')
              .select('id, batch_id, variant, status, volume_litres, probiotic_strain, start_time')
              .in('status', ['fermenting', 'qc-hold'])
              .order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        // ══════════════════════════════════════════════
        //  HISTORICAL DATA TOOLS
        // ══════════════════════════════════════════════
        search_batches: tool({
          description: 'Search all batches (including completed/released/rejected) by date range, status, or variant. Use this for historical queries like "how many batches in May" or "show rejected batches from last quarter".',
          parameters: z.object({
            start_date: z.string().optional().describe('Start date in YYYY-MM-DD format'),
            end_date: z.string().optional().describe('End date in YYYY-MM-DD format'),
            status: z.enum(['fermenting', 'qc-hold', 'released', 'rejected', 'deviation', 'all']).optional().describe('Filter by status, or "all" for all statuses'),
            variant: z.enum(['Sweetened', 'Unsweetened', 'all']).optional().describe('Filter by variant, or "all"'),
          }),
          execute: async ({ start_date, end_date, status, variant }) => {
            let query = supabase
              .from('batches')
              .select('id, batch_id, variant, status, volume_litres, probiotic_strain, start_time, released_at, created_at')
              .order('created_at', { ascending: false });

            if (start_date) query = query.gte('created_at', `${start_date}T00:00:00`);
            if (end_date) query = query.lte('created_at', `${end_date}T23:59:59`);
            if (status && status !== 'all') query = query.eq('status', status);
            if (variant && variant !== 'all') query = query.eq('variant', variant);

            const { data, error } = await query.limit(100);
            if (error) throw new Error(error.message);

            const batches = data || [];
            const summary = {
              total: batches.length,
              by_status: {},
              by_variant: { Sweetened: 0, Unsweetened: 0 },
            };
            batches.forEach(b => {
              summary.by_status[b.status] = (summary.by_status[b.status] || 0) + 1;
              if (b.variant) summary.by_variant[b.variant]++;
            });

            return { summary, batches };
          },
        }),

        get_ph_history: tool({
          description: 'Get the complete pH reading history for a specific batch. Shows the full trend over time. Use the batch UUID or human-readable batch_id.',
          parameters: z.object({
            batch_id: z.string().describe('Either the UUID or the human-readable batch_id (e.g. BATCH-047)'),
          }),
          execute: async ({ batch_id }) => {
            // Try UUID first, then fall back to human-readable batch_id
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch_id);

            let batchUUID = batch_id;
            let batchName = batch_id;
            if (!isUUID) {
              // Look up the batch UUID from the human-readable ID
              const { data: batch } = await supabase
                .from('batches')
                .select('id, batch_id')
                .ilike('batch_id', batch_id)
                .limit(1)
                .single();
              if (!batch) return { error: `No batch found with ID "${batch_id}"` };
              batchUUID = batch.id;
              batchName = batch.batch_id;
            }

            const { data: readings, error } = await supabase
              .from('ph_readings')
              .select('id, ph_value, time_elapsed_hours, is_deviation, notes, created_at, employees(full_name)')
              .eq('batch_id', batchUUID)
              .order('created_at', { ascending: true });

            if (error) throw new Error(error.message);

            const allReadings = readings || [];
            const phValues = allReadings.map(r => r.ph_value);
            const deviations = allReadings.filter(r => r.is_deviation);

            return {
              batch_id: batchName,
              total_readings: allReadings.length,
              deviations_count: deviations.length,
              ph_min: phValues.length > 0 ? Math.min(...phValues) : null,
              ph_max: phValues.length > 0 ? Math.max(...phValues) : null,
              ph_avg: phValues.length > 0 ? (phValues.reduce((a, b) => a + b, 0) / phValues.length).toFixed(2) : null,
              readings: allReadings.map(r => ({
                ph: r.ph_value,
                hours: r.time_elapsed_hours,
                deviation: r.is_deviation,
                notes: r.notes,
                logged_by: r.employees?.full_name || 'Unknown',
                time: r.created_at,
              })),
            };
          },
        }),

        get_deviations: tool({
          description: 'Get all pH deviations across all batches for a given time period. Use for questions like "show me all deviations from last month" or "any pH issues in April".',
          parameters: z.object({
            start_date: z.string().optional().describe('Start date in YYYY-MM-DD format (defaults to 30 days ago)'),
            end_date: z.string().optional().describe('End date in YYYY-MM-DD format (defaults to today)'),
          }),
          execute: async ({ start_date, end_date }) => {
            const since = start_date ? `${start_date}T00:00:00` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = end_date ? `${end_date}T23:59:59` : new Date().toISOString();

            const { data, error } = await supabase
              .from('ph_readings')
              .select('id, ph_value, time_elapsed_hours, notes, created_at, is_deviation, batches(batch_id, variant, status), employees(full_name)')
              .eq('is_deviation', true)
              .gte('created_at', since)
              .lte('created_at', until)
              .order('created_at', { ascending: false })
              .limit(50);

            if (error) throw new Error(error.message);

            const deviations = data || [];
            // Group by batch
            const byBatch = {};
            deviations.forEach(d => {
              const bName = d.batches?.batch_id || 'Unknown';
              if (!byBatch[bName]) byBatch[bName] = { count: 0, readings: [] };
              byBatch[bName].count++;
              byBatch[bName].readings.push({
                ph: d.ph_value,
                time: d.created_at,
                logged_by: d.employees?.full_name,
                notes: d.notes,
              });
            });

            return {
              period: `${start_date || 'last 30 days'} to ${end_date || 'today'}`,
              total_deviations: deviations.length,
              by_batch: byBatch,
              most_affected_batch: Object.entries(byBatch).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 'None',
            };
          },
        }),

        get_activity_history: tool({
          description: 'Search activity log entries by date range or batch. Shows what work was done, by whom, and any issues observed.',
          parameters: z.object({
            start_date: z.string().optional().describe('Start date in YYYY-MM-DD (defaults to 7 days ago)'),
            end_date: z.string().optional().describe('End date in YYYY-MM-DD (defaults to today)'),
            batch_id: z.string().optional().describe('Human-readable batch ID to filter by (e.g. BATCH-001)'),
            issues_only: z.boolean().optional().describe('If true, only return entries with issues observed'),
          }),
          execute: async ({ start_date, end_date, batch_id, issues_only }) => {
            const since = start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const until = end_date || new Date().toISOString().split('T')[0];

            let query = supabase
              .from('activity_log')
              .select('id, batch_id, activity_description, issue_observed, issue_description, log_date, employees(full_name)')
              .gte('log_date', since)
              .lte('log_date', until)
              .order('log_date', { ascending: false });

            if (batch_id) query = query.ilike('batch_id', batch_id);
            if (issues_only) query = query.eq('issue_observed', true);

            const { data, error } = await query.limit(50);
            if (error) throw new Error(error.message);

            const entries = data || [];
            return {
              period: `${since} to ${until}`,
              total_entries: entries.length,
              issues_found: entries.filter(e => e.issue_observed).length,
              entries: entries.map(e => ({
                date: e.log_date,
                batch: e.batch_id || 'General',
                description: e.activity_description,
                issue: e.issue_observed ? (e.issue_description || 'Yes') : null,
                logged_by: e.employees?.full_name || 'Unknown',
              })),
            };
          },
        }),

        create_batch: tool({
          description: 'Create a new production batch. Auto-logs an activity entry and checks equipment calibration. Returns the created batch with its UUID.',
          parameters: z.object({
            batch_id: z.string().describe('Human-readable batch identifier, e.g. BATCH-001'),
            variant: z.enum(['Sweetened', 'Unsweetened']).describe('Product variant'),
            volume_litres: z.number().describe('Total volume in litres'),
            probiotic_strain: z.string().describe('Probiotic strain name'),
          }),
          execute: async ({ batch_id, variant, volume_litres, probiotic_strain }) => {
            // Step 1: Create the batch
            const { data, error } = await supabase
              .from('batches')
              .insert({
                batch_id, variant, volume_litres, probiotic_strain,
                status: 'fermenting',
                start_time: new Date().toISOString(),
              })
              .select()
              .single();
            if (error) throw new Error(error.message);

            // Step 2: Auto-log activity
            await supabase.from('activity_log').insert({
              batch_id: batch_id,
              activity_description: `Batch ${batch_id} initiated — ${variant} variant, ${volume_litres}L, strain: ${probiotic_strain}`,
              employee_id: employeeId,
              log_date: new Date().toISOString().split('T')[0],
            });

            // Step 3: Check equipment calibration due soon
            const { data: equipDue } = await supabase
              .from('equipment')
              .select('name, next_calibration')
              .eq('status', 'active')
              .lte('next_calibration', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
              .order('next_calibration');

            const calibrationWarnings = (equipDue || []).map(e => `${e.name} (due ${e.next_calibration})`);

            return {
              success: true,
              message: `Batch ${batch_id} created and activity logged.`,
              batch: data,
              calibration_warnings: calibrationWarnings.length > 0 ? calibrationWarnings : null,
              next_steps: 'Now ask the user: "Who should handle media preparation for this batch?"',
            };
          },
        }),

        update_batch_status: tool({
          description: 'Update the status of a batch. Use the UUID from get_active_batches.',
          parameters: z.object({
            batch_uuid: z.string().uuid().describe('The UUID of the batch'),
            status: z.enum(['fermenting', 'qc-hold', 'released', 'rejected', 'deviation']).describe('New status'),
          }),
          execute: async ({ batch_uuid, status }) => {
            const updateData = { status };
            if (status === 'released') {
              updateData.released_by = employeeId;
              updateData.released_at = new Date().toISOString();
            }
            const { data, error } = await supabase.from('batches').update(updateData).eq('id', batch_uuid).select().single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Batch status updated to ${status}.`, batch: data };
          },
        }),

        record_ph: tool({
          description: 'Record a pH reading for a batch. Use the batch UUID from get_active_batches.',
          parameters: z.object({
            batch_uuid: z.string().uuid().describe('The UUID of the batch'),
            ph_value: z.number().describe('The pH value measured'),
            time_elapsed_hours: z.number().optional().describe('Hours elapsed since batch start'),
            notes: z.string().optional().describe('Optional notes about the reading'),
          }),
          execute: async ({ batch_uuid, ph_value, time_elapsed_hours, notes }) => {
            const { data, error } = await supabase
              .from('ph_readings')
              .insert({
                batch_id: batch_uuid,
                logged_by: employeeId,
                ph_value,
                time_elapsed_hours: time_elapsed_hours || 0,
                notes: notes || null,
              })
              .select()
              .single();
            if (error) throw new Error(error.message);
            const deviation = ph_value < 4.2 || ph_value > 4.5;
            return {
              success: true,
              message: `pH ${ph_value} recorded.${deviation ? ' ⚠️ DEVIATION DETECTED — value outside 4.2–4.5 range.' : ''}`,
              reading: data,
            };
          },
        }),

        log_activity: tool({
          description: 'Log a daily activity entry, optionally linked to a batch. Uses the human-readable batch_id text (e.g. BATCH-001), NOT the UUID.',
          parameters: z.object({
            batch_id: z.string().optional().describe('Human-readable batch ID (e.g. BATCH-001), or omit for general activity'),
            activity_description: z.string().describe('What was done'),
            issue_observed: z.boolean().optional().describe('Whether an issue was observed'),
            issue_description: z.string().optional().describe('Description of the issue if observed'),
          }),
          execute: async ({ batch_id, activity_description, issue_observed, issue_description }) => {
            const { data, error } = await supabase
              .from('activity_log')
              .insert({
                batch_id: batch_id || null,
                activity_description,
                issue_observed: issue_observed || false,
                issue_description: issue_description || null,
                employee_id: employeeId,
                log_date: new Date().toISOString().split('T')[0],
              })
              .select()
              .single();
            if (error) throw new Error(error.message);
            return { success: true, message: 'Activity logged.', log: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  HR & PEOPLE TOOLS
        // ══════════════════════════════════════════════
        get_employees: tool({
          description: 'Get a list of all active employees with their UUIDs, names, roles, and departments.',
          parameters: z.object({}),
          execute: async () => {
            const { data, error } = await supabase
              .from('employees')
              .select('id, full_name, email, role, department')
              .eq('is_active', true)
              .order('full_name');
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        get_pending_leaves: tool({
          description: 'Get all pending leave applications with employee names.',
          parameters: z.object({}),
          execute: async () => {
            const { data, error } = await supabase
              .from('leave_applications')
              .select('id, employee_id, leave_type, start_date, end_date, total_days, reason, status, employees(full_name)')
              .eq('status', 'pending')
              .order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        review_leave: tool({
          description: 'Approve or reject a pending leave application.',
          parameters: z.object({
            leave_id: z.string().uuid().describe('The UUID of the leave application'),
            decision: z.enum(['approved', 'rejected']).describe('Approve or reject'),
            admin_comment: z.string().optional().describe('Optional comment'),
          }),
          execute: async ({ leave_id, decision, admin_comment }) => {
            const { data, error } = await supabase
              .from('leave_applications')
              .update({
                status: decision,
                admin_comment: admin_comment || null,
                reviewed_by: employeeId,
                reviewed_at: new Date().toISOString(),
              })
              .eq('id', leave_id)
              .select()
              .single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Leave ${decision}.`, leave: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  TASK TOOLS
        // ══════════════════════════════════════════════
        get_open_tasks: tool({
          description: 'Get all tasks that are open or in-progress.',
          parameters: z.object({}),
          execute: async () => {
            const { data, error } = await supabase
              .from('tasks')
              .select('id, title, description, priority, status, due_date, employees!tasks_assigned_to_fkey(full_name)')
              .in('status', ['open', 'in-progress'])
              .order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        assign_task: tool({
          description: 'Create and assign a task to an employee. Requires title, description, assignee UUID, priority, and due date. Optionally include checklist items and personal-reminder flag.',
          parameters: z.object({
            title: z.string().describe('Task title'),
            description: z.string().describe('Detailed task description'),
            assigned_to: z.string().uuid().describe('Employee UUID to assign to (from get_employees)'),
            priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('Task priority level'),
            due_date: z.string().describe('Due date in YYYY-MM-DD format — always required'),
            checklist: z.array(z.string()).optional().describe('Optional list of sub-steps or checklist items (plain text strings)'),
            is_personal_reminder: z.boolean().optional().describe('Set true if this is a personal reminder; false (default) for admin-assigned tasks'),
          }),
          execute: async ({ title, description, assigned_to, priority, due_date, checklist, is_personal_reminder }) => {
            const checklistJson = checklist && checklist.length > 0
              ? checklist.map(text => ({ text, done: false }))
              : null;

            const { data, error } = await supabase
              .from('tasks')
              .insert({
                title, description, assigned_to, priority,
                due_date,
                assigned_by: employeeId,
                status: 'open',
                checklist: checklistJson,
                is_personal_reminder: is_personal_reminder || false,
              })
              .select()
              .single();
            if (error) throw new Error(error.message);

            await supabase.from('notifications').insert({
              employee_id: assigned_to,
              title: `New Task: ${title}`,
              message: `You have been assigned a ${priority} priority task due ${due_date}: ${description}`,
              type: 'info',
              link: '/tasks',
            });

            return { success: true, message: `Task "${title}" assigned (${priority}, due ${due_date}) — notification sent.`, task: data };
          },
        }),

        update_task_status: tool({
          description: 'Update the status of an existing task — mark it as done, in-progress, or cancelled. Use get_open_tasks first to find the task UUID.',
          parameters: z.object({
            task_id: z.string().uuid().describe('UUID of the task to update'),
            status: z.enum(['open', 'in-progress', 'done', 'cancelled']).describe('New status'),
          }),
          execute: async ({ task_id, status }) => {
            const { data, error } = await supabase
              .from('tasks')
              .update({ status })
              .eq('id', task_id)
              .select('id, title, status')
              .single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Task "${data.title}" updated to "${status}".`, task: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  COMPLIANCE TOOLS
        // ══════════════════════════════════════════════
        get_upcoming_compliance: tool({
          description: 'Get compliance items due in the next 30 days or currently overdue.',
          parameters: z.object({}),
          execute: async () => {
            const thirtyDaysOut = new Date();
            thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
            const { data, error } = await supabase
              .from('compliance_items')
              .select('id, title, category, due_date, status, notes')
              .or(`status.eq.overdue,due_date.lte.${thirtyDaysOut.toISOString().split('T')[0]}`)
              .neq('status', 'done')
              .order('due_date');
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        add_compliance_item: tool({
          description: 'Add a new regulatory or compliance deadline. Collect title, category, due date, responsible person, recurrence, and notes before calling.',
          parameters: z.object({
            title: z.string().describe('Title of the compliance item'),
            category: z.enum(['FSSAI', 'TIIC', 'PF', 'ESI', 'Patent', 'NABL', 'Equipment', 'Lease', 'Other']).describe('Category'),
            due_date: z.string().describe('Due date in YYYY-MM-DD format'),
            responsible_person: z.string().uuid().optional().describe('UUID of the responsible employee (from get_employees)'),
            is_recurring: z.boolean().optional().describe('Whether this is a recurring deadline'),
            recurrence: z.enum(['weekly', 'monthly', 'annual']).optional().describe('Recurrence frequency — only if is_recurring is true'),
            notes: z.string().optional().describe('Additional notes or document references'),
          }),
          execute: async ({ title, category, due_date, responsible_person, is_recurring, recurrence, notes }) => {
            const { data, error } = await supabase
              .from('compliance_items')
              .insert({
                title, category, due_date,
                notes: notes || null,
                status: 'upcoming',
                responsible_person: responsible_person || null,
                is_recurring: is_recurring || false,
                recurrence: (is_recurring && recurrence) ? recurrence : null,
              })
              .select()
              .single();
            if (error) throw new Error(error.message);
            const recurringNote = is_recurring ? ` (${recurrence})` : '';
            return { success: true, message: `Compliance item "${title}" added${recurringNote}, due ${due_date}.`, item: data };
          },
        }),

        update_compliance_status: tool({
          description: 'Update the status of a compliance item — mark it as done, in-progress, or overdue. Use get_upcoming_compliance first to find the item UUID.',
          parameters: z.object({
            item_id: z.string().uuid().describe('UUID of the compliance item'),
            status: z.enum(['upcoming', 'in-progress', 'done', 'overdue']).describe('New status'),
            notes: z.string().optional().describe('Optional notes to update on the item'),
          }),
          execute: async ({ item_id, status, notes }) => {
            const updateData = { status };
            if (notes) updateData.notes = notes;
            const { data, error } = await supabase
              .from('compliance_items')
              .update(updateData)
              .eq('id', item_id)
              .select('id, title, status')
              .single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Compliance item "${data.title}" marked as "${status}".`, item: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  INVENTORY TOOLS
        // ══════════════════════════════════════════════
        get_inventory: tool({
          description: 'Get all inventory items, optionally filtered by low stock (below minimum threshold).',
          parameters: z.object({
            low_stock_only: z.boolean().optional().describe('If true, only return items below their minimum threshold'),
          }),
          execute: async ({ low_stock_only }) => {
            let query = supabase.from('inventory').select('*').order('item_name');
            // Note: filtering low stock in-app since Supabase doesn't support column-to-column comparisons easily
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            if (low_stock_only) {
              return (data || []).filter(item => item.quantity <= item.minimum_threshold);
            }
            return data || [];
          },
        }),

        add_inventory: tool({
          description: 'Add a new inventory item. Collect name, category, quantity, unit, minimum threshold, storage condition, and hazard status before calling.',
          parameters: z.object({
            item_name: z.string().describe('Name of the item'),
            category: z.enum(['Raw Material', 'Packaging', 'Consumable', 'Reagent', 'Other']).describe('Category'),
            quantity: z.number().describe('Initial quantity'),
            unit: z.string().describe('Unit of measurement (e.g. kg, litres, pieces)'),
            minimum_threshold: z.number().optional().describe('Minimum stock level before an alert is triggered'),
            storage_condition: z.string().optional().describe('Storage requirement, e.g. "Room temperature", "Refrigerated (2–8°C)", "Frozen (-20°C)"'),
            hazardous: z.boolean().optional().describe('Whether the item is classified as hazardous'),
          }),
          execute: async ({ item_name, category, quantity, unit, minimum_threshold, storage_condition, hazardous }) => {
            const { data, error } = await supabase
              .from('inventory')
              .insert({
                item_name, category, quantity, unit,
                minimum_threshold: minimum_threshold || 0,
                last_restocked: new Date().toISOString().split('T')[0],
              })
              .select()
              .single();
            if (error) throw new Error(error.message);
            const notes = [];
            if (storage_condition) notes.push(`Storage: ${storage_condition}`);
            if (hazardous) notes.push('⚠️ Hazardous');
            const notesStr = notes.length > 0 ? ` — ${notes.join(', ')}` : '';
            return { success: true, message: `Added ${quantity} ${unit} of ${item_name}${notesStr}.`, item: data };
          },
        }),

        update_inventory_stock: tool({
          description: 'Update the stock level of an existing inventory item. Use "restock" to add quantity or "deduct" to subtract. Use get_inventory first to confirm the item name.',
          parameters: z.object({
            item_name: z.string().describe('Name (or partial name) of the inventory item'),
            quantity: z.number().positive().describe('Amount to add or subtract'),
            operation: z.enum(['restock', 'deduct']).describe('restock = add to stock, deduct = remove from stock'),
          }),
          execute: async ({ item_name, quantity, operation }) => {
            const { data: items, error: findError } = await supabase
              .from('inventory')
              .select('id, item_name, quantity, unit')
              .ilike('item_name', `%${item_name}%`);
            if (findError) throw new Error(findError.message);
            if (!items || items.length === 0) throw new Error(`No inventory item found matching "${item_name}". Use get_inventory to check available items.`);

            const item = items[0];
            const newQuantity = operation === 'restock'
              ? item.quantity + quantity
              : Math.max(0, item.quantity - quantity);

            const updateData = { quantity: newQuantity };
            if (operation === 'restock') updateData.last_restocked = new Date().toISOString().split('T')[0];

            const { data, error } = await supabase
              .from('inventory')
              .update(updateData)
              .eq('id', item.id)
              .select('id, item_name, quantity, unit')
              .single();
            if (error) throw new Error(error.message);
            return {
              success: true,
              message: `${data.item_name}: ${operation === 'restock' ? 'added' : 'deducted'} ${quantity} ${data.unit}. New stock: ${data.quantity} ${data.unit}.`,
              item: data,
            };
          },
        }),

        // ══════════════════════════════════════════════
        //  MORNING BRIEFING
        // ══════════════════════════════════════════════
        morning_briefing: tool({
          description: 'Get a comprehensive operational briefing across all modules. Call this when the user says good morning, asks for a briefing, status update, or overview.',
          parameters: z.object({}),
          execute: async () => {
            const today = new Date().toISOString().split('T')[0];
            const thirtyDaysOut = new Date();
            thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

            // Run all queries in parallel for speed
            const [batchRes, leavesRes, tasksRes, complianceRes, attendanceRes, deviationsRes, lowStockRes] = await Promise.all([
              // Active batches
              supabase.from('batches').select('id, batch_id, variant, status, start_time').in('status', ['fermenting', 'qc-hold']).order('created_at', { ascending: false }),
              // Pending leaves
              supabase.from('leave_applications').select('id, leave_type, start_date, end_date, reason, employees(full_name)').eq('status', 'pending'),
              // Open high-priority tasks
              supabase.from('tasks').select('id, title, priority, status, due_date, employees!tasks_assigned_to_fkey(full_name)').in('status', ['open', 'in-progress']).in('priority', ['high', 'urgent']),
              // Overdue + upcoming compliance
              supabase.from('compliance_items').select('id, title, category, due_date, status').or(`status.eq.overdue,due_date.lte.${thirtyDaysOut.toISOString().split('T')[0]}`).neq('status', 'done').order('due_date'),
              // Today's attendance
              supabase.from('attendance_log').select('id, employee_id, check_in_time, check_out_time, employees(full_name)').eq('date', today),
              // Recent pH deviations (last 7 days)
              supabase.from('ph_readings').select('id, ph_value, is_deviation, created_at, batches(batch_id)').eq('is_deviation', true).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(5),
              // Low stock inventory
              supabase.from('inventory').select('id, item_name, quantity, minimum_threshold, unit'),
            ]);

            const lowStockItems = (lowStockRes.data || []).filter(item => item.quantity <= item.minimum_threshold && item.minimum_threshold > 0);

            // Get total employee count for attendance comparison
            const { count: totalEmployees } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true);

            return {
              timestamp: new Date().toISOString(),
              active_batches: batchRes.data || [],
              active_batch_count: (batchRes.data || []).length,
              pending_leaves: leavesRes.data || [],
              pending_leave_count: (leavesRes.data || []).length,
              high_priority_tasks: tasksRes.data || [],
              high_priority_task_count: (tasksRes.data || []).length,
              compliance_items: complianceRes.data || [],
              compliance_count: (complianceRes.data || []).length,
              overdue_compliance: (complianceRes.data || []).filter(c => c.status === 'overdue'),
              todays_checkins: (attendanceRes.data || []).length,
              total_employees: totalEmployees || 0,
              not_checked_in: (totalEmployees || 0) - (attendanceRes.data || []).length,
              recent_deviations: deviationsRes.data || [],
              deviation_count: (deviationsRes.data || []).length,
              low_stock_items: lowStockItems,
              low_stock_count: lowStockItems.length,
            };
          },
        }),

        // ══════════════════════════════════════════════
        //  PROACTIVE ALERTS CHECK
        // ══════════════════════════════════════════════
        check_alerts: tool({
          description: 'Check for urgent issues that need immediate attention. Call this proactively when the user opens the chat or says hello.',
          parameters: z.object({}),
          execute: async () => {
            const now = new Date();
            const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
            const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const today = now.toISOString().split('T')[0];

            const [deviationsRes, complianceRes, openShiftsRes] = await Promise.all([
              // pH deviations in last 15 minutes
              supabase.from('ph_readings')
                .select('id, ph_value, created_at, batches(batch_id)')
                .eq('is_deviation', true)
                .gte('created_at', fifteenMinAgo)
                .order('created_at', { ascending: false }),
              // Compliance due in 3 days
              supabase.from('compliance_items')
                .select('id, title, category, due_date, status')
                .or(`status.eq.overdue,due_date.lte.${threeDaysOut}`)
                .neq('status', 'done')
                .order('due_date'),
              // Employees still checked in (no check-out today)
              supabase.from('attendance_log')
                .select('id, employee_id, check_in_time, employees(full_name)')
                .eq('date', today)
                .is('check_out_time', null),
            ]);

            const alerts = [];

            // pH deviation alerts
            (deviationsRes.data || []).forEach(d => {
              alerts.push({
                type: 'pH_DEVIATION',
                severity: 'critical',
                message: `⚠️ pH deviation: ${d.ph_value} on batch ${d.batches?.batch_id || 'unknown'} at ${new Date(d.created_at).toLocaleTimeString()}`,
              });
            });

            // Compliance alerts
            (complianceRes.data || []).forEach(c => {
              const isOverdue = c.status === 'overdue';
              alerts.push({
                type: 'COMPLIANCE',
                severity: isOverdue ? 'critical' : 'warning',
                message: isOverdue
                  ? `🔴 OVERDUE: ${c.title} (${c.category}) was due ${c.due_date}`
                  : `🟡 Due soon: ${c.title} (${c.category}) due ${c.due_date}`,
              });
            });

            // Late check-out alerts (only after 7 PM IST = 13:30 UTC)
            const istHour = (now.getUTCHours() + 5) % 24 + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0);
            if (istHour >= 19 && (openShiftsRes.data || []).length > 0) {
              (openShiftsRes.data || []).forEach(s => {
                alerts.push({
                  type: 'LATE_CHECKOUT',
                  severity: 'warning',
                  message: `🔴 ${s.employees?.full_name || 'Employee'} still checked in — hasn't checked out today`,
                });
              });
            }

            return {
              alert_count: alerts.length,
              alerts: alerts,
              has_critical: alerts.some(a => a.severity === 'critical'),
            };
          },
        }),

        // ══════════════════════════════════════════════
        //  CROSS-MODULE ANALYTICS
        // ══════════════════════════════════════════════
        get_analytics: tool({
          description: 'Get cross-module analytics and insights. Use for questions about trends, rates, comparisons, and performance metrics.',
          parameters: z.object({
            query_type: z.enum([
              'batch_stats',
              'employee_task_performance',
              'fermentation_comparison',
              'monthly_summary',
            ]).describe('Type of analytics query'),
            time_period_days: z.number().optional().describe('Number of days to look back (default 30)'),
          }),
          execute: async ({ query_type, time_period_days }) => {
            const days = time_period_days || 30;
            const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

            switch (query_type) {
              case 'batch_stats': {
                const { data: batches } = await supabase
                  .from('batches')
                  .select('id, batch_id, variant, status, start_time, released_at, created_at')
                  .gte('created_at', sinceDate);
                const all = batches || [];
                const released = all.filter(b => b.status === 'released');
                const rejected = all.filter(b => b.status === 'rejected');
                const sweetened = all.filter(b => b.variant === 'Sweetened');
                const unsweetened = all.filter(b => b.variant === 'Unsweetened');
                return {
                  period: `Last ${days} days`,
                  total_batches: all.length,
                  released: released.length,
                  rejected: rejected.length,
                  rejection_rate: all.length > 0 ? `${((rejected.length / all.length) * 100).toFixed(1)}%` : '0%',
                  by_variant: { sweetened: sweetened.length, unsweetened: unsweetened.length },
                  still_active: all.filter(b => ['fermenting', 'qc-hold'].includes(b.status)).length,
                };
              }

              case 'employee_task_performance': {
                const { data: tasks } = await supabase
                  .from('tasks')
                  .select('id, title, status, assigned_to, completed_at, created_at, employees!tasks_assigned_to_fkey(full_name)')
                  .gte('created_at', sinceDate);
                const all = tasks || [];
                // Group by employee
                const byEmployee = {};
                all.forEach(t => {
                  const name = t.employees?.full_name || 'Unassigned';
                  if (!byEmployee[name]) byEmployee[name] = { total: 0, done: 0, open: 0 };
                  byEmployee[name].total++;
                  if (t.status === 'done') byEmployee[name].done++;
                  else byEmployee[name].open++;
                });
                // Calculate completion rates and sort
                const rankings = Object.entries(byEmployee).map(([name, stats]) => ({
                  name,
                  total_tasks: stats.total,
                  completed: stats.done,
                  open: stats.open,
                  completion_rate: stats.total > 0 ? `${((stats.done / stats.total) * 100).toFixed(0)}%` : '0%',
                })).sort((a, b) => (b.completed / Math.max(b.total_tasks, 1)) - (a.completed / Math.max(a.total_tasks, 1)));
                return { period: `Last ${days} days`, total_tasks: all.length, rankings };
              }

              case 'fermentation_comparison': {
                const { data: released } = await supabase
                  .from('batches')
                  .select('id, batch_id, variant, start_time, released_at')
                  .eq('status', 'released')
                  .gte('created_at', sinceDate);
                const batches = (released || []).filter(b => b.start_time && b.released_at);
                const calcAvgHours = (list) => {
                  if (list.length === 0) return null;
                  const total = list.reduce((sum, b) => sum + (new Date(b.released_at) - new Date(b.start_time)) / 3600000, 0);
                  return (total / list.length).toFixed(1);
                };
                const sweetened = batches.filter(b => b.variant === 'Sweetened');
                const unsweetened = batches.filter(b => b.variant === 'Unsweetened');
                return {
                  period: `Last ${days} days`,
                  sweetened: { count: sweetened.length, avg_fermentation_hours: calcAvgHours(sweetened) },
                  unsweetened: { count: unsweetened.length, avg_fermentation_hours: calcAvgHours(unsweetened) },
                  overall: { count: batches.length, avg_fermentation_hours: calcAvgHours(batches) },
                };
              }

              case 'monthly_summary': {
                const [batchRes, taskRes, leaveRes, phRes] = await Promise.all([
                  supabase.from('batches').select('id, status').gte('created_at', sinceDate),
                  supabase.from('tasks').select('id, status').gte('created_at', sinceDate),
                  supabase.from('leave_applications').select('id, status').gte('created_at', sinceDate),
                  supabase.from('ph_readings').select('id, is_deviation').gte('created_at', sinceDate),
                ]);
                const bAll = batchRes.data || [];
                const tAll = taskRes.data || [];
                const lAll = leaveRes.data || [];
                const pAll = phRes.data || [];
                return {
                  period: `Last ${days} days`,
                  batches: { total: bAll.length, released: bAll.filter(b => b.status === 'released').length, rejected: bAll.filter(b => b.status === 'rejected').length },
                  tasks: { total: tAll.length, completed: tAll.filter(t => t.status === 'done').length, open: tAll.filter(t => ['open', 'in-progress'].includes(t.status)).length },
                  leaves: { total: lAll.length, approved: lAll.filter(l => l.status === 'approved').length, pending: lAll.filter(l => l.status === 'pending').length },
                  ph_readings: { total: pAll.length, deviations: pAll.filter(p => p.is_deviation).length },
                };
              }

              default:
                return { error: 'Unknown query type' };
            }
          },
        }),

        // ══════════════════════════════════════════════
        //  EQUIPMENT TOOLS
        // ══════════════════════════════════════════════
        get_equipment: tool({
          description: 'Get all equipment with their calibration status and next due dates.',
          parameters: z.object({
            overdue_only: z.boolean().optional().describe('If true, return only equipment with overdue or missing calibration'),
          }),
          execute: async ({ overdue_only }) => {
            const { data, error } = await supabase
              .from('equipment')
              .select('id, name, model, serial_number, calibration_due_date, status')
              .order('name');
            if (error) throw new Error(error.message);
            const today = new Date().toISOString().split('T')[0];
            const items = data || [];
            if (overdue_only) return items.filter(e => !e.calibration_due_date || e.calibration_due_date < today);
            return items.map(e => ({ ...e, calibration_overdue: e.calibration_due_date && e.calibration_due_date < today }));
          },
        }),

        log_equipment_calibration: tool({
          description: 'Log a calibration or maintenance event for a piece of equipment. Get equipment UUID from get_equipment first.',
          parameters: z.object({
            equipment_id: z.string().uuid().describe('UUID of the equipment (from get_equipment)'),
            calibration_date: z.string().describe('Date of calibration in YYYY-MM-DD'),
            result: z.string().describe('Calibration result/notes — what was done, what was found'),
            next_due_date: z.string().optional().describe('Next calibration due date in YYYY-MM-DD'),
            buffer_values_used: z.string().optional().describe('Buffer values or standards used (e.g. pH 4.0, 7.0, 10.0)'),
            new_status: z.enum(['Operational', 'Out of Service', 'Under Maintenance']).optional().describe('Update equipment status after calibration'),
          }),
          execute: async ({ equipment_id, calibration_date, result, next_due_date, buffer_values_used, new_status }) => {
            const { error: logError } = await supabase.from('calibration_logs').insert({
              equipment_id, calibration_date, result,
              next_due_date: next_due_date || null,
              buffer_values_used: buffer_values_used || null,
              logged_by: employeeId,
            });
            if (logError) throw new Error(logError.message);
            if (new_status || next_due_date) {
              const update = {};
              if (new_status) update.status = new_status;
              if (next_due_date) update.calibration_due_date = next_due_date;
              await supabase.from('equipment').update(update).eq('id', equipment_id);
            }
            return { success: true, message: `Calibration logged. Next due: ${next_due_date || 'not set'}.` };
          },
        }),

        update_equipment_status: tool({
          description: 'Update the operational status of a piece of equipment.',
          parameters: z.object({
            equipment_id: z.string().uuid().describe('UUID of the equipment (from get_equipment)'),
            status: z.enum(['Operational', 'Out of Service', 'Under Maintenance']).describe('New status'),
          }),
          execute: async ({ equipment_id, status }) => {
            const { data, error } = await supabase.from('equipment').update({ status }).eq('id', equipment_id).select('name, status').single();
            if (error) throw new Error(error.message);
            return { success: true, message: `${data.name} status updated to "${status}".` };
          },
        }),

        // ══════════════════════════════════════════════
        //  CAPA TOOLS
        // ══════════════════════════════════════════════
        get_open_deviations: tool({
          description: 'Get all open or in-progress CAPA deviations.',
          parameters: z.object({}),
          execute: async () => {
            const { data, error } = await supabase
              .from('deviations')
              .select('id, title, severity, source, description, status, created_at, employees!deviations_reported_by_fkey(full_name)')
              .in('status', ['Open', 'Investigating', 'CAPA Assigned'])
              .order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        raise_deviation: tool({
          description: 'Raise a new CAPA deviation. Gather title, severity, source, and description before calling.',
          parameters: z.object({
            title: z.string().describe('Short title for the deviation'),
            severity: z.enum(['Minor', 'Major', 'Critical']).describe('Severity level'),
            source: z.enum(['Internal Audit', 'Batch Deviation', 'Equipment Failure', 'Customer Complaint', 'Regulatory Inspection', 'Other']).describe('Where the deviation originated'),
            description: z.string().describe('Full description of the deviation / what went wrong'),
            batch_id: z.string().uuid().optional().describe('Related batch UUID if applicable'),
          }),
          execute: async ({ title, severity, source, description, batch_id }) => {
            const { data, error } = await supabase.from('deviations').insert({
              title, severity, source, description,
              batch_id: batch_id || null,
              reported_by: employeeId,
              status: 'Open',
            }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Deviation "${title}" raised (${severity}).`, deviation: data };
          },
        }),

        investigate_deviation: tool({
          description: 'Log a 5-Why investigation and root cause for an open deviation. Get deviation UUID from get_open_deviations.',
          parameters: z.object({
            deviation_id: z.string().uuid().describe('UUID of the deviation'),
            root_cause_identified: z.string().describe('Identified root cause — required'),
            why_1: z.string().optional().describe('Why 1 — first why in the 5-Why chain'),
            why_2: z.string().optional().describe('Why 2'),
            why_3: z.string().optional().describe('Why 3'),
            why_4: z.string().optional().describe('Why 4'),
            why_5: z.string().optional().describe('Why 5 — deepest root cause'),
          }),
          execute: async ({ deviation_id, root_cause_identified, why_1, why_2, why_3, why_4, why_5 }) => {
            const { data, error } = await supabase.from('investigations').insert({
              deviation_id, root_cause_identified,
              why_1: why_1 || null, why_2: why_2 || null, why_3: why_3 || null,
              why_4: why_4 || null, why_5: why_5 || null,
              investigator_id: employeeId,
            }).select().single();
            if (error) throw new Error(error.message);
            await supabase.from('deviations').update({ status: 'Investigating' }).eq('id', deviation_id);
            return { success: true, message: `Investigation logged. Root cause: "${root_cause_identified}".`, investigation: data };
          },
        }),

        spawn_capa_action: tool({
          description: 'Create a corrective or preventive CAPA action task linked to an investigation. Get investigation UUID after investigate_deviation.',
          parameters: z.object({
            investigation_id: z.string().uuid().describe('UUID of the investigation (from investigate_deviation)'),
            deviation_id: z.string().uuid().describe('UUID of the parent deviation'),
            action_type: z.enum(['Corrective', 'Preventive']).describe('Type of CAPA action'),
            title: z.string().describe('Task title for the action'),
            description: z.string().describe('What needs to be done'),
            assigned_to: z.string().uuid().describe('Employee UUID to assign (from get_employees)'),
            due_date: z.string().describe('Due date in YYYY-MM-DD'),
          }),
          execute: async ({ investigation_id, deviation_id, action_type, title, description, assigned_to, due_date }) => {
            const { data: taskData, error: taskError } = await supabase.from('tasks').insert({
              title, description, assigned_to, due_date, priority: 'high',
              assigned_by: employeeId, status: 'open',
            }).select().single();
            if (taskError) throw new Error(taskError.message);
            const { error: capaError } = await supabase.from('capa_actions').insert({
              investigation_id, action_type, task_id: taskData.id,
            });
            if (capaError) throw new Error(capaError.message);
            await supabase.from('deviations').update({ status: 'CAPA Assigned' }).eq('id', deviation_id);
            await supabase.from('notifications').insert({
              employee_id: assigned_to,
              title: `CAPA Action Assigned: ${title}`,
              message: `A ${action_type} CAPA action has been assigned to you, due ${due_date}.`,
              type: 'alert', link: '/capa',
            });
            return { success: true, message: `CAPA ${action_type} action created and assigned. Due ${due_date}.`, task: taskData };
          },
        }),

        // ══════════════════════════════════════════════
        //  SOP TOOLS
        // ══════════════════════════════════════════════
        get_sops: tool({
          description: 'Get all active SOPs, optionally filtered by category.',
          parameters: z.object({
            category: z.enum(['Fermentation', 'QC', 'Sanitation', 'Safety', 'all']).optional().describe('Filter by category, or "all"'),
          }),
          execute: async ({ category }) => {
            let query = supabase.from('sop_library').select('id, sop_id, title, category, version, document_url, effective_date').eq('is_active', true).order('title');
            if (category && category !== 'all') query = query.eq('category', category);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        create_sop: tool({
          description: 'Create a new SOP document entry. Gather title, category, version, and document URL before calling.',
          parameters: z.object({
            title: z.string().describe('SOP title'),
            category: z.enum(['Fermentation', 'QC', 'Sanitation', 'Safety']).describe('SOP category'),
            version: z.string().describe('Version string, e.g. "v1.0", "v2.3"'),
            document_url: z.string().url().describe('Valid URL to the SOP document (Google Drive, SharePoint, etc.)'),
            effective_date: z.string().optional().describe('Effective date in YYYY-MM-DD (optional)'),
          }),
          execute: async ({ title, category, version, document_url, effective_date }) => {
            const sop_id = `SOP-${Date.now()}`;
            const { data, error } = await supabase.from('sop_library').insert({
              sop_id, title, category, version, document_url,
              effective_date: effective_date || null,
              approved_by: employeeId,
              is_active: true,
            }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, message: `SOP "${title}" (${sop_id}) created, version ${version}.`, sop: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  LAB NOTEBOOK TOOLS
        // ══════════════════════════════════════════════
        get_lab_notebook_entries: tool({
          description: 'Get recent digital lab notebook entries.',
          parameters: z.object({
            status: z.enum(['Draft', 'Submitted', 'Countersigned', 'all']).optional().describe('Filter by status'),
          }),
          execute: async ({ status }) => {
            let query = supabase
              .from('lab_notebook_entries')
              .select('id, title, objective, status, created_at, employees!lab_notebook_entries_created_by_fkey(full_name)')
              .order('created_at', { ascending: false }).limit(20);
            if (status && status !== 'all') query = query.eq('status', status);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        create_lab_notebook_entry: tool({
          description: 'Create a new digital lab notebook entry. Gather title and at least one content field before calling.',
          parameters: z.object({
            title: z.string().describe('Entry title / experiment name'),
            objective: z.string().optional().describe('Objective of the experiment'),
            methodology: z.string().optional().describe('Methods and materials used'),
            observations: z.string().optional().describe('What was observed'),
            conclusions: z.string().optional().describe('Conclusions drawn'),
            batch_id: z.string().uuid().optional().describe('Related batch UUID (optional)'),
          }),
          execute: async ({ title, objective, methodology, observations, conclusions, batch_id }) => {
            const { data, error } = await supabase.from('lab_notebook_entries').insert({
              title,
              objective: objective || null,
              methodology: methodology || null,
              observations: observations || null,
              conclusions: conclusions || null,
              batch_id: batch_id || null,
              created_by: employeeId,
              status: 'Draft',
            }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Lab notebook entry "${title}" created as Draft.`, entry: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  SHELF LIFE TOOLS
        // ══════════════════════════════════════════════
        get_shelf_life_studies: tool({
          description: 'Get all shelf-life studies, optionally filtered by status.',
          parameters: z.object({
            status: z.enum(['In Progress', 'Completed', 'Failed', 'all']).optional().describe('Filter by status'),
          }),
          execute: async ({ status }) => {
            let query = supabase
              .from('shelf_life_studies')
              .select('id, storage_condition, test_parameters, status, start_date, batches(batch_id, variant)')
              .order('created_at', { ascending: false });
            if (status && status !== 'all') query = query.eq('status', status);
            const { data, error } = await query.limit(30);
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        create_shelf_life_study: tool({
          description: 'Start a new shelf-life study for a batch. Gather batch, storage condition, and test parameters first.',
          parameters: z.object({
            batch_id: z.string().uuid().describe('UUID of the batch to study (from get_active_batches or search_batches)'),
            storage_condition: z.string().describe('Storage condition, e.g. "Refrigerated 4°C", "Room temperature 25°C"'),
            test_parameters: z.array(z.string()).min(1).describe('List of parameters to test, e.g. ["pH", "Viable Count", "Moisture", "Colour"]'),
          }),
          execute: async ({ batch_id, storage_condition, test_parameters }) => {
            const { data, error } = await supabase.from('shelf_life_studies').insert({
              batch_id, storage_condition, test_parameters,
              status: 'In Progress',
              created_by: employeeId,
              start_date: new Date().toISOString().split('T')[0],
            }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Shelf-life study started. Condition: ${storage_condition}. Parameters: ${test_parameters.join(', ')}.`, study: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  FORMULATION TOOLS
        // ══════════════════════════════════════════════
        get_formulations: tool({
          description: 'Get all active formulations (recipes), optionally filtered by status.',
          parameters: z.object({
            status: z.enum(['Draft', 'In Review', 'Approved', 'all']).optional().describe('Filter by workflow status'),
          }),
          execute: async ({ status }) => {
            let query = supabase
              .from('formulations')
              .select('id, code, name, version, status, notes, created_at')
              .neq('status', 'Archived').order('code');
            if (status && status !== 'all') query = query.eq('status', status);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        update_formulation_status: tool({
          description: 'Approve, reject, or archive a formulation. CEO/Admin only. Use get_formulations to find the UUID.',
          parameters: z.object({
            formulation_id: z.string().uuid().describe('UUID of the formulation'),
            action: z.enum(['approve', 'reject', 'archive']).describe('Action to take'),
            rejection_reason: z.string().optional().describe('Required if action is reject — reason for rejection (min 5 chars)'),
          }),
          execute: async ({ formulation_id, action, rejection_reason }) => {
            if (action === 'reject' && (!rejection_reason || rejection_reason.trim().length < 5)) {
              throw new Error('Rejection reason is required (minimum 5 characters).');
            }
            const statusMap = { approve: 'Approved', reject: 'Draft', archive: 'Archived' };
            const updateData = { status: statusMap[action] };
            if (action === 'approve') { updateData.approved_by = employeeId; updateData.approved_at = new Date().toISOString(); }
            if (action === 'reject') updateData.rejection_reason = rejection_reason;
            const { data, error } = await supabase.from('formulations').update(updateData).eq('id', formulation_id).select('code, name, status').single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Formulation "${data.code} - ${data.name}" ${action}d.`, formulation: data };
          },
        }),

        // ══════════════════════════════════════════════
        //  PURCHASE REQUEST TOOLS
        // ══════════════════════════════════════════════
        get_purchase_requests: tool({
          description: 'Get purchase requests, optionally filtered by status.',
          parameters: z.object({
            status: z.enum(['Pending', 'Approved', 'Ordered', 'Received', 'Rejected', 'all']).optional().describe('Filter by status — default shows Pending'),
          }),
          execute: async ({ status }) => {
            let query = supabase
              .from('purchase_requests')
              .select('id, item_name, requested_quantity, unit, reason, urgency, status, created_at, employees!purchase_requests_requested_by_fkey(full_name)')
              .order('created_at', { ascending: false });
            const filterStatus = status || 'Pending';
            if (filterStatus !== 'all') query = query.eq('status', filterStatus);
            const { data, error } = await query.limit(50);
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        create_purchase_request: tool({
          description: 'Create a new purchase/procurement request. Gather item name, quantity, and urgency before calling.',
          parameters: z.object({
            item_name: z.string().describe('Name of the item to purchase'),
            requested_quantity: z.number().positive().describe('Quantity needed'),
            unit: z.string().optional().describe('Unit of measurement, e.g. kg, litres, boxes'),
            reason: z.string().optional().describe('Why this purchase is needed'),
            urgency: z.enum(['Normal', 'Urgent', 'Critical']).describe('Urgency level — default Normal'),
          }),
          execute: async ({ item_name, requested_quantity, unit, reason, urgency }) => {
            const { data, error } = await supabase.from('purchase_requests').insert({
              item_name, requested_quantity,
              unit: unit || null,
              reason: reason || null,
              urgency: urgency || 'Normal',
              requested_by: employeeId,
              status: 'Pending',
            }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Purchase request for "${item_name}" (${requested_quantity} ${unit || ''}) created — urgency: ${urgency}.`, request: data };
          },
        }),

        update_purchase_request_status: tool({
          description: 'Update the status of a purchase request — approve, mark as ordered, received, or reject it.',
          parameters: z.object({
            request_id: z.string().uuid().describe('UUID of the purchase request (from get_purchase_requests)'),
            status: z.enum(['Approved', 'Ordered', 'Received', 'Rejected']).describe('New status'),
          }),
          execute: async ({ request_id, status }) => {
            const { data, error } = await supabase
              .from('purchase_requests')
              .update({ status, resolved_at: ['Received', 'Rejected'].includes(status) ? new Date().toISOString() : null })
              .eq('id', request_id)
              .select('item_name, status').single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Purchase request for "${data.item_name}" marked as "${status}".` };
          },
        }),

        // ══════════════════════════════════════════════
        //  PAYSLIP TOOLS
        // ══════════════════════════════════════════════
        get_payslips: tool({
          description: 'Get payslip records for an employee or for a specific month/year.',
          parameters: z.object({
            employee_id: z.string().uuid().optional().describe('Filter by employee UUID (from get_employees)'),
            month: z.string().optional().describe('Month name, e.g. "May"'),
            year: z.number().optional().describe('Year, e.g. 2026'),
          }),
          execute: async ({ employee_id, month, year }) => {
            let query = supabase
              .from('payslips')
              .select('id, employee_id, month, year, gross_salary, net_salary, pf_deduction, esi_deduction, lop_days, present_days, total_working_days, employees(full_name)')
              .order('year', { ascending: false });
            if (employee_id) query = query.eq('employee_id', employee_id);
            if (month) query = query.ilike('month', month);
            if (year) query = query.eq('year', year);
            const { data, error } = await query.limit(30);
            if (error) throw new Error(error.message);
            return data || [];
          },
        }),

        // ══════════════════════════════════════════════
        //  ATTENDANCE TOOLS
        // ══════════════════════════════════════════════
        get_attendance_summary: tool({
          description: 'Get attendance summary for today or a specific date range. Shows who checked in, hours worked, and who is absent.',
          parameters: z.object({
            date: z.string().optional().describe('Specific date in YYYY-MM-DD (defaults to today)'),
            employee_id: z.string().uuid().optional().describe('Filter by specific employee UUID'),
          }),
          execute: async ({ date, employee_id }) => {
            const targetDate = date || new Date().toISOString().split('T')[0];
            let query = supabase
              .from('attendance_log')
              .select('id, employee_id, date, check_in_time, check_out_time, total_hours, mispunch_status, employees(full_name)')
              .eq('date', targetDate);
            if (employee_id) query = query.eq('employee_id', employee_id);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            const records = data || [];
            const { count: totalActive } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true);
            return {
              date: targetDate,
              checked_in: records.length,
              total_employees: totalActive || 0,
              absent: (totalActive || 0) - records.length,
              still_in: records.filter(r => r.check_in_time && !r.check_out_time).length,
              records: records.map(r => ({
                name: r.employees?.full_name,
                check_in: r.check_in_time,
                check_out: r.check_out_time,
                hours: r.total_hours,
                mispunch: r.mispunch_status,
              })),
            };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('[OxyOS AI] Route Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
