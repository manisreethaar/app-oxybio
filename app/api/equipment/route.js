import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAccess } from '@/lib/access';

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
    const { error: accessError } = await requireAccess(supabase, 'equipment', 'create');
    if (accessError) return accessError;

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
    const { error: accessError } = await requireAccess(supabase, 'equipment', 'edit');
    if (accessError) return accessError;

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

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const { error: accessError } = await requireAccess(supabase, 'equipment', 'delete');
    if (accessError) return accessError;

    const { error } = await supabase.from('equipment').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
