/**
 * POST /api/lab-bench/grid
 *
 * Bulk Grid Entry — saves multiple flask readings (batch) or
 * multiple timepoint readings (growth study) in one submission.
 *
 * For each non-skipped entry it:
 *   1. Creates a samples row
 *   2. Bridges to the existing module table (fermentation readings / growth measurements)
 *   3. Creates test_results rows
 *
 * Skipped entries are recorded in samples + test_results with skipped=true
 * so the GMP audit trail is complete (no silent gaps).
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
      source_type,    // 'batch' | 'growth_study'
      source_id,      // text batch_id or growth_study UUID
      source_label,   // "Batch OXY-B-001" | "Growth Study GS-007"
      log_hour,       // shared hour for batch grids (each entry can override for GS grids)
      collected_at,   // ISO string — shared timestamp for all rows
      entries,        // array — one per flask (batch) or timepoint (growth_study)
    } = body;

    if (!source_type || !['batch', 'growth_study'].includes(source_type)) {
      return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 });
    }
    if (!source_id) {
      return NextResponse.json({ error: 'source_id is required' }, { status: 400 });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'entries array is required' }, { status: 400 });
    }

    const loggedAt = collected_at || new Date().toISOString();
    const results  = [];
    const alarms   = [];
    let savedCount   = 0;
    let skippedCount = 0;

    for (const entry of entries) {
      const entryHour   = entry.log_hour ?? log_hour ?? null;
      const flaskId     = entry.flask_id    || null;
      const flaskLabel  = entry.flask_label || null;
      const timePointId = entry.time_point_id || null;
      const timepointLabel = entry.timepoint_label
        || (entryHour != null
          ? (Number(entryHour) % 1 === 0
            ? `T+${Number(entryHour)}h`
            : `T+${Number(entryHour).toFixed(1)}h`)
          : null);

      // ── Build test array from flat entry fields ─────────────
      const tests = buildTestsFromEntry(entry);

      // ── Create sample record ─────────────────────────────────
      const sampleLabel = [
        source_label,
        flaskLabel,
        timepointLabel,
      ].filter(Boolean).join(' · ');

      const { data: sample, error: sampleErr } = await supabase
        .from('samples')
        .insert({
          source_type,
          source_id:       String(source_id),
          source_label:    source_label    || null,
          flask_id:        flaskId,
          flask_label:     flaskLabel,
          log_hour:        entryHour,
          timepoint_label: timepointLabel,
          sample_label:    sampleLabel || `${source_id} T+${entryHour}h`,
          collected_by:    employee?.id || null,
          collected_at:    loggedAt,
          status:          entry.skipped ? 'complete' : 'pending',
          notes:           entry.notes   || null,
        })
        .select()
        .single();

      if (sampleErr) {
        results.push({ label: sampleLabel, error: sampleErr.message });
        continue;
      }

      // ── Bridge + test_results ────────────────────────────────
      let bridgeResult  = {};
      let ferReadingId  = null;
      let growthMeasId  = null;
      let incubRecordId = null;

      if (!entry.skipped) {
        try {
          if (source_type === 'batch') {
            bridgeResult = await syncToBatchFermentation(supabase, {
              batchId:     source_id,
              flaskId,
              flaskLabel,
              logHour:     entryHour,
              collectedAt: loggedAt,
              tests,
              employeeId:  employee?.id,
            });
            ferReadingId  = bridgeResult.reading?.id    || null;
            incubRecordId = bridgeResult.incubation?.id || null;
            if (bridgeResult.alarms?.ph || bridgeResult.alarms?.temp) {
              alarms.push({ label: sampleLabel, ...bridgeResult.alarms });
            }
          } else if (source_type === 'growth_study') {
            bridgeResult = await syncToGrowthMeasurement(supabase, {
              studyId:     source_id,
              timePointId,
              logHour:     entryHour,
              collectedAt: loggedAt,
              tests,
              employeeId:  employee?.id,
            });
            growthMeasId = bridgeResult.measurement?.id || null;
          }
        } catch (bridgeErr) {
          // Log the error but continue — don't abort the whole batch
          results.push({ label: sampleLabel, error: bridgeErr.message });
          await supabase.from('samples').delete().eq('id', sample.id);
          continue;
        }
        savedCount++;
      } else {
        skippedCount++;
      }

      // ── Insert test_results rows ─────────────────────────────
      if (tests.length > 0) {
        const testRows = tests.map(t => ({
          sample_id:                      sample.id,
          test_type:                      t.test_type,
          numeric_value:                  t.numeric_value != null ? Number(t.numeric_value) : null,
          text_value:                     t.text_value   || null,
          unit:                           t.unit         || null,
          skipped:                        entry.skipped  || t.skipped || false,
          skip_reason:                    entry.skipped
                                            ? (entry.skip_reason || null)
                                            : (t.skip_reason || null),
          detail:                         t.detail       || {},
          synced_fermentation_reading_id: source_type === 'batch' ? ferReadingId : null,
          synced_growth_measurement_id:   source_type === 'growth_study' ? growthMeasId : null,
          synced_incubation_record_id:    t.test_type === 'plate_analysis' && !entry.skipped
                                            ? incubRecordId
                                            : null,
          entered_by:  employee?.id || null,
          entered_at:  loggedAt,
        }));

        await supabase.from('test_results').insert(testRows);
      }

      // Mark sample complete
      await supabase
        .from('samples')
        .update({ status: 'complete' })
        .eq('id', sample.id);

      results.push({
        label:   sampleLabel,
        skipped: entry.skipped || false,
        sample_id: sample.id,
        fermentation_reading_id: ferReadingId,
        growth_measurement_id:   growthMeasId,
      });
    }

    return NextResponse.json({
      success: true,
      saved:   savedCount,
      skipped: skippedCount,
      total:   entries.length,
      results,
      alarms,
    });

  } catch (err) {
    console.error('Grid entry API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── Build normalised test array from a flat grid entry row ────────────────
// Grid rows use flat fields (ph, od, sterility, plate_done) instead of the
// nested test objects used by Quick Log, to keep grid state simple.
function buildTestsFromEntry(entry) {
  const tests = [];

  // pH
  if (entry.ph !== '' && entry.ph != null) {
    tests.push({
      test_type:     'ph',
      numeric_value: entry.ph,
      detail: {
        incubator_temp_c: entry.incubator_temp_c || null,
      },
    });
  }

  // OD
  if (entry.od !== '' && entry.od != null) {
    tests.push({
      test_type:     'od',
      numeric_value: entry.od,
      unit:          `OD${entry.od_wavelength || 600}`,
      detail: {
        wavelength:        entry.od_wavelength  || 600,
        culture_turbidity: entry.turbidity       || null,
      },
    });
  }

  // Sterility
  if (entry.sterility) {
    tests.push({
      test_type:  'sterility',
      text_value: entry.sterility,
    });
  }

  // Plate analysis (grid: simplified — colony count only)
  if (entry.plate_done) {
    tests.push({
      test_type: 'plate_analysis',
      detail: {
        colony_count:      entry.colony_count     || null,
        media_type:        entry.plate_media       || null,
        incubation_temp_c: entry.plate_temp        || 37,
        expected_hours:    entry.plate_hours        || 48,
      },
    });
  }

  return tests;
}
