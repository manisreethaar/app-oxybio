import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';

export const maxDuration = 60; // Increased from 30s — multi-tool chains need more time

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
      system: `You are OxyOS Assistant, the central AI automation hub for Oxygen Bioinnovations. You are speaking to ${profile.full_name} (${effectiveRole}).

CAPABILITIES:
- Production: Create batches, update batch status, record pH, log daily activities
- HR: View pending leaves, approve/reject leaves
- Tasks: List employees, assign tasks to specific people
- Compliance: Add regulatory deadlines
- Inventory: Add or restock inventory items

CRITICAL RULES:
1. ALWAYS look up UUIDs before using them. Call get_employees to find an employee UUID before assigning a task. Call get_active_batches to find a batch UUID before recording pH or updating status.
2. If the user asks to create a batch AND assign a monitoring task, FIRST create the batch, THEN ask the user who to assign the monitoring task to. List employees if needed.
3. If asked to record pH and there are multiple active batches, ALWAYS ask which batch.
4. Be concise. After performing actions, confirm what you did with the key details.
5. Never fabricate UUIDs or batch IDs. Only use values returned by the database.
6. For the compliance category field, valid values are: FSSAI, TIIC, PF, ESI, Patent, NABL, Equipment, Lease, Other.
7. For inventory category, valid values are: Raw Material, Packaging, Consumable, Reagent, Other.`,
      messages,
      maxSteps: 5, // Allow chained tool calls (e.g. get_employees → assign_task)
      tools: {
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

        create_batch: tool({
          description: 'Create a new production batch. Returns the created batch with its UUID.',
          parameters: z.object({
            batch_id: z.string().describe('Human-readable batch identifier, e.g. BATCH-001'),
            variant: z.enum(['Sweetened', 'Unsweetened']).describe('Product variant'),
            volume_litres: z.number().describe('Total volume in litres'),
            probiotic_strain: z.string().describe('Probiotic strain name'),
          }),
          execute: async ({ batch_id, variant, volume_litres, probiotic_strain }) => {
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
            return { success: true, message: `Batch ${batch_id} created successfully.`, batch: data };
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
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[OxyOS AI] Route Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
