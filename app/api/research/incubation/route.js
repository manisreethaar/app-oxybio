import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { requireLabAccess } from '@/lib/research/access';
import { incubationSchema } from './_validation';
import { syncStageToLNB } from '@/lib/lnbSync';

export const dynamic = 'force-dynamic';


function parsePayload(body) {
  const parsed = incubationSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map(issue => issue.message).join(', ');
    return { error: NextResponse.json({ success: false, error: message }, { status: 400 }) };
  }

  return { data: parsed.data };
}

async function syncIncubationToLNB(supabase, record) {
  if (!record?.batch_id) return;

  let flaskLabel = null;
  if (record.flask_id) {
    const { data: flask } = await supabase
      .from('batch_flasks')
      .select('flask_label')
      .eq('id', record.flask_id)
      .maybeSingle();
    flaskLabel = flask?.flask_label || null;
  }

  const snapshotLabel = record.source_stage === 'fermentation_monitoring'
    ? `${flaskLabel || record.sample_name} ${record.sample_name}`
    : (flaskLabel || record.sample_name);

  await syncStageToLNB(supabase, record.batch_id, 'sample_incubation', {
    sample_name: record.sample_name,
    sample_category: record.sample_category,
    sample_type: record.sample_type,
    source_stage: record.source_stage,
    source_type: record.source_type,
    fermentation_reading_id: record.fermentation_reading_id,
    incubation_date: record.incubation_date,
    incubation_temp_c: record.incubation_temp_c,
    start_time: record.start_time,
    end_time: record.end_time,
    od_value: record.od_value,
    ph_value: record.ph_value,
    colony_count: record.colony_count,
    cfu_per_ml: record.cfu_per_ml,
    staining_method: record.staining_method,
    microscopic_morphology: record.microscopic_morphology,
    colony_morphology: record.colony_morphology,
    sterility_status: record.sterility_status,
    observation: record.observation,
  }, snapshotLabel);
}

async function syncLinkedFermentationReading(supabase, record) {
  if (!record?.fermentation_reading_id) return;

  await supabase
    .from('batch_fermentation_readings')
    .update({
      sample_incubation_id: record.id,
      plating_done: true,
      plating_status: record.end_time ? 'completed' : 'done_incubating',
    })
    .eq('id', record.fermentation_reading_id);
}

export async function GET(request) {
  try {
    const supabase = createClient();
    const access = await requireLabAccess(supabase, 'view');
    if (access.error) return access.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const search = searchParams.get('q');
    const batchId = searchParams.get('batch_id');
    const flaskId = searchParams.get('flask_id');
    const qcSampleId = searchParams.get('qc_sample_id');

    let query = supabase
      .from('sample_incubation_records')
      .select('*, employees(full_name, initials), batches(batch_id, status), batch_flasks(flask_label), batch_flask_qc_samples(sample_id), samples(sample_label, source_type, source_label, log_hour, timepoint_label, flask_label)')
      .order('created_at', { ascending: false });

    if (status === 'ongoing') query = query.is('end_time', null);
    if (status === 'completed') query = query.not('end_time', 'is', null);
    if (category && category !== 'all') query = query.eq('sample_category', category);
    if (search) query = query.ilike('sample_name', `%${search}%`);
    if (batchId) query = query.eq('batch_id', batchId);
    if (flaskId) query = query.eq('flask_id', flaskId);
    if (qcSampleId) query = query.eq('qc_sample_id', qcSampleId);

    const { data, error } = await query.limit(200);

    if (error) throw error;
    const records = data || [];
    const batchIds = [...new Set(records.map(r => r.batch_id).filter(Boolean))];
    const prepIds = [...new Set(records.map(r => r.cell_bank_preparation_id).filter(Boolean))];
    const readingIds = [...new Set(records.map(r => r.fermentation_reading_id).filter(Boolean))];
    const lnbByBatch = {};
    const lnbByPrep = {};
    const readingById = {};

    if (readingIds.length > 0) {
      const { data: readings } = await supabase
        .from('batch_fermentation_readings')
        .select('id, elapsed_hours, logged_at, ph, optical_density')
        .in('id', readingIds);

      (readings || []).forEach(reading => {
        readingById[reading.id] = reading;
      });
    }

    if (batchIds.length > 0 || prepIds.length > 0) {
      let lnbQuery = supabase
        .from('lab_notebook_entries')
        .select('id, batch_id, cell_bank_preparation_id')
        .neq('status', 'Countersigned');

      if (batchIds.length > 0 && prepIds.length > 0) {
        lnbQuery = lnbQuery.or(`batch_id.in.(${batchIds.join(',')}),cell_bank_preparation_id.in.(${prepIds.join(',')})`);
      } else if (batchIds.length > 0) {
        lnbQuery = lnbQuery.in('batch_id', batchIds);
      } else {
        lnbQuery = lnbQuery.in('cell_bank_preparation_id', prepIds);
      }

      const { data: lnbs } = await lnbQuery.order('created_at', { ascending: false });
      (lnbs || []).forEach(entry => {
        if (entry.batch_id && !lnbByBatch[entry.batch_id]) lnbByBatch[entry.batch_id] = entry.id;
        if (entry.cell_bank_preparation_id && !lnbByPrep[entry.cell_bank_preparation_id]) lnbByPrep[entry.cell_bank_preparation_id] = entry.id;
      });
    }

    return NextResponse.json({
      success: true,
      data: records.map(record => ({
        ...record,
        fermentation_reading: readingById[record.fermentation_reading_id] || null,
        linked_lnb_id: lnbByBatch[record.batch_id] || lnbByPrep[record.cell_bank_preparation_id] || null,
      })),
    });
  } catch (error) {
    console.error('Sample incubation API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const access = await requireLabAccess(supabase, 'edit');
    if (access.error) return access.error;

    const parsed = parsePayload(await request.json());
    if (parsed.error) return parsed.error;

    const { id, ...payload } = parsed.data;

    const { data, error } = await supabase
      .from('sample_incubation_records')
      .insert({ ...payload, logged_by: access.employee?.id || null })
      .select()
      .single();

    if (error) throw error;
    await syncLinkedFermentationReading(supabase, data);
    await syncIncubationToLNB(supabase, data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Sample incubation API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const access = await requireLabAccess(supabase, 'edit');
    if (access.error) return access.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

    const { data: existing } = await supabase
      .from('sample_incubation_records')
      .select('id, fermentation_reading_id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase.from('sample_incubation_records').delete().eq('id', id);
    if (error) throw error;

    if (existing?.fermentation_reading_id) {
      await supabase
        .from('batch_fermentation_readings')
        .update({ sample_incubation_id: null, plating_done: false, plating_status: 'not_done' })
        .eq('id', existing.fermentation_reading_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sample incubation DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = createClient();
    const access = await requireLabAccess(supabase, 'edit');
    if (access.error) return access.error;

    const parsed = parsePayload(await request.json());
    if (parsed.error) return parsed.error;

    const { id, ...updates } = parsed.data;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing record id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('sample_incubation_records')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await syncLinkedFermentationReading(supabase, data);
    await syncIncubationToLNB(supabase, data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Sample incubation API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
