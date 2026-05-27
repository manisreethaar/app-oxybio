/**
 * POST /api/lab-bench/log
 *
 * Universal Quick Log API.
 * 1. Creates a `samples` row (the physical collection event).
 * 2. Bridges to existing module tables so they keep working:
 *    - batch     → batch_fermentation_readings (+ incubation if plating done)
 *    - growth_study → growth_measurements (+ marks time_point complete)
 * 3. Creates `test_results` rows with bridge FK references.
 *
 * Existing module pages are unchanged — they still read from their own tables.
 */

import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import {
  syncToBatchFermentation,
  syncToGrowthMeasurement,
} from '@/lib/labBench/bridgeSync';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    const body = await request.json();
    const {
      source_type,      // 'batch' | 'growth_study'
      source_id,        // batch UUID string or growth_study UUID
      flask_id,         // UUID — batch only
      flask_label,      // text — batch only
      log_hour,         // number
      sample_label,     // human label, e.g. "Flask A — T+24h"
      source_label,     // e.g. "Batch OXY-B-001" or "Growth Study GS-007"
      timepoint_label,  // e.g. "T+24h", "Day 3", "Passage P2"
      collected_at,     // ISO string (defaults to now)
      notes,            // overall notes for this log entry
      tests,            // array of test objects (see shape below)
      time_point_id,    // UUID — growth_study only, marks time point complete
    } = body;

    // ── Validation ──────────────────────────────────────────────
    if (!source_type || !['batch', 'growth_study'].includes(source_type)) {
      return NextResponse.json(
        { error: 'source_type must be "batch" or "growth_study"' },
        { status: 400 }
      );
    }
    if (!source_id) {
      return NextResponse.json({ error: 'source_id is required' }, { status: 400 });
    }
    if (!tests || !Array.isArray(tests) || tests.length === 0) {
      return NextResponse.json(
        { error: 'At least one test entry is required' },
        { status: 400 }
      );
    }

    const loggedAt = collected_at || new Date().toISOString();

    // ── Step 1: Create the sample record ────────────────────────
    const { data: sample, error: sampleErr } = await supabase
      .from('samples')
      .insert({
        source_type,
        source_id:        String(source_id),
        flask_id:         flask_id         || null,
        flask_label:      flask_label      || null,
        log_hour:         log_hour         ?? null,
        sample_label:     sample_label     || `${source_type === 'batch' ? source_id : 'Study'} T+${log_hour ?? 0}h`,
        source_label:     source_label     || null,
        timepoint_label:  timepoint_label  || null,
        collected_by:     employee?.id     || null,
        collected_at:     loggedAt,
        status:           'pending',
        notes:            notes            || null,
      })
      .select()
      .single();

    if (sampleErr) throw sampleErr;

    // ── Step 2: Bridge to existing module tables ─────────────────
    let bridgeResult = {};

    if (source_type === 'batch') {
      bridgeResult = await syncToBatchFermentation(supabase, {
        batchId:     source_id,
        flaskId:     flask_id,
        flaskLabel:  flask_label,
        logHour:     log_hour,
        collectedAt: loggedAt,
        tests,
        employeeId:  employee?.id,
      });
    } else if (source_type === 'growth_study') {
      bridgeResult = await syncToGrowthMeasurement(supabase, {
        studyId:     source_id,
        timePointId: time_point_id,
        logHour:     log_hour,
        collectedAt: loggedAt,
        tests,
        employeeId:  employee?.id,
      });
    }

    const fermentationReadingId = bridgeResult.reading?.id     || null;
    const growthMeasurementId   = bridgeResult.measurement?.id || null;
    const incubationRecordId    = bridgeResult.incubation?.id  || null;

    // ── Step 3: Insert test_results rows ─────────────────────────
    // Each test gets one row, with bridge FK back to the module record.
    const testRows = tests.map(t => ({
      sample_id:                      sample.id,
      test_type:                      t.test_type,
      numeric_value:                  t.numeric_value != null ? Number(t.numeric_value) : null,
      text_value:                     t.text_value   || null,
      unit:                           t.unit         || null,
      skipped:                        t.skipped      || false,
      skip_reason:                    t.skip_reason  || null,
      detail:                         t.detail       || {},
      synced_fermentation_reading_id: source_type === 'batch'
        ? fermentationReadingId
        : null,
      synced_growth_measurement_id:   source_type === 'growth_study'
        ? growthMeasurementId
        : null,
      synced_incubation_record_id:    t.test_type === 'plate_analysis' && !t.skipped
        ? incubationRecordId
        : null,
      entered_by:  employee?.id || null,
      entered_at:  loggedAt,
      notes:       t.notes || null,
    }));

    const { data: testResults, error: trErr } = await supabase
      .from('test_results')
      .insert(testRows)
      .select();

    if (trErr) throw trErr;

    // Mark sample complete
    await supabase
      .from('samples')
      .update({ status: 'complete' })
      .eq('id', sample.id);

    return NextResponse.json({
      success: true,
      sample:       { ...sample, status: 'complete' },
      test_results: testResults,
      bridge: {
        fermentation_reading: bridgeResult.reading     || null,
        growth_measurement:   bridgeResult.measurement || null,
        incubation_record:    bridgeResult.incubation  || null,
        alarms:               bridgeResult.alarms      || null,
      },
    });

  } catch (err) {
    console.error('Lab Bench Quick Log error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
