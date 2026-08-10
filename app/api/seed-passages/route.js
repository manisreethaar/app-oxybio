import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const studyId = searchParams.get('studyId');

    let query = supabaseAdmin
      .from('seed_passages')
      .select('*')
      .order('passage_number', { ascending: true });

    if (batchId) {
      query = query.eq('target_batch_id', batchId);
    } else if (studyId) {
      query = query.eq('target_growth_study_id', studyId);
    } else {
      return NextResponse.json({ success: false, error: 'batchId or studyId is required' }, { status: 400 });
    }

    const { data, error } = await query;
    if (error) throw error;

    // Manual lookups — PostgREST FK joins are broken due to stale schema
    // cache (old FK to inventory table still cached). Direct queries are reliable.
    const vialIds = [...new Set(data.map(d => d.vial_id).filter(Boolean))];
    const empIds = [...new Set(data.map(d => d.created_by).filter(Boolean))];

    const [vialsRes, empsRes] = await Promise.all([
      vialIds.length > 0
        ? supabaseAdmin.from('cell_bank_vials').select('id, vial_code').in('id', vialIds)
        : Promise.resolve({ data: [] }),
      empIds.length > 0
        ? supabaseAdmin.from('employees').select('id, full_name, initials').in('id', empIds)
        : Promise.resolve({ data: [] }),
    ]);

    const vialMap = Object.fromEntries((vialsRes.data || []).map(v => [v.id, v]));
    const empMap = Object.fromEntries((empsRes.data || []).map(e => [e.id, e]));

    const processedData = data.map(d => {
      let parsedNotes = d.notes;
      let vialInfo = d.vial_id ? vialMap[d.vial_id] : null;

      // Legacy: vial info was stored in JSON notes before the FK fix
      if (!vialInfo && d.notes && d.notes.startsWith('{')) {
        try {
          const obj = JSON.parse(d.notes);
          if (obj.original_vial_id) {
            vialInfo = { id: obj.original_vial_id, vial_code: obj.original_vial_label };
            parsedNotes = obj.user_notes || '';
          }
        } catch (e) { }
      }

      return {
        ...d,
        notes: parsedNotes,
        cell_bank_vials: vialInfo || null,
        employees: d.created_by ? (empMap[d.created_by] || null) : null,
        inventory: vialInfo ? { id: vialInfo.id, label: vialInfo.vial_code } : null,
      };
    });

    return NextResponse.json({ success: true, data: processedData });
  } catch (error) {
    console.error('Seed Passages GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Validate target
    if (!body.target_type || !['batch', 'growth_study'].includes(body.target_type)) {
      return NextResponse.json({ success: false, error: 'Valid target_type required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('seed_passages')
      .insert([{
        target_type: body.target_type,
        target_batch_id: body.target_batch_id || null,
        target_growth_study_id: body.target_growth_study_id || null,
        passage_number: body.passage_number,
        vial_id: body.vial_id || null,
        source_passage_id: body.source_passage_id || null,
        media_name: body.media_name || null,
        media_volume_ml: body.media_volume_ml || null,
        inoculum_volume_ml: body.inoculum_volume_ml || null,
        incubation_temperature_c: body.incubation_temperature_c || null,
        incubation_agitation_rpm: body.incubation_agitation_rpm || null,
        start_time: body.start_time || new Date().toISOString(),
        target_od: body.target_od || null,
        target_ph: body.target_ph || null,
        status: 'in_progress',
        notes: body.notes || null,
        created_by: body.created_by || null
      }])
      .select()
      .single();

    if (error) throw error;

    // Auto-create incubation record and update vial status
    if (data) {
      await supabaseAdmin.from('sample_incubation_records').insert({
        sample_name: `Seed Passage ${data.passage_number}${data.media_name ? ` - ${data.media_name}` : ''}`,
        sample_category: 'Seed Passage',
        sample_id: data.id,
        incubation_temperature_c: data.incubation_temperature_c,
        incubation_agitation_rpm: data.incubation_agitation_rpm,
        start_time: data.start_time,
        status: 'active',
        notes: `Auto-created from Seed Train for passage ${data.passage_number}`,
      }).then(() => { }).catch(e => console.warn('Incubation record insert warning:', e.message));

      if (data.vial_id) {
        // Mark vial as Used
        await supabaseAdmin.from('cell_bank_vials').update({
          status: 'Used',
          used_in_batch_id: body.target_batch_id || null,
          used_at: new Date().toISOString()
        }).eq('id', data.vial_id).catch(() => { });

        // Log vial usage
        await supabaseAdmin.from('cell_bank_vial_logs').insert({
          vial_id: data.vial_id,
          action: 'used_in_batch',
          batch_id: body.target_batch_id || null,
          operator_id: body.created_by || null,
          notes: `Used for Seed Passage ${data.passage_number}`
        }).catch(() => { });
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Seed Passages POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
