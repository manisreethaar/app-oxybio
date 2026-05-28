import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    const { id } = await params;
    const body = await req.json();

    const { data, error } = await supabase
      .from('growth_plate_observations')
      .insert({ ...body, study_id: id, recorded_by: emp?.id, result: body.result || 'pending' })
      .select()
      .single();

    if (error) throw error;

    // Auto-create incubation record(s) in the hub
    try {
      const { data: study } = await supabase
        .from('growth_studies')
        .select('study_code, name')
        .eq('id', id)
        .single();

      const plateCount = Math.min(20, Math.max(1, parseInt(body.plate_count, 10) || 1));
      const sourceLabel = study?.study_code || study?.name || id;
      const logHour = body.time_point_hours != null ? parseFloat(body.time_point_hours) : null;
      const hourLabel = logHour != null ? `T+${logHour.toFixed(1)}h` : null;
      const baseLabel = [sourceLabel, hourLabel].filter(Boolean).join(' — ');
      const loggedAt = new Date().toISOString();
      const observation = [
        body.plate_media     ? `Media: ${body.plate_media}`          : null,
        body.dilution        ? `Dilution: ${body.dilution}`          : null,
        body.incubation_hours ? `Expected: ${body.incubation_hours}h` : null,
      ].filter(Boolean).join(' | ') || null;

      const incRows = Array.from({ length: plateCount }, (_, i) => ({
        sample_name:      plateCount > 1 ? `${baseLabel} — Plate ${i + 1}/${plateCount}` : `${baseLabel} — Plate`,
        sample_category:  'Growth Study',
        sample_type:      'Agar Plate',
        source_type:      'growth_study',
        source_id:        id,
        source_label:     sourceLabel,
        log_hour:         logHour,
        timepoint_label:  hourLabel,
        plate_label:      plateCount > 1 ? `Plate ${i + 1}/${plateCount}` : 'Plate 1',
        plate_index:      i + 1,
        plate_total:      plateCount,
        incubation_date:  loggedAt.slice(0, 10),
        start_time:       loggedAt,
        incubation_temp_c: body.incubation_temp_c ? parseFloat(body.incubation_temp_c) : null,
        sterility_status: 'Pending',
        source_stage:     'growth_study',
        sampled_at:       loggedAt,
        observation,
        logged_by:        emp?.id || null,
      }));

      await supabase.from('sample_incubation_records').insert(incRows);
    } catch (syncErr) {
      console.error('[plate-obs] incubation sync failed:', syncErr.message);
    }

    // If this plate covers a time point, check if ALL sample types at that point are done
    if (body.time_point_id) {
      const { data: tp } = await supabase
        .from('growth_study_time_points')
        .select('sample_types, id')
        .eq('id', body.time_point_id)
        .single();

      if (tp) {
        const needsMeasurement = tp.sample_types.some(t => ['od_ph', 'biochemistry'].includes(t));
        if (!needsMeasurement) {
          await supabase
            .from('growth_study_time_points')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', tp.id)
            .eq('status', 'pending');
        }
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { obs_id, ...updates } = await req.json();
    if (!obs_id) return NextResponse.json({ error: 'obs_id required' }, { status: 400 });

    const { data, error } = await supabase
      .from('growth_plate_observations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', obs_id)
      .eq('study_id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
