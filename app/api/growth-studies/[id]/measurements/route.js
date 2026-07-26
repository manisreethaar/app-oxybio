export const dynamic = 'force-dynamic';
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
    const { time_point_id, ...rest } = body;

    const { data, error } = await supabase
      .from('growth_measurements')
      .insert({ ...rest, study_id: id, time_point_id: time_point_id || null, recorded_by: emp?.id })
      .select()
      .single();

    if (error) throw error;

    // Mark the corresponding time point as completed
    if (time_point_id) {
      await supabase
        .from('growth_study_time_points')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', time_point_id)
        .eq('status', 'pending');
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
