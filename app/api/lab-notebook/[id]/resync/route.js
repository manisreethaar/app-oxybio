export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { canResyncLabNotebookEntry } from '@/lib/labNotebook/access';

// Re-syncs all per-flask operational data from source tables into stage_snapshots.
// Used to recover missing flasks when data was entered after countersigning.
export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();

    const { data: entry, error: entryErr } = await supabase
      .from('lab_notebook_entries')
      .select('id, batch_id, status, stage_snapshots')
      .eq('id', id)
      .single();

    if (entryErr || !entry) return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });
    const access = canResyncLabNotebookEntry(entry, emp, user.email);
    if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 403 });
    if (!entry.batch_id) return NextResponse.json({ success: false, error: 'No batch linked to this entry' }, { status: 400 });

    const syncedAt = new Date().toISOString();

    // Fetch all flasks for this batch. This is intentionally count-agnostic:
    // F1, F2, F3, F10, or any custom flask label all become snapshot keys.
    const { data: flasks } = await supabase
      .from('batch_flasks')
      .select('id, flask_label')
      .eq('batch_id', entry.batch_id);

    if (!flasks?.length) return NextResponse.json({ success: false, error: 'No flasks found for this batch' }, { status: 404 });

    flasks.sort((a, b) => String(a.flask_label).localeCompare(String(b.flask_label), undefined, { numeric: true }));

    const flaskIds = flasks.map(f => f.id);
    const flaskById = Object.fromEntries(flasks.map(f => [f.id, f.flask_label]));

    // Inoculation records for all flasks.
    const { data: inoculations } = await supabase
      .from('batch_flask_inoculations')
      .select('*')
      .in('flask_id', flaskIds);

    // Fermentation endpoint records for all flasks.
    const { data: endpoints } = await supabase
      .from('batch_flask_endpoints')
      .select('*')
      .in('flask_id', flaskIds);

    // QC samples and their tests for all flasks.
    const { data: qcSamples } = await supabase
      .from('batch_flask_qc_samples')
      .select('*')
      .in('flask_id', flaskIds);

    const qcSampleIds = (qcSamples || []).map(sample => sample.id);
    const { data: qcTests } = qcSampleIds.length
      ? await supabase
        .from('batch_flask_qc_tests')
        .select('*')
        .in('sample_id', qcSampleIds)
        .order('test_name')
      : { data: [] };

    // Plating / sample incubation records for all flasks.
    const { data: incubations } = await supabase
      .from('sample_incubation_records')
      .select('*')
      .eq('batch_id', entry.batch_id)
      .in('flask_id', flaskIds)
      .order('created_at', { ascending: true });

    const inoculationSnapshot = {};
    for (const rec of (inoculations || [])) {
      const label = flaskById[rec.flask_id];
      if (!label) continue;
      inoculationSnapshot[label] = {
        inoculum_source_type: rec.inoculum_source_type,
        inoculum_source: rec.inoculum_source,
        cell_bank_vial_id: rec.cell_bank_vial_id,
        inoculum_vol_ml: rec.inoculum_vol_ml,
        planned_fermentation_hrs: rec.planned_fermentation_hrs,
        t_zero_time: rec.t_zero_time,
        transfer_method: rec.transfer_method,
        laf_used: rec.laf_used,
        contamination_check: rec.contamination_check,
        synced_at: syncedAt,
      };
    }

    const fermentationSnapshot = {};
    for (const rec of (endpoints || [])) {
      const label = flaskById[rec.flask_id];
      if (!label) continue;
      fermentationSnapshot[label] = {
        total_hours: rec.total_hours,
        final_ph: rec.final_ph,
        aroma: rec.aroma,
        colour_desc: rec.colour_desc,
        texture: rec.texture,
        sensory_overall: rec.sensory_overall,
        gram_stain: rec.gram_stain,
        notes: rec.notes,
        synced_at: syncedAt,
      };
    }

    const testsBySampleId = (qcTests || []).reduce((acc, test) => {
      if (!acc[test.sample_id]) acc[test.sample_id] = [];
      acc[test.sample_id].push(test);
      return acc;
    }, {});

    const qcSnapshot = {};
    for (const sample of (qcSamples || [])) {
      const label = flaskById[sample.flask_id];
      if (!label) continue;
      qcSnapshot[label] = {
        sample_id: sample.sample_id,
        sampling_date: sample.sampling_date,
        volume_ml: sample.volume_ml,
        testing_location: sample.testing_location,
        external_lab: sample.external_lab,
        ext_ref_number: sample.ext_ref_number,
        sample_sent_date: sample.sample_sent_date,
        expected_date: sample.expected_date,
        tests: (testsBySampleId[sample.id] || []).map(test => ({
          test: test.test_name,
          result: test.result_value || null,
          pass_fail: test.pass_fail,
        })),
        synced_at: syncedAt,
      };
    }

    const platingSnapshot = {};
    const sampleIncubationSnapshot = {};
    for (const rec of (incubations || [])) {
      const flaskLabel = flaskById[rec.flask_id];
      if (!flaskLabel) continue;

      if (rec.source_stage === 'qc_hold' || rec.qc_sample_id) {
        platingSnapshot[flaskLabel] = {
          sterility_status: rec.sterility_status,
          colony_count: rec.colony_count,
          cfu_per_ml: rec.cfu_per_ml,
          colony_morphology: rec.colony_morphology,
          microscopic_morphology: rec.microscopic_morphology,
          observation: rec.observation,
          completed_at: rec.end_time,
          synced_at: syncedAt,
        };
      }

      const key = rec.source_stage === 'fermentation_monitoring'
        ? `${flaskLabel} ${rec.sample_name}`
        : flaskLabel;
      sampleIncubationSnapshot[key] = {
        sample_name: rec.sample_name,
        sample_category: rec.sample_category,
        sample_type: rec.sample_type,
        source_stage: rec.source_stage,
        source_type: rec.source_type,
        fermentation_reading_id: rec.fermentation_reading_id,
        incubation_date: rec.incubation_date,
        incubation_temp_c: rec.incubation_temp_c,
        start_time: rec.start_time,
        end_time: rec.end_time,
        od_value: rec.od_value,
        ph_value: rec.ph_value,
        colony_count: rec.colony_count,
        cfu_per_ml: rec.cfu_per_ml,
        staining_method: rec.staining_method,
        microscopic_morphology: rec.microscopic_morphology,
        colony_morphology: rec.colony_morphology,
        sterility_status: rec.sterility_status,
        observation: rec.observation,
        synced_at: syncedAt,
      };
    }

    const updated = { ...(entry.stage_snapshots || {}) };
    if (Object.keys(inoculationSnapshot).length) updated.inoculation = inoculationSnapshot;
    if (Object.keys(fermentationSnapshot).length) updated.fermentation = fermentationSnapshot;
    if (Object.keys(qcSnapshot).length) updated.qc = qcSnapshot;
    if (Object.keys(platingSnapshot).length) updated.plating = platingSnapshot;
    if (Object.keys(sampleIncubationSnapshot).length) updated.sample_incubation = sampleIncubationSnapshot;

    const { error: updateErr } = await supabase
      .from('lab_notebook_entries')
      .update({ stage_snapshots: updated, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) throw updateErr;

    const syncedFlasks = [...new Set([
      ...Object.keys(inoculationSnapshot),
      ...Object.keys(fermentationSnapshot),
      ...Object.keys(qcSnapshot),
      ...Object.keys(platingSnapshot),
      ...Object.keys(sampleIncubationSnapshot).map(key => key.split(' ')[0]),
    ])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return NextResponse.json({ success: true, synced_flasks: syncedFlasks });
  } catch (error) {
    console.error('LNB Resync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
