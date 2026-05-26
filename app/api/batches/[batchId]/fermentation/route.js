import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyAdmins } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';

const EDIT_ROLES = ['admin', 'ceo', 'cto'];

async function getRequester(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role')
    .eq('email', user.email)
    .maybeSingle();

  if (!employee) return { error: NextResponse.json({ error: 'Employee profile not found' }, { status: 403 }) };
  return { user, employee };
}

function pickReadingUpdates(updates = {}) {
  const allowed = [
    'ph',
    'incubator_temp_c',
    'brix',
    'optical_density',
    'foam_level',
    'visual_appearance',
    'plating_result',
    'notes',
    'logged_at',
    'elapsed_hours',
    'is_retrospective',
    'retro_reason',
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(updates, key))
      .map((key) => [key, updates[key]])
  );
}

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
          brix:              data.brix || null,
          optical_density:   data.optical_density || null,
          plating_result:    data.plating_result || null,
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
        const batchLabel = data.flask_label ? `${batchId} (${data.flask_label})` : batchId;
        const msgs = [];
        if (saved.is_ph_alarm)   msgs.push(`pH ${data.ph} (outside 3.8–5.5)`);
        if (saved.is_temp_alarm) msgs.push(`Temp ${data.incubator_temp_c}°C (outside 36–38°C)`);

        await notifyAdmins(
          `⚠ Fermentation Alarm — ${batchLabel}`,
          `T+${data.elapsed_hours?.toFixed(1)}hr: ${msgs.join(', ')}`,
          `/batches/${batchId}`,
          'alert'
        ).catch(()=>{});

        // Auto-create task so the alarm has an actionable audit trail
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        await supabase.from('tasks').insert({
          title: `⚠ Fermentation Alarm: ${msgs.join(', ')}`,
          description: `Auto-raised at T+${data.elapsed_hours?.toFixed(1)}hr for batch ${batchId}${data.flask_label ? ` (${data.flask_label})` : ''}. Investigate and log corrective action.`,
          priority: 'high', status: 'todo',
          batch_id: batchId,
          assigned_to: data.logged_by || null,
          assigned_by: data.logged_by || null,
          due_date: tomorrow.toISOString().slice(0, 10),
        }).catch(()=>{});
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

export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const requester = await getRequester(supabase);
    if (requester.error) return requester.error;

    if (!EDIT_ROLES.includes(requester.employee.role?.toLowerCase())) {
      return NextResponse.json({ error: 'Only admin, CEO, or CTO can edit fermentation readings.' }, { status: 403 });
    }

    const { batchId } = params;
    const { reading_id, updates, reason } = await request.json();

    if (!reading_id) return NextResponse.json({ error: 'Missing reading_id' }, { status: 400 });
    if (!reason || reason.trim().length < 3) {
      return NextResponse.json({ error: 'A reason for editing this reading is required.' }, { status: 400 });
    }

    const safeUpdates = pickReadingUpdates(updates);
    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided.' }, { status: 400 });
    }

    const adminDb = createAdminClient();
    const { data, error } = await adminDb
      .from('batch_fermentation_readings')
      .update({
        ...safeUpdates,
        edited_at: new Date().toISOString(),
        edited_by: requester.employee.id,
        edit_reason: reason.trim(),
      })
      .eq('id', reading_id)
      .eq('batch_id', batchId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Fermentation reading not found.' }, { status: 404 });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Fermentation edit API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = createClient();
    const requester = await getRequester(supabase);
    if (requester.error) return requester.error;

    if (!EDIT_ROLES.includes(requester.employee.role?.toLowerCase())) {
      return NextResponse.json({ error: 'Only admin, CEO, or CTO can delete fermentation readings.' }, { status: 403 });
    }

    const { batchId } = params;
    const { reading_id, reason } = await request.json();

    if (!reading_id) return NextResponse.json({ error: 'Missing reading_id' }, { status: 400 });
    if (!reason || reason.trim().length < 3) {
      return NextResponse.json({ error: 'A reason for deleting this reading is required.' }, { status: 400 });
    }

    const adminDb = createAdminClient();
    const { data, error } = await adminDb
      .from('batch_fermentation_readings')
      .delete()
      .eq('id', reading_id)
      .eq('batch_id', batchId)
      .select('id')
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Fermentation reading not found.' }, { status: 404 });

    return NextResponse.json({ success: true, deleted_id: data.id });
  } catch (err) {
    console.error('Fermentation delete API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
