import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';

export const maxDuration = 30;

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) return new Response('Unauthorized', { status: 401 });

    const { data: profile } = await supabase.from('employees').select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'ceo' && profile.role !== 'admin')) {
      return new Response('Forbidden', { status: 403 });
    }

    const { messages } = await req.json();

    const result = streamText({
      model: google('gemini-2.5-flash'),
      system: `You are the OxyOS AI Assistant, a central automation hub accessible only to the CEO/Admin. You can manage Production, HR, Task Management, Compliance, and Inventory.
CRITICAL RULES:
1. Always look up UUIDs. If you need an employee's UUID to assign a task, use get_employees first. If you need a batch's UUID, use get_active_batches.
2. If asked to create a batch and assign a task for it, ALWAYS ask the user who to assign the task to first. Don't guess the assignee.
3. Be concise. Confirm what actions you successfully took.`,
      messages,
      tools: {
        // --- PRODUCTION TOOLS ---
        get_active_batches: tool({
          description: 'Get a list of all currently active (fermenting or qc-hold) batches.',
          parameters: z.object({}),
          execute: async () => {
            const { data } = await supabase.from('batches').select('id, batch_id, variant, status').in('status', ['fermenting', 'qc-hold']);
            return data;
          },
        }),
        create_batch: tool({
          description: 'Create a new batch.',
          parameters: z.object({
            batch_id: z.string(), variant: z.enum(['Sweetened', 'Unsweetened']), volume_litres: z.number(), probiotic_strain: z.string()
          }),
          execute: async (args) => {
            const { data, error } = await supabase.from('batches').insert({ ...args, status: 'fermenting', start_time: new Date().toISOString() }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, batch: data };
          },
        }),
        update_batch_status: tool({
          description: 'Update the status of a batch.',
          parameters: z.object({ batch_id: z.string().uuid(), status: z.enum(['fermenting', 'qc-hold', 'released', 'rejected', 'deviation']) }),
          execute: async ({ batch_id, status }) => {
            const { data, error } = await supabase.from('batches').update({ status }).eq('id', batch_id).select().single();
            if (error) throw new Error(error.message);
            return { success: true, batch: data };
          }
        }),
        record_ph: tool({
          description: 'Record a pH value for a specific batch using its UUID.',
          parameters: z.object({ batch_id: z.string().uuid(), ph_value: z.number() }),
          execute: async ({ batch_id, ph_value }) => {
            const { data, error } = await supabase.from('ph_readings').insert({ batch_id, logged_by: user.id, ph_value }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, reading: data };
          }
        }),
        log_activity: tool({
          description: 'Log an activity for a batch or general. Uses the human readable batch_id (text), NOT the UUID.',
          parameters: z.object({ batch_id: z.string().optional(), activity_description: z.string(), issue_observed: z.boolean().default(false) }),
          execute: async (args) => {
            const { data, error } = await supabase.from('activity_log').insert({ ...args, employee_id: user.id, log_date: new Date().toISOString().split('T')[0] }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, log: data };
          }
        }),

        // --- HR & TASK TOOLS ---
        get_employees: tool({
          description: 'Get a list of all employees and their UUIDs to use for assigning tasks.',
          parameters: z.object({}),
          execute: async () => {
            const { data } = await supabase.from('employees').select('id, full_name, email, role, department');
            return data;
          }
        }),
        get_pending_leaves: tool({
          description: 'Get a list of all pending leave applications.',
          parameters: z.object({}),
          execute: async () => {
            const { data } = await supabase.from('leave_applications').select('id, employee_id, leave_type, start_date, end_date, reason, status').eq('status', 'pending');
            return data;
          }
        }),
        review_leave: tool({
          description: 'Approve or reject a leave application.',
          parameters: z.object({ leave_id: z.string().uuid(), status: z.enum(['approved', 'rejected']), admin_comment: z.string().optional() }),
          execute: async ({ leave_id, status, admin_comment }) => {
            const { data, error } = await supabase.from('leave_applications').update({ status, admin_comment, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', leave_id).select().single();
            if (error) throw new Error(error.message);
            return { success: true, leave: data };
          }
        }),
        assign_task: tool({
          description: 'Assign a task to an employee using their UUID.',
          parameters: z.object({ title: z.string(), description: z.string(), assigned_to: z.string().uuid(), priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium') }),
          execute: async (args) => {
            const { data, error } = await supabase.from('tasks').insert({ ...args, assigned_by: user.id, status: 'open' }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, task: data };
          }
        }),
        
        // --- COMPLIANCE TOOLS ---
        add_compliance_item: tool({
          description: 'Add a new regulatory or compliance deadline.',
          parameters: z.object({ title: z.string(), category: z.string(), due_date: z.string() }),
          execute: async (args) => {
            const { data, error } = await supabase.from('compliance_items').insert({ ...args, status: 'upcoming' }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, item: data };
          }
        }),

        // --- INVENTORY & EQUIPMENT TOOLS ---
        add_inventory: tool({
          description: 'Add or restock an inventory item.',
          parameters: z.object({ item_name: z.string(), category: z.string(), quantity: z.number(), unit: z.string() }),
          execute: async (args) => {
            const { data, error } = await supabase.from('inventory').insert({ ...args, last_restocked: new Date().toISOString().split('T')[0] }).select().single();
            if (error) throw new Error(error.message);
            return { success: true, item: data };
          }
        })
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('AI Chat Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
