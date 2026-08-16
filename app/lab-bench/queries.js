import { createClient } from '@/utils/supabase/server';

const URGENCY_ORDER = { overdue: 0, due_soon: 1, active: 2, upcoming: 3 };

export async function getLabBenchQueue(supabase) {
  const now = Date.now();

  const [batchRes, studyRes, seedPassagesRes] = await Promise.all([
    supabase
      .from('batches')
      .select('id, batch_id, current_stage, batch_flasks(id, flask_label, status, current_stage)')
      .in('current_stage', ['fermentation'])
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
      
    supabase
      .from('seed_passages')
      .select('id, passage_number, start_time, target_batch_id, target_growth_study_id, batches(batch_id), growth_studies(study_code)')
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const batches = batchRes.data || [];
  const studies = studyRes.data || [];
  const seedPassages = seedPassagesRes.data || [];

  const activeBatchUuids = batches.map(b => b.id);
  let latestReadingMap = {};

  if (activeBatchUuids.length > 0) {
    const { data: readings } = await supabase
      .from('batch_fermentation_readings')
      .select('batch_id, flask_id, logged_at, elapsed_hours, ph, optical_density')
      .in('batch_id', activeBatchUuids)
      .order('logged_at', { ascending: false });

    for (const r of readings || []) {
      const key = `${r.batch_id}::${r.flask_id}`;
      if (!latestReadingMap[key]) latestReadingMap[key] = r;
    }
  }

  const items = [];

  // Fermentation flasks
  for (const batch of batches) {
    const flasks = (batch.batch_flasks || []).filter(f =>
      f.status !== 'planned' && f.current_stage !== 'qc_hold'
    );
    for (const flask of flasks) {
      if (flask.current_stage && !['fermentation', 'inoculation'].includes(flask.current_stage)) continue;

      const key     = `${batch.id}::${flask.id}`;
      const reading = latestReadingMap[key] || null;

      let urgency, hoursSince, detail;

      if (!reading) {
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

  // Growth study time points
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
          detail  = minsUntil <= 0 ? 'Due now' : `Due in ${minsUntil} min`;
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
        sort_key:        currentElapsed,
      });
    }
  }

  // Seed Passages
  for (const sp of seedPassages) {
    if (!sp.start_time) continue;
    const currentElapsed = (now - new Date(sp.start_time).getTime()) / 3_600_000;
    const elapsed = parseFloat(currentElapsed.toFixed(1));
    
    let urgency, detail;
    if (currentElapsed > 6) {
      urgency = 'overdue';
      detail = `Incubating ${elapsed}h — log OD/pH`;
    } else if (currentElapsed > 3) {
      urgency = 'due_soon';
      detail = `Incubating ${elapsed}h — log OD/pH`;
    } else {
      urgency = 'active';
      detail = `Incubating ${elapsed}h`;
    }
    
    let label = `Seed Passage ${sp.passage_number}`;
    if (sp.target_batch_id && sp.batches) label += ` (Batch ${sp.batches.batch_id})`;
    if (sp.target_growth_study_id && sp.growth_studies) label += ` (Study ${sp.growth_studies.study_code})`;

    items.push({
      id:              `seed_passage::${sp.id}`,
      type:            'seed_passage',
      urgency,
      source_type:     'seed_passage',
      source_id:       sp.id,
      source_label:    label,
      time_point_id:   null,
      timepoint_label: `T+${elapsed}h elapsed`,
      sample_types:    ['od', 'ph'],
      detail,
      planned_hour:    null,
      current_elapsed: elapsed,
      sort_key:        currentElapsed,
    });
  }

  items.sort((a, b) => {
    const uDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (uDiff !== 0) return uDiff;
    return b.sort_key - a.sort_key;
  });

  const summary = {
    overdue:  items.filter(i => i.urgency === 'overdue').length,
    due_soon: items.filter(i => i.urgency === 'due_soon').length,
    active:   items.filter(i => i.urgency === 'active').length,
    upcoming: items.filter(i => i.urgency === 'upcoming').length,
  };

  return { success: true, items, summary, as_of: new Date().toISOString() };
}

export async function getLabBenchRecent(supabase, employeeId) {
  if (!employeeId) return { success: true, data: [] };
  const { data, error } = await supabase
    .from('samples')
    .select(`
      id, sample_label, source_label, flask_label, timepoint_label, collected_at, source_type,
      test_results(id, test_type, numeric_value, text_value, unit, skipped, skip_reason, notes, entered_by, entered_at)
    `)
    .eq('collected_by', employeeId)
    .order('collected_at', { ascending: false })
    .limit(20);
    
  if (error) return { success: false, data: [] };
  return { success: true, data: data || [] };
}

export async function getLabBenchPendingEdits(supabase, employeeId) {
  if (!employeeId) return [];
  const { data, error } = await supabase
    .from('pending_changes')
    .select('record_id')
    .eq('requested_by', employeeId)
    .eq('status', 'pending');
    
  if (error) return [];
  return data.map(d => d.record_id);
}


export async function getLabBenchSources(supabase) {
  const [batchRes, growthRes, cellBankRes, seedPassagesRes] = await Promise.all([
    supabase
      .from('batches')
      .select('id, batch_id, status, current_stage, created_at, batch_flasks(id, flask_label, status, current_stage)')
      .in('current_stage', ['fermentation', 'straining'])
      .order('created_at', { ascending: false })
      .limit(30),

    supabase
      .from('growth_studies')
      .select('id, name, study_code, status, inoculation_time, od_wavelength, growth_study_time_points(id, planned_hour, status, sample_types)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('cell_bank_preparations')
      .select('id, prep_code, type, status, passage_number, cell_bank_strains(id, name, accession_number, strain_short_code)')
      .eq('status', 'In Progress')
      .order('created_at', { ascending: false })
      .limit(30),

    supabase
      .from('seed_passages')
      .select('id, passage_number, status, media_name, start_time, target_batch_id, target_growth_study_id, batches(batch_id), growth_studies(study_code)')
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const growthStudies = (growthRes.data || []).map(s => ({
    ...s,
    pending_time_points: (s.growth_study_time_points || [])
      .filter(tp => tp.status === 'pending')
      .sort((a, b) => a.planned_hour - b.planned_hour),
  }));

  const batches = (batchRes.data || []).map(b => ({
    ...b,
    batch_flasks: (b.batch_flasks || []).filter(
      f => f.status !== 'planned' && f.current_stage !== 'qc_hold'
    ),
  }));

  return {
    success: true,
    batches,
    growth_studies: growthStudies,
    cell_bank_preparations: cellBankRes.data || [],
    seed_passages: (seedPassagesRes && seedPassagesRes.data) || [],
  };
}
