import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const maintenanceSchema = z.object({
  equipment_id: z.string().uuid(),
  calibration_date: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date" }),
  next_due_date: z.string().optional().or(z.literal('')),
  result: z.string().min(1, "Result notes are required"),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance'])
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) {
      return NextResponse.json({ error: 'Permission Denied: Valid employee record required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = maintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { equipment_id, calibration_date, next_due_date, result, status } = parsed.data;

    // 1. Insert log
    const { error: logErr } = await supabase.from('calibration_logs').insert({
      equipment_id,
      calibration_date,
      next_due_date: next_due_date || null,
      result,
      logged_by: emp.id
    });
    if (logErr) throw logErr;

    // 2. Update equipment status and due date
    const updates = { status };
    if (next_due_date) updates.calibration_due_date = next_due_date;
    
    const { error: updateErr } = await supabase.from('equipment').update(updates).eq('id', equipment_id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Maintenance API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
