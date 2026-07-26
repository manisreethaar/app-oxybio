import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAccess } from '@/lib/access';

const equipmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  calibration_due_date: z.string().optional().or(z.literal('')),
  status: z.enum(['Operational', 'Out of Service', 'Under Maintenance']).default('Operational'),
  iq_doc_url: z.string().optional().or(z.literal('')),
  oq_doc_url: z.string().optional().or(z.literal('')),
  pq_doc_url: z.string().optional().or(z.literal('')),
  pm_frequency_days: z.number().int().optional().nullable(),
  next_pm_date: z.string().optional().or(z.literal('')),
});

export async function GET(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('include_archived') === 'true';
    let q = supabase.from('equipment').select('*, calibration_logs(*)').order('name');
    if (!includeArchived) q = q.is('archived_at', null);
    const { data, error } = await q;

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

    const { name, model, serial_number, calibration_due_date, status, iq_doc_url, oq_doc_url, pq_doc_url, pm_frequency_days, next_pm_date } = parsed.data;

    const { data, error } = await supabase
      .from('equipment')
      .insert({ name, model, serial_number, calibration_due_date: calibration_due_date || null, status, iq_doc_url, oq_doc_url, pq_doc_url, pm_frequency_days: pm_frequency_days || null, next_pm_date: next_pm_date || null })
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
    const { id, name, model, serial_number, calibration_due_date, status, iq_doc_url, oq_doc_url, pq_doc_url, pm_frequency_days, next_pm_date } = body;

    if (!id || !name) {
      return NextResponse.json({ error: 'Validation failed: ID and Name required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('equipment')
      .update({ name, model, serial_number, calibration_due_date: calibration_due_date || null, status, iq_doc_url, oq_doc_url, pq_doc_url, pm_frequency_days: pm_frequency_days || null, next_pm_date: next_pm_date || null })
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
    const permanent = searchParams.get('permanent') === 'true';

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const { error: accessError, employee: emp } = await requireAccess(supabase, 'equipment', 'delete');
    if (accessError) return accessError;

    if (permanent) {
      const { error } = await supabase.from('equipment').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Equipment permanently deleted.' });
    }

    const { error } = await supabase.from('equipment')
      .update({ archived_at: new Date().toISOString(), archived_by: emp?.id || null })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, message: 'Equipment archived.' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
