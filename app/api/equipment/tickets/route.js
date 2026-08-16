export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { notifyAdmins } from '@/utils/serverNotify';

const ticketSchema = z.object({
  equipment_id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium')
});

export async function GET(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get('equipment_id');

    let q = supabase.from('equipment_tickets').select('*, reporter:reported_by(full_name, initials), resolver:resolved_by(full_name, initials)').order('created_at', { ascending: false });
    
    if (equipmentId) {
      q = q.eq('equipment_id', equipmentId);
    }

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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role, full_name').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });

    const body = await request.json();
    const parsed = ticketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { equipment_id, title, description, severity } = parsed.data;

    const { data, error } = await supabase
      .from('equipment_tickets')
      .insert({
        equipment_id,
        title,
        description: description || null,
        severity,
        reported_by: emp.id,
        logged_at: new Date().toISOString(),
        logged_by_name: emp.full_name,
        logged_by_role: emp.role
      })
      .select()
      .single();

    if (error) throw error;

    // Update equipment status based on severity
    if (severity === 'Critical') {
      await supabase.from('equipment').update({ status: 'Out of Service' }).eq('id', equipment_id);
    } else {
      await supabase.from('equipment').update({ status: 'Under Maintenance' }).eq('id', equipment_id);
    }

    // Notify admins about the new ticket
    const notifType = severity === 'Critical' ? 'alert' : 'warning';
    const notifTitle = severity === 'Critical'
      ? `🔴 Critical Equipment Failure — Action Required`
      : `⚠️ Equipment Ticket Raised`;
    notifyAdmins(
      notifTitle,
      `${severity} ticket filed: "${title}". Equipment has been set to ${severity === 'Critical' ? 'Out of Service' : 'Under Maintenance'}.`,
      '/equipment',
      notifType
    ).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
