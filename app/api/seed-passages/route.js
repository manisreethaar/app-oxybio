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

    let query = supabaseAdmin.from('seed_passages').select('*, cell_bank_vials(id, vial_code), employees!seed_passages_created_by_fkey(id, full_name, initials)').order('passage_number', { ascending: true });

    if (batchId) {
      query = query.eq('target_batch_id', batchId);
    } else if (studyId) {
      query = query.eq('target_growth_study_id', studyId);
    } else {
      return NextResponse.json({ success: false, error: 'batchId or studyId is required' }, { status: 400 });
    }

    const { data, error } = await query;
    if (error) throw error;

    const processedData = data.map(d => {
      let parsedNotes = d.notes;
      let inventory = d.cell_bank_vials ? { id: d.cell_bank_vials.id, label: d.cell_bank_vials.vial_code } : null;
      if (d.notes && d.notes.startsWith('{')) {
        try {
           const obj = JSON.parse(d.notes);
           if (obj.original_vial_id) {
             d.vial_id = d.vial_id || obj.original_vial_id;
             if (!inventory) inventory = { id: obj.original_vial_id, label: obj.original_vial_label };
             parsedNotes = obj.user_notes || '';
           }
        } catch(e){}
      }
      return { ...d, notes: parsedNotes, inventory };
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

    // Auto-create incubation record
    if (data) {
      await supabaseAdmin.from('sample_incubation_records').insert({
        sample_name: `Seed Passage ${data.passage_number}${data.media_name ? ` - ${data.media_name}` : ''}`,
        sample_category: 'Seed Passage',
        sample_type: 'Broth',
        batch_id: body.target_batch_id || null,
        source_stage: 'seed_prep',
        source_type: body.target_type,
        source_id: body.target_batch_id || body.target_growth_study_id,
        incubation_date: (body.start_time || new Date().toISOString()).split('T')[0],
        incubation_temp_c: body.incubation_temperature_c ? parseFloat(body.incubation_temperature_c) : 37,
        start_time: body.start_time || new Date().toISOString(),
        media_name: body.media_name,
        media_volume_used_ml: body.media_volume_ml,
        sterility_status: 'Pending',
        logged_by: body.created_by || null,
        seed_passage_id: data.id // Link if possible, or just metadata
      }).then(() => {}).catch(err => {
        console.warn('Seed passage incubation auto-creation warning:', err.message);
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Seed Passages POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
