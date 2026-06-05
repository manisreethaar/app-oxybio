import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyAdmins } from '@/utils/serverNotify';
import { NextResponse } from 'next/server';
import { syncStageToLNB } from '@/lib/lnbSync';
import { validateEndpointPayload, validateReadingPayload } from '@/lib/fermentation/validation';
import { can, isMasterAdmin } from '@/lib/permissions';

// Validates that a value is a proper UUID — returns null otherwise.
// Prevents "invalid input syntax for type uuid" when empty strings,
// integer IDs, or the literal string "undefined" are passed in.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safeUuid(val) {
  if (!val || typeof val !== 'string') return null;
  return UUID_RE.test(val.trim()) ? val.trim() : null;
}

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
    'plating_done',
    'plating_status',
    'plating_config',
    'sample_incubation_id',
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

function normalizePlatingConfig(config = {}) {
  return {
    media_type: config.media_type || null,
    dilution: config.dilution || null,
    plate_count: config.plate_count ? Number.parseInt(config.plate_count, 10) : null,
    incubation_temp_c: config.incubation_temp_c ? Number.parseFloat(config.incubation_temp_c) : 37,
    expected_hours: config.expected_hours ? Number.parseInt(config.expected_hours, 10) : 48,
  };
}

async function createIntervalIncubation(supabase, { batchId, reading, payload, loggedBy }) {
  const config = normalizePlatingConfig(payload.plating_config);
  const loggedAt = payload.logged_at || reading.logged_at || new Date().toISOString();
  const elapsed = Number.isFinite(Number(payload.elapsed_hours)) ? Number(payload.elapsed_hours) : null;
  const sampleName = `${payload.flask_label || 'Flask'} - T+${elapsed != null ? elapsed.toFixed(1) : '0.0'}h Plate`;

  const { data: incubation, error } = await supabase
    .from('sample_incubation_records')
    .insert({
      sample_name: sampleName,
      batch_id: batchId,
      flask_id: payload.flask_id || null,
      fermentation_reading_id: reading.id,
      sample_category: 'Fermentation IPC',
      sample_type: 'Agar Plate',
      incubation_date: new Date(loggedAt).toISOString().slice(0, 10),
      start_time: new Date(loggedAt).toISOString(),
      incubation_temp_c: config.incubation_temp_c,
      sterility_status: 'Pending',
      source_stage: 'fermentation_monitoring',
      source_type: 'Interval Plating',
      sampled_at: new Date(loggedAt).toISOString(),
      observation: [
        config.media_type ? `Media: ${config.media_type}` : null,
        config.dilution ? `Dilution: ${config.dilution}` : null,
        config.plate_count ? `Plates: ${config.plate_count}` : null,
        config.expected_hours ? `Expected incubation: ${config.expected_hours}h` : null,
      ].filter(Boolean).join(' | ') || null,
      logged_by: loggedBy || null,
    })
    .select()
    .single();

  if (error) throw error;

  await syncStageToLNB(supabase, batchId, 'sample_incubation', {
    sample_name: incubation.sample_name,
    sample_category: incubation.sample_category,
    sample_type: incubation.sample_type,
    source_stage: incubation.source_stage,
    source_type: incubation.source_type,
    fermentation_reading_id: reading.id,
    incubation_date: incubation.incubation_date,
    incubation_temp_c: incubation.incubation_temp_c,
    start_time: incubation.start_time,
    sterility_status: incubation.sterility_status,
    plating_config: config,
    observation: incubation.observation,
  }, `${payload.flask_label || 'Flask'} T+${elapsed != null ? elapsed.toFixed(1) : '0.0'}h`);

  const { data: updated, error: updateError } = await supabase
    .from('batch_fermentation_readings')
    .update({
      sample_incubation_id: incubation.id,
      plating_status: 'done_incubating',
    })
    .eq('id', reading.id)
    .select()
    .single();

  if (updateError) throw updateError;
  return { reading: updated || reading, incubation };
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
      const validation = validateReadingPayload(data);
      if (!validation.ok) {
        return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });
      }

      const platingDone = Boolean(data.plating_done);
      const platingConfig = normalizePlatingConfig(data.plating_config || {});
      const { data: row, error } = await supabase
        .from('batch_fermentation_readings')
        .insert({
          batch_id:          batchId,
          flask_id:          safeUuid(data.flask_id),
          flask_label:       data.flask_label || null,
          logged_at:         data.logged_at || new Date().toISOString(),
          elapsed_hours:     data.elapsed_hours || null,
          ph:                validation.values.ph,
          incubator_temp_c:  validation.values.incubator_temp_c,
          brix:                   data.brix || null,
          optical_density:        data.optical_density || null,
          titratable_acidity_pct: data.titratable_acidity_pct ?? null,
          do_percent:             data.do_percent ?? null,
          co2_pressure_kpa:       data.co2_pressure_kpa ?? null,
          incubator_equipment_id: safeUuid(data.incubator_equipment_id),
          co2_observed:           data.co2_observed || null,
          ethanol_pct:            data.ethanol_pct ?? null,
          plating_result:         data.plating_result || null,
          plating_done:      platingDone,
          plating_status:    platingDone ? 'done_incubating' : (data.plating_status || 'not_done'),
          plating_config:    platingDone ? platingConfig : {},
          foam_level:        data.foam_level || null,
          visual_appearance: data.visual_appearance || null,
          is_retrospective:  data.is_retrospective || false,
          retro_reason:      data.retro_reason || null,
          logged_by:         safeUuid(data.logged_by),
          supervised_by:     safeUuid(data.supervised_by),
          notes:             data.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      let responseRow = row;
      let incubation = null;
      if (platingDone) {
        const linked = await createIntervalIncubation(supabase, {
          batchId,
          reading: row,
          payload: { ...data, plating_config: platingConfig },
          loggedBy: data.logged_by || null,
        });
        responseRow = linked.reading;
        incubation = linked.incubation;
      }

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

      return NextResponse.json({ success: true, data: responseRow, incubation, alarms: { ph: saved?.is_ph_alarm, temp: saved?.is_temp_alarm } });
    }

    if (type === 'endpoint') {
      const validation = validateEndpointPayload(data);
      if (!validation.ok) {
        return NextResponse.json({ success: false, error: validation.errors.join(' ') }, { status: 400 });
      }

      if (!data.flask_id) {
        return NextResponse.json({ success: false, error: 'Flask ID is required.' }, { status: 400 });
      }

      const endpointPayload = {
        flask_id: data.flask_id,
        batch_id: batchId,
        total_hours: validation.values.total_hours,
        end_time: new Date(data.end_time).toISOString(),
        final_ph: validation.values.final_ph,
        aroma: data.aroma || null,
        colour_desc: data.colour_desc || null,
        texture: data.texture || null,
        sensory_overall: data.sensory_overall || null,
        gram_stain: data.gram_stain || null,
        notes: data.notes || null,
        declared_by: data.declared_by || null,
      };

      const { data: endpoint, error } = await supabase
        .from('batch_flask_endpoints')
        .upsert(endpointPayload, { onConflict: 'flask_id' })
        .select()
        .single();

      if (error) throw error;

      await syncStageToLNB(supabase, batchId, 'fermentation', {
        total_hours: endpointPayload.total_hours,
        end_time: endpointPayload.end_time,
        final_ph: endpointPayload.final_ph,
        aroma: endpointPayload.aroma,
        colour_desc: endpointPayload.colour_desc,
        texture: endpointPayload.texture,
        sensory_overall: endpointPayload.sensory_overall,
        gram_stain: endpointPayload.gram_stain,
        notes: endpointPayload.notes,
      }, data.flask_label || 'Flask');

      return NextResponse.json({
        success: true,
        data: endpoint,
        warnings: validation.values.is_endpoint_ph_out_of_range ? ['Final pH is outside the 4.2-4.5 target band.'] : [],
      });
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

    const [readingsRes, endpointsRes, inocuRes] = await Promise.all([
      supabase.from('batch_fermentation_readings').select('*').eq('batch_id', batchId).order('logged_at'),
      supabase.from('batch_flask_endpoints').select('*').eq('batch_id', batchId),
      supabase.from('batch_flask_inoculations').select('t_zero_time').eq('batch_id', batchId).not('t_zero_time', 'is', null).order('t_zero_time').limit(1).maybeSingle(),
    ]);

    return NextResponse.json({
      success: true,
      readings:  readingsRes.data  || [],
      endpoint:  endpointsRes.data?.[0] || null,
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

    if (!can(requester.employee.role, 'batches', 'release') && !isMasterAdmin(requester.user.email)) {
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

    if (!can(requester.employee.role, 'batches', 'release') && !isMasterAdmin(requester.user.email)) {
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
