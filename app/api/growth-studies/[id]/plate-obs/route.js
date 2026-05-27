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
