import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';

export const maxDuration = 30; // max duration in seconds

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Verify role is CEO or admin
    const { data: profile, error: profileError } = await supabase
      .from('employees')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || (profile.role !== 'ceo' && profile.role !== 'admin')) {
      return new Response('Forbidden', { status: 403 });
    }

    const { messages } = await req.json();

    const result = streamText({
      model: google('gemini-2.5-flash'), // or gemini-2.5-pro
      system: `You are the OxyOS AI Assistant, accessible only to the CEO. You help manage laboratory batches and operations.
When asked to create a batch, use the create_batch tool.
When asked to record a parameter like pH, first check the active batches using get_active_batches to ensure you have the correct UUID batch_id.
IMPORTANT: If there are multiple active batches and the user says "record pH as 7.2", you MUST ask "Which active batch is this for?" and present the active batch options before recording.
Be concise and professional. Do not invent batch IDs, only use what is returned by the database.`,
      messages,
      tools: {
        get_active_batches: tool({
          description: 'Get a list of all currently active (fermenting or qc-hold) batches.',
          parameters: z.object({}),
          execute: async () => {
            const { data, error } = await supabase
              .from('batches')
              .select('id, batch_id, variant, status, start_time')
              .in('status', ['fermenting', 'qc-hold'])
              .order('created_at', { ascending: false });
            
            if (error) throw new Error(error.message);
            return data;
          },
        }),
        create_batch: tool({
          description: 'Create a new batch and activate interlinked modules.',
          parameters: z.object({
            batch_id: z.string().describe('The unique batch identifier, e.g., BATCH-001'),
            variant: z.enum(['Sweetened', 'Unsweetened']).describe('The product variant'),
            volume_litres: z.number().describe('Total volume in litres'),
            probiotic_strain: z.string().describe('The probiotic strain used')
          }),
          execute: async ({ batch_id, variant, volume_litres, probiotic_strain }) => {
            const { data, error } = await supabase
              .from('batches')
              .insert({
                batch_id,
                variant,
                volume_litres,
                probiotic_strain,
                status: 'fermenting',
                start_time: new Date().toISOString()
              })
              .select()
              .single();
            
            if (error) throw new Error(error.message);
            return { success: true, batch: data };
          },
        }),
        record_ph: tool({
          description: 'Record a pH value for a specific batch. ALWAYS use the UUID from get_active_batches.',
          parameters: z.object({
            batch_id: z.string().uuid().describe('The internal UUID of the batch (NOT the human readable batch_id like BATCH-001)'),
            ph_value: z.number().describe('The pH value measured'),
            time_elapsed_hours: z.number().optional().describe('Hours elapsed since batch start')
          }),
          execute: async ({ batch_id, ph_value, time_elapsed_hours }) => {
            const { data, error } = await supabase
              .from('ph_readings')
              .insert({
                batch_id,
                logged_by: user.id,
                ph_value,
                time_elapsed_hours: time_elapsed_hours || 0
              })
              .select()
              .single();
            
            if (error) throw new Error(error.message);
            return { success: true, reading: data };
          }
        })
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('AI Chat Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
