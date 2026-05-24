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
      model: google('gemini-2.5-flash'),
      system: `You are OxyOS Assistant, the central AI automation hub for Oxygen Bioinnovations. You are speaking to ${profile.full_name} (${effectiveRole}). Today is ${new Date().toISOString().split('T')[0]}.

CAPABILITIES:
- Morning Briefing: Full operational snapshot across all modules
- Batch Workflow Orchestration: Walk through the full batch creation SOP
- Production: Create batches, update batch status, record pH, log daily activities
- HR: View pending leaves, approve/reject leaves, check attendance
- Tasks: View open tasks, assign new tasks, update task status (complete/cancel/in-progress)
- Compliance: Add deadlines, view upcoming/overdue items, mark items as done or update status
- Inventory: Add new items, update stock levels of existing items (restock/deduct), check low stock
- Analytics: Cross-module insights, trends, and performance metrics

CRITICAL RULES:
1. ALWAYS look up UUIDs before using them. Call get_employees to find an employee UUID before assigning a task. Call get_active_batches to find a batch UUID before recording pH or updating status.
2. If asked to record pH and there are multiple active batches, ALWAYS ask which batch.
3. Be concise. After performing actions, confirm what you did with the key details.
4. Never fabricate UUIDs or batch IDs. Only use values returned by the database.
5. For the compliance category field, valid values are: FSSAI, TIIC, PF, ESI, Patent, NABL, Equipment, Lease, Other.
6. For inventory category, valid values are: Raw Material, Packaging, Consumable, Reagent, Other.

BATCH WORKFLOW ORCHESTRATION:
  When the user says "start a batch", "create a batch", or "new batch", follow this EXACT multi-step protocol:
    Step 1: Ask for batch details (variant, volume, strain) if not provided.
    Step 2: Call create_batch to create it. It will auto-log an activity entry and check equipment calibration.
    Step 3: Ask "Who should handle media preparation?" -> Call get_employees to show the team, then use assign_task. BE SMART: Set priority to 'high' and calculate the due_date as TODAY. Do not leave due_date empty.
    Step 4: Ask "Who will handle inoculation monitoring?" -> use assign_task. BE SMART: Set priority to 'urgent' and calculate the due_date as TOMORROW.
    Step 5: Summarize everything done in a clean checklist format.
  INTELLIGENCE RULE: Never assign a task without calculating a logical due_date (in YYYY-MM-DD) and assessing its priority (low/medium/high/urgent).
  Do NOT skip steps. Walk through each one conversationally.

MORNING BRIEFING BEHAVIOR:
When the user says "good morning", "briefing", "what's happening", "status update", "overview", or anything similar, IMMEDIATELY call the morning_briefing tool. Then present the results in a clean, organized format with emoji headers for each section. Highlight anything that needs immediate attention (deviations, overdue items, pending approvals). If everything is clear, say so confidently.

PROACTIVE ALERTS:
When the user opens a conversation or says hello, ALWAYS call check_alerts to see if there are any urgent issues. If there are alerts, present them BEFORE the greeting. If there are no alerts, proceed normally.

ANALYTICS:
When the user asks about trends, rates, comparisons, or performance metrics, use the get_analytics tool. Present numbers clearly with context (e.g. "12 batches this month, up from 8 last month").

HISTORICAL QUERIES:
When the user asks about past data, use the correct historical tool:
- "How many batches in May?" → search_batches with start_date=2026-05-01, end_date=2026-05-31
- "pH trend for BATCH-047" → get_ph_history with batch_id=BATCH-047
- "Deviations from last month" → get_deviations with appropriate dates
- "What work was done on BATCH-001?" → get_activity_history with batch_id=BATCH-001
- "Any issues last week?" → get_activity_history with issues_only=true
Always convert relative dates (last month, this quarter, last week) to YYYY-MM-DD format using today's date.`,
      messages,
      stopWhen: stepCountIs(8), // AI SDK v6: replaces maxSteps — allows tool call chains up to 8 steps
      tools: {
        // ══════════════════════════════════════════════════════════════════════════
        // SAMPLE INCUBATION TOOLS
        // ══════════════════════════════════════════════════════════════════════════
        log_sample_incubation: tool({
          description: 'Log a new sample incubation record (e.g. agar plate, broth).',
          parameters: z.object({
            sample_name: z.string().describe('Name or ID of the sample'),
            incubation_temp: z.string().describe('Incubation temperature, e.g. 37C'),
            start_time: z.string().describe('Start time, e.g. 2026-05-24T10:00:00Z'),
            duration_hours: z.number().optional().describe('Expected duration in hours'),
            colony_morphology: z.string().optional().describe('Details about colony morphology'),
            staining_method: z.string().optional().describe('Method used for staining'),
            observation: z.string().optional().describe('General observations'),
            od_value: z.number().optional().describe('Optical density value'),
          }),
          execute: async (params) => {
            const { error } = await supabase.from('sample_incubation_records').insert([
              { ...params, recorded_by: employeeId }
            ]);
            if (error) return { error: error.message };
            return { success: true, message: `Logged incubation for ${params.sample_name}` };
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
          description: 'Create and assign a task to an employee. Use the employee UUID from get_employees.',
          parameters: z.object({
            title: z.string().describe('Task title'),
            description: z.string().describe('Task description'),
            assigned_to: z.string().uuid().describe('Employee UUID to assign to'),
            priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('Task priority'),
            due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
          }),
          execute: async ({ title, description, assigned_to, priority, due_date }) => {
            const { data, error } = await supabase
              .from('tasks')
              .insert({
                title, description, assigned_to, priority,
                due_date: due_date || null,
                assigned_by: employeeId,
                status: 'open',
              })
              .select()
              .single();
            if (error) throw new Error(error.message);

            // Also create a notification for the assignee
            await supabase.from('notifications').insert({
              employee_id: assigned_to,
              title: `New Task: ${title}`,
              message: `You have been assigned a ${priority} priority task: ${description}`,
              type: 'info',
              link: '/tasks',
            });

            return { success: true, message: `Task "${title}" assigned and notification sent.`, task: data };
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
          description: 'Add a new regulatory or compliance deadline.',
          parameters: z.object({
            title: z.string().describe('Title of the compliance item'),
            category: z.enum(['FSSAI', 'TIIC', 'PF', 'ESI', 'Patent', 'NABL', 'Equipment', 'Lease', 'Other']).describe('Category'),
            due_date: z.string().describe('Due date in YYYY-MM-DD format'),
            notes: z.string().optional().describe('Additional notes'),
          }),
          execute: async ({ title, category, due_date, notes }) => {
            const { data, error } = await supabase
              .from('compliance_items')
              .insert({ title, category, due_date, notes: notes || null, status: 'upcoming' })
              .select()
              .single();
            if (error) throw new Error(error.message);
            return { success: true, message: `Compliance item "${title}" added, due ${due_date}.`, item: data };
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
          description: 'Add a new inventory item or restock.',
          parameters: z.object({
            item_name: z.string().describe('Name of the item'),
            category: z.enum(['Raw Material', 'Packaging', 'Consumable', 'Reagent', 'Other']).describe('Category'),
            quantity: z.number().describe('Quantity to add'),
            unit: z.string().describe('Unit of measurement (e.g. kg, litres, pieces)'),
            minimum_threshold: z.number().optional().describe('Minimum stock threshold for alerts'),
          }),
          execute: async ({ item_name, category, quantity, unit, minimum_threshold }) => {
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
            return { success: true, message: `Added ${quantity} ${unit} of ${item_name}.`, item: data };
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
