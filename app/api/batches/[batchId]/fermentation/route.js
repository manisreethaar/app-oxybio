import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { batchId } = params;
    const body = await request.json();
    const { type, ...data } = body;

    // ── POST a fermentation reading ────────────────────────────
    if (type === 'reading') {
      const { data: row, error } = await supabase
        .from('batch_fermentation_readings')
        .insert({
          batch_id:          batchId,
          flask_id:          data.flask_id || null,
          flask_label:       data.flask_label || null,
          logged_at:         data.logged_at || new Date().toISOString(),
          elapsed_hours:     data.elapsed_hours || null,
          ph:                data.ph || null,
          incubator_temp_c:  data.incubator_temp_c || null,
          foam_level:        data.foam_level || null,
          visual_appearance: data.visual_appearance || null,
          is_retrospective:  data.is_retrospective || false,
          retro_reason:      data.retro_reason || null,
          logged_by:         data.logged_by || null,
          supervised_by:     data.supervised_by || null,
          notes:             data.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // ── Dispatch alarm notifications if triggered ───────────
      // The DB trigger sets is_ph_alarm / is_temp_alarm. Read back the row.
      const { data: saved } = await supabase
        .from('batch_fermentation_readings')
        .select('is_ph_alarm, is_temp_alarm')
        .eq('id', row.id)
        .single();

      if (saved?.is_ph_alarm || saved?.is_temp_alarm) {
        // Fetch CEO employee ID
        const { data: ceo } = await supabase
          .from('employees')
          .select('id')
          .in('role', ['ceo', 'admin'])
          .limit(3);

        if (ceo?.length) {
          const batchLabel = data.flask_label ? `${batchId} (${data.flask_label})` : batchId;
          const notifRows = ceo.map(c => {
            const msgs = [];
            if (saved.is_ph_alarm)   msgs.push(`pH ${data.ph} (outside 3.8–5.5)`);
            if (saved.is_temp_alarm) msgs.push(`Temp ${data.incubator_temp_c}°C (outside 36–38°C)`);
            return {
              employee_id: c.id,
              title: `⚠ Fermentation Alarm — ${batchLabel}`,
              message: `T+${data.elapsed_hours?.toFixed(1)}hr: ${msgs.join(', ')}`,
              type: 'alert',
              link: `/batches/${batchId}`,
            };
          });
          await supabase.from('notifications').insert(notifRows).then(()=>{}).catch(()=>{});
        }
      }

      return NextResponse.json({ success: true, data: row, alarms: { ph: saved?.is_ph_alarm, temp: saved?.is_temp_alarm } });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });

  } catch (err) {
    console.error('Fermentation API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { batchId } = params;

    const [readingsRes, endpointRes, inocuRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('*').eq('batch_id', batchId).order('logged_at'),
      supabase.from('batch_fermentation_endpoint').select('*, batch_flask_endpoints(*)').eq('batch_id', batchId).single(),
      supabase.from('batch_stage_inoculation').select('t_zero_time').eq('batch_id', batchId).single(),
    ]);

    return NextResponse.json({
      success: true,
      readings:  readingsRes.data  || [],
      endpoint:  endpointRes.data  || null,
      t_zero:    inocuRes.data?.t_zero_time || null,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
