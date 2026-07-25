/**
 * GET /api/lab-bench/queue
 *
 * Returns all active work items sorted by urgency:
 *   - Growth study time points that are overdue or due soon
 *   - Fermentation flasks that haven't been read recently
 *
 * Urgency thresholds:
 *   Growth study:   overdue  = planned_hour < elapsed - 0.5h
 *                   due_soon = planned_hour <= elapsed + 1.5h
 *                   upcoming = everything else
 *   Fermentation:   overdue  = no reading ever, OR last reading > 6h ago
 *                   due_soon = last reading 3–6h ago
 *                   active   = last reading < 3h ago
 *
 * Sort: overdue first, then due_soon, then active/upcoming.
 * Within each group: most urgent first (largest overdue_by / hours_since).
 */

import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const URGENCY_ORDER = { overdue: 0, due_soon: 1, active: 2, upcoming: 3 };

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();

    // ── 1. Active batches in fermentation ───────────────────────
    const [batchRes, studyRes] = await Promise.all([
      // Only batches that have actually reached fermentation monitoring.
      // Stages media_prep / sterilisation / inoculation are pre-fermentation — no readings needed.
      // qc_hold is explicitly a hold state — excluded here; qc_hold flasks are also filtered below.
      // straining / extract_addition are post-fermentation but may still need readings.
      supabase
        .from('batches')
        .select('id, batch_id, current_stage, batch_flasks(id, flask_label, status, current_stage)')
        .in('current_stage', ['fermentation'])   // straining/extract_addition no longer need fermentation readings
        .order('created_at', { ascending: false })
        .limit(20),

      supabase
        .from('growth_studies')
        .select(`
          id, name, study_code, inoculation_time, od_wavelength,
          growth_study_time_points(id, planned_hour, status, sample_types)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const batches = batchRes.data || [];
    const studies = studyRes.data || [];

    // ── 2. Latest fermentation reading per (batch_id, flask_id) ─
    // batch_fermentation_readings.batch_id is a UUID FK to batches.id — use b.id, not b.batch_id
    const activeBatchUuids = batches.map(b => b.id);
    let latestReadingMap = {}; // key: `${batch_uuid}::${flask_id}`

    if (activeBatchUuids.length > 0) {
      const { data: readings } = await supabase
        .from('batch_fermentation_readings')
        .select('batch_id, flask_id, logged_at, elapsed_hours, ph, optical_density')
        .in('batch_id', activeBatchUuids)
        .order('logged_at', { ascending: false });

      // Keep only the most recent reading per (batch_id, flask_id)
      for (const r of readings || []) {
        const key = `${r.batch_id}::${r.flask_id}`;
        if (!latestReadingMap[key]) latestReadingMap[key] = r;
      }
    }

    // ── 3. Build queue items ─────────────────────────────────────
    const items = [];

    // ── Fermentation flasks ──
    for (const batch of batches) {
      const flasks = (batch.batch_flasks || []).filter(f =>
        // Skip flasks not yet inoculated (planned) or explicitly on QC hold
        f.status !== 'planned' && f.current_stage !== 'qc_hold'
      );
      for (const flask of flasks) {
        // Only show flasks that are actively in fermentation — skip post-fermentation stages
        if (flask.current_stage && !['fermentation', 'inoculation'].includes(flask.current_stage)) continue;

        const key     = `${batch.id}::${flask.id}`;
        const reading = latestReadingMap[key] || null;

        let urgency, hoursSince, detail;

        if (!reading) {
          // No readings yet — give a 2h grace period before calling it overdue
          urgency    = 'active';
          hoursSince = null;
          detail     = 'No readings yet — log the first reading';
        } else {
          hoursSince = (now - new Date(reading.logged_at).getTime()) / 3_600_000;
          if (hoursSince > 6) {
            urgency = 'overdue';
            detail  = `Last reading ${hoursSince.toFixed(1)}h ago`;
          } else if (hoursSince > 3) {
            urgency = 'due_soon';
            detail  = `Last reading ${hoursSince.toFixed(1)}h ago`;
          } else {
            urgency = 'active';
            detail  = `Last reading ${hoursSince.toFixed(1)}h ago`;
          }
        }

        items.push({
          id:           `batch::${batch.batch_id}::${flask.id}`,
          type:         'fermentation_flask',
          urgency,
          source_type:  'batch',
          source_id:    batch.batch_id,
          batch_uuid:   batch.id,
          source_label: `Batch ${batch.batch_id}`,
          flask_id:     flask.id,
          flask_label:  flask.flask_label,
          detail,
          hours_since:  hoursSince,
          last_ph:      reading?.ph             || null,
          last_od:      reading?.optical_density || null,
          last_elapsed: reading?.elapsed_hours   || null,
          sort_key:     hoursSince == null ? Infinity : hoursSince,
        });
      }
    }

    // ── Growth study time points ──
    for (const study of studies) {
      if (!study.inoculation_time) continue;

      const currentElapsed =
        (now - new Date(study.inoculation_time).getTime()) / 3_600_000;

      const pendingTps = (study.growth_study_time_points || [])
        .filter(tp => tp.status === 'pending')
        .sort((a, b) => a.planned_hour - b.planned_hour);

      const studyLabel = study.study_code
        ? `Growth Study ${study.study_code}`
        : `Growth Study ${study.name}`;

      if (pendingTps.length > 0) {
        // ── Studies with a formal time-point schedule ──
        for (const tp of pendingTps) {
          const overdueBh = currentElapsed - tp.planned_hour;
          let urgency, detail, sortKey;

          if (overdueBh > 0.5) {
            urgency = 'overdue';
            detail  = `${overdueBh.toFixed(1)}h overdue`;
            sortKey = overdueBh;
          } else if (tp.planned_hour <= currentElapsed + 1.5) {
            urgency = 'due_soon';
            const minsUntil = Math.round((tp.planned_hour - currentElapsed) * 60);
            detail  = minsUntil <= 0
              ? 'Due now'
              : `Due in ${minsUntil} min`;
            sortKey = -(tp.planned_hour - currentElapsed);
          } else {
            urgency = 'upcoming';
            const hoursUntil = (tp.planned_hour - currentElapsed).toFixed(1);
            detail  = `In ${hoursUntil}h`;
            sortKey = -(tp.planned_hour - currentElapsed);
          }

          items.push({
            id:              `study::${study.id}::${tp.id}`,
            type:            'growth_timepoint',
            urgency,
            source_type:     'growth_study',
            source_id:       study.id,
            source_label:    studyLabel,
            time_point_id:   tp.id,
            timepoint_label: `T+${tp.planned_hour}h`,
            sample_types:    tp.sample_types || [],
            detail,
            planned_hour:    tp.planned_hour,
            current_elapsed: parseFloat(currentElapsed.toFixed(2)),
            od_wavelength:   study.od_wavelength || 600,
            sort_key:        sortKey,
          });
        }
      } else {
        // ── Active study with no time points defined — show as open item ──
        // Urgency mirrors fermentation: >6h = overdue, 3–6h = due_soon, <3h = active
        const elapsed = parseFloat(currentElapsed.toFixed(1));
        let urgency, detail;
        if (currentElapsed > 6) {
          urgency = 'overdue';
          detail  = `Running ${elapsed}h — no readings logged`;
        } else if (currentElapsed > 3) {
          urgency = 'due_soon';
          detail  = `Running ${elapsed}h — log a measurement`;
        } else {
          urgency = 'active';
          detail  = `Running ${elapsed}h`;
        }

        items.push({
          id:              `study::${study.id}::open`,
          type:            'growth_timepoint',
          urgency,
          source_type:     'growth_study',
          source_id:       study.id,
          source_label:    studyLabel,
          time_point_id:   null,
          timepoint_label: `T+${elapsed}h elapsed`,
          sample_types:    [],
          detail,
          planned_hour:    null,
          current_elapsed: elapsed,
          od_wavelength:   study.od_wavelength || 600,
          sort_key:        currentElapsed, // higher elapsed = surfaced first within group
        });
      }
    }

    // ── 4. Sort by urgency group then sort_key ───────────────────
    items.sort((a, b) => {
      const uDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (uDiff !== 0) return uDiff;
      return b.sort_key - a.sort_key;
    });

    // ── 5. Summary counts ────────────────────────────────────────
    const summary = {
      overdue:  items.filter(i => i.urgency === 'overdue').length,
      due_soon: items.filter(i => i.urgency === 'due_soon').length,
      active:   items.filter(i => i.urgency === 'active').length,
      upcoming: items.filter(i => i.urgency === 'upcoming').length,
    };

    return NextResponse.json({ success: true, items, summary, as_of: new Date().toISOString() });

  } catch (err) {
    console.error('Lab Bench queue API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
