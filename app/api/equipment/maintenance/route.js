export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const maintenanceSchema = z.object({
  equipment_id: z.string().uuid(),
  calibration_date: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date" }),
  next_due_date: z.string().optional().or(z.literal('')),
  log_type: z.enum(['Calibration', 'Maintenance', 'Cleaning', 'Usage']).default('Calibration'),
  result: z.string().min(1, "Result notes are required"),
  buffer_values_used: z.string().optional(),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance'])
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role, full_name').eq('email', user.email).single();
    if (!emp) {
      return NextResponse.json({ error: 'Permission Denied: Valid employee record required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = maintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { equipment_id, calibration_date, next_due_date, log_type, result, buffer_values_used, status } = parsed.data;

    // 1. Insert log
    const { error: logErr } = await supabase.from('calibration_logs').insert({
      equipment_id,
      calibration_date,
      next_due_date: next_due_date || null,
      log_type,
      result,
      buffer_values_used: buffer_values_used || null,
      logged_by: emp.id,
      logged_at: new Date().toISOString(),
      logged_by_name: emp.full_name,
      logged_by_role: emp.role
    });
    if (logErr) throw logErr;

    // 2. Update equipment status and due date based on type
    const updates = { status };
    if (log_type === 'Calibration' && next_due_date) updates.calibration_due_date = next_due_date;
    if (log_type === 'Maintenance' && next_due_date) updates.next_pm_date = next_due_date;
    
    const { error: updateErr } = await supabase.from('equipment').update(updates).eq('id', equipment_id);
    if (updateErr) {
      if (updateErr.message && updateErr.message.includes('next_pm_date')) {
        // Fallback for environments where the pm schema migration hasn't run yet
        delete updates.next_pm_date;
        const { error: fallbackErr } = await supabase.from('equipment').update(updates).eq('id', equipment_id);
        if (fallbackErr) throw fallbackErr;
      } else {
        throw updateErr;
      }
    }
    // 3. If equipment is now Operational, auto-resolve any open tickets
    if (status === 'Operational') {
      const { data: openTickets } = await supabase
        .from('equipment_tickets')
        .select('id, title, reported_by')
        .eq('equipment_id', equipment_id)
        .eq('status', 'Open');
        
      if (openTickets && openTickets.length > 0) {
        const ticketIds = openTickets.map(t => t.id);
        
        await supabase.from('equipment_tickets').update({
          status: 'Closed',
          resolved_by: emp.id,
          resolved_at: new Date().toISOString(),
          resolution_notes: `Auto-resolved via maintenance log: ${result}`
        }).in('id', ticketIds);

        // Notify reporters
        const { sendServerNotification } = require('@/utils/serverNotify');
        const notifyPromises = openTickets.map(ticket => {
          if (ticket.reported_by && ticket.reported_by !== emp.id) {
            return sendServerNotification(
              ticket.reported_by,
              `✅ Equipment Ticket Resolved`,
              `Your ticket "${ticket.title}" has been resolved following maintenance.`,
              '/equipment',
              'success'
            );
          }
        });
        await Promise.allSettled(notifyPromises.filter(Boolean));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Maintenance API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
