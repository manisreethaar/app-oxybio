import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { sendServerNotification } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('shift_handovers')
      .select('*, outgoing:employees!shift_handovers_outgoing_shift_id_fkey(full_name, initials), incoming:employees!shift_handovers_incoming_shift_id_fkey(full_name, initials)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    const body = await request.json();

    // Fetch active batches snapshot for automatic batch_summaries
    const { data: activeBatches } = await supabase
      .from('batches')
      .select('id, batch_id, current_stage, status, batch_flasks(flask_label, current_stage, status)')
      .in('status', ['fermenting', 'active', 'processing'])
      .limit(20);

    const batchSummaries = (activeBatches || []).map(b => ({
      batch_id: b.batch_id,
      stage: b.current_stage,
      flasks: (b.batch_flasks || []).map(f => ({ label: f.flask_label, stage: f.current_stage, status: f.status })),
    }));

    const { data, error } = await supabase.from('shift_handovers').insert({
      outgoing_shift_id: emp?.id || null,
      incoming_shift_id: body.incoming_employee_id || null,
      handover_notes: body.handover_notes || null,
      critical_alerts: body.critical_alerts || null,
      pending_readings: body.pending_readings || null,
      batch_summaries: batchSummaries,
      active_alarms: body.active_alarms || [],
      shift_date: new Date().toISOString().slice(0, 10),
      signed_off_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    // Notify the incoming employee about the shift handover
    if (body.incoming_employee_id) {
      sendServerNotification(
        body.incoming_employee_id,
        '🔁 Shift Handover Ready',
        `A shift handover has been logged for you${data.critical_alerts ? ` — Critical alerts: ${String(data.critical_alerts).slice(0, 80)}` : '. Review notes before starting your shift.'}`,
        '/shift-handover',
        data.critical_alerts ? 'alert' : 'info'
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
