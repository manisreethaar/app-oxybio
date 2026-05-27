/**
 * lib/labBench/bridgeSync.js
 *
 * Bridge sync functions for Lab Bench Quick Log.
 * When a sample is logged via /lab-bench/log, these functions
 * write the same data into the existing module tables so that
 * Batch, Growth Study, and Incubation module pages keep working
 * without any changes.
 *
 * This is the V1 bridge layer. In a future migration, module pages
 * will read from test_results directly and these syncs can be removed.
 */

import { syncStageToLNB } from '@/lib/lnbSync';
import { notifyAdmins } from '@/utils/serverNotify';

// ─────────────────────────────────────────────────────────────────────────────
// Batch → batch_fermentation_readings
// Replicates the alarm detection, LNB sync, and incubation creation logic
// from /api/batches/[batchId]/fermentation POST type:'reading'
// ─────────────────────────────────────────────────────────────────────────────
export async function syncToBatchFermentation(supabase, {
  batchId,
  flaskId,
  flaskLabel,
  logHour,
  collectedAt,
  tests,       // test objects from Quick Log payload
  employeeId,
}) {
  const phTest    = tests.find(t => t.test_type === 'ph'             && !t.skipped);
  const odTest    = tests.find(t => t.test_type === 'od'             && !t.skipped);
  const plateTest = tests.find(t => t.test_type === 'plate_analysis' && !t.skipped);

  const ph             = phTest?.numeric_value != null ? Number(phTest.numeric_value) : null;
  const opticalDensity = odTest?.numeric_value  != null ? Number(odTest.numeric_value)  : null;
  const incubatorTempC = phTest?.detail?.incubator_temp_c != null
    ? Number(phTest.detail.incubator_temp_c)
    : null;

  const platingDone   = !!plateTest;
  const platingConfig = platingDone ? {
    media_type:        plateTest.detail?.media_type       ?? null,
    dilution:          plateTest.detail?.dilution          ?? null,
    plate_count:       plateTest.detail?.plate_count != null
                         ? parseInt(plateTest.detail.plate_count, 10)
                         : null,
    incubation_temp_c: plateTest.detail?.incubation_temp_c != null
                         ? parseFloat(plateTest.detail.incubation_temp_c)
                         : 37,
    expected_hours:    plateTest.detail?.expected_hours != null
                         ? parseInt(plateTest.detail.expected_hours, 10)
                         : 48,
  } : {};

  // Gather notes from any test that has one, or from the first non-null
  const notesText = tests.map(t => t.notes).filter(Boolean)[0] || null;

  const { data: reading, error: readingErr } = await supabase
    .from('batch_fermentation_readings')
    .insert({
      batch_id:          batchId,
      flask_id:          flaskId    || null,
      flask_label:       flaskLabel || null,
      logged_at:         collectedAt || new Date().toISOString(),
      elapsed_hours:     logHour    ?? null,
      ph,
      incubator_temp_c:  incubatorTempC,
      optical_density:   opticalDensity,
      plating_done:      platingDone,
      plating_status:    platingDone ? 'done_incubating' : 'not_done',
      plating_config:    platingDone ? platingConfig : {},
      notes:             notesText,
      logged_by:         employeeId || null,
    })
    .select()
    .single();

  if (readingErr) throw readingErr;

  // Auto-create sample_incubation_records row if plating was done
  // (mirrors createIntervalIncubation in fermentation/route.js)
  let incubation = null;
  if (platingDone) {
    const sampleName = `${flaskLabel || 'Flask'} - T+${logHour != null ? Number(logHour).toFixed(1) : '0.0'}h Plate`;
    const loggedAt   = collectedAt || new Date().toISOString();

    const { data: inc, error: incErr } = await supabase
      .from('sample_incubation_records')
      .insert({
        sample_name:             sampleName,
        batch_id:                batchId,
        flask_id:                flaskId || null,
        fermentation_reading_id: reading.id,
        sample_category:         'Fermentation IPC',
        sample_type:             'Agar Plate',
        incubation_date:         new Date(loggedAt).toISOString().slice(0, 10),
        start_time:              new Date(loggedAt).toISOString(),
        incubation_temp_c:       platingConfig.incubation_temp_c,
        sterility_status:        'Pending',
        source_stage:            'fermentation_monitoring',
        source_type:             'Interval Plating',
        sampled_at:              new Date(loggedAt).toISOString(),
        observation: [
          platingConfig.media_type  ? `Media: ${platingConfig.media_type}`         : null,
          platingConfig.dilution    ? `Dilution: ${platingConfig.dilution}`         : null,
          platingConfig.plate_count ? `Plates: ${platingConfig.plate_count}`        : null,
          platingConfig.expected_hours
            ? `Expected incubation: ${platingConfig.expected_hours}h`
            : null,
        ].filter(Boolean).join(' | ') || null,
        logged_by: employeeId || null,
      })
      .select()
      .single();

    if (!incErr && inc) {
      incubation = inc;
      await supabase
        .from('batch_fermentation_readings')
        .update({ sample_incubation_id: inc.id, plating_status: 'done_incubating' })
        .eq('id', reading.id);

      // Sync incubation to LNB
      try {
        await syncStageToLNB(supabase, batchId, 'sample_incubation', {
          sample_name:        inc.sample_name,
          sample_category:    inc.sample_category,
          sample_type:        inc.sample_type,
          source_stage:       inc.source_stage,
          source_type:        inc.source_type,
          fermentation_reading_id: reading.id,
          incubation_date:    inc.incubation_date,
          incubation_temp_c:  inc.incubation_temp_c,
          start_time:         inc.start_time,
          sterility_status:   inc.sterility_status,
          plating_config:     platingConfig,
          observation:        inc.observation,
        }, `${flaskLabel || 'Flask'} T+${logHour != null ? Number(logHour).toFixed(1) : '0.0'}h`);
      } catch (_) { /* LNB sync non-critical */ }
    }
  }

  // Sync reading to LNB
  try {
    await syncStageToLNB(supabase, batchId, 'fermentation', {
      elapsed_hours:   logHour,
      logged_at:       collectedAt,
      ph,
      optical_density: opticalDensity,
      incubator_temp_c: incubatorTempC,
      plating_done:    platingDone,
      plating_config:  platingConfig,
    }, flaskLabel || 'Flask');
  } catch (_) { /* LNB sync non-critical */ }

  // Read back alarm flags set by DB trigger
  const { data: saved } = await supabase
    .from('batch_fermentation_readings')
    .select('is_ph_alarm, is_temp_alarm')
    .eq('id', reading.id)
    .single();

  if (saved?.is_ph_alarm || saved?.is_temp_alarm) {
    const msgs = [];
    if (saved.is_ph_alarm)   msgs.push(`pH ${ph} (outside 3.8–5.5)`);
    if (saved.is_temp_alarm) msgs.push(`Temp ${incubatorTempC}°C (outside 36–38°C)`);
    const batchLabel = flaskLabel ? `${batchId} (${flaskLabel})` : batchId;

    await notifyAdmins(
      `⚠ Fermentation Alarm — ${batchLabel}`,
      `T+${Number(logHour).toFixed(1)}hr: ${msgs.join(', ')}`,
      `/batches/${batchId}`,
      'alert'
    ).catch(() => {});

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await supabase.from('tasks').insert({
      title:       `⚠ Fermentation Alarm: ${msgs.join(', ')}`,
      description: `Auto-raised at T+${Number(logHour).toFixed(1)}hr for batch ${batchId}${flaskLabel ? ` (${flaskLabel})` : ''}. Investigate and log corrective action.`,
      priority:    'high',
      status:      'todo',
      batch_id:    batchId,
      assigned_to: employeeId || null,
      due_date:    tomorrow.toISOString().slice(0, 10),
    }).catch(() => {});
  }

  return {
    reading,
    incubation,
    alarms: { ph: saved?.is_ph_alarm ?? false, temp: saved?.is_temp_alarm ?? false },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Growth Study → growth_measurements + mark time_point complete
// Replicates /api/growth-studies/[id]/measurements POST logic
// ─────────────────────────────────────────────────────────────────────────────
export async function syncToGrowthMeasurement(supabase, {
  studyId,
  timePointId,
  logHour,
  collectedAt,
  tests,
  employeeId,
}) {
  const phTest = tests.find(t => t.test_type === 'ph' && !t.skipped);
  const odTest = tests.find(t => t.test_type === 'od' && !t.skipped);

  const { data: measurement, error } = await supabase
    .from('growth_measurements')
    .insert({
      study_id:             studyId,
      time_point_id:        timePointId || null,
      actual_hour:          logHour     ?? null,
      od_value:             odTest?.numeric_value  != null ? Number(odTest.numeric_value)  : null,
      ph_value:             phTest?.numeric_value  != null ? Number(phTest.numeric_value)  : null,
      temperature_actual_c: phTest?.detail?.temperature_c != null
                              ? Number(phTest.detail.temperature_c)
                              : odTest?.detail?.temperature_c != null
                                ? Number(odTest.detail.temperature_c)
                                : null,
      culture_turbidity:    odTest?.detail?.culture_turbidity || null,
      culture_color:        odTest?.detail?.culture_color     || null,
      notes:                tests.map(t => t.notes).filter(Boolean)[0] || null,
      recorded_by:          employeeId || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Mark time point complete — same as measurements/route.js line 24-29
  if (timePointId) {
    await supabase
      .from('growth_study_time_points')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', timePointId)
      .eq('status', 'pending');
  }

  return { measurement };
}
