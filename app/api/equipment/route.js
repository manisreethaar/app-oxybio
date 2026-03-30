import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const equipmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  calibration_due_date: z.string().optional().or(z.literal('')),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance']).default('Operational')
});

export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('equipment')
      .select('*, calibration_logs(*)')
      .order('name');

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!['admin','ceo','cto','research_fellow','scientist'].includes(emp?.role)) {
      return NextResponse.json({ error: 'Permission Denied: Access restricted' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = equipmentSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { name, model, serial_number, calibration_due_date, status } = parsed.data;

    const { data, error } = await supabase
      .from('equipment')
      .insert({ name, model, serial_number, calibration_due_date: calibration_due_date || null, status })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!['admin','ceo','cto','research_fellow','scientist'].includes(emp?.role)) {
      return NextResponse.json({ error: 'Permission Denied: Access restricted' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, model, serial_number, calibration_due_date, status } = body;

    if (!id || !name) {
      return NextResponse.json({ error: 'Validation failed: ID and Name required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('equipment')
      .update({ name, model, serial_number, calibration_due_date: calibration_due_date || null, status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
