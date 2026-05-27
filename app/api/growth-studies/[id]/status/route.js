import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { status } = await req.json();

    const allowed = ['setup', 'active', 'completed', 'analysed'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'active') updates.inoculation_time = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();

    const supabaseAdmin = createAdminClient();

    // If starting (active), compute scheduled_at for all time points
    if (status === 'active') {
      const { data: tps } = await supabaseAdmin
        .from('growth_study_time_points')
        .select('id, planned_hour')
        .eq('study_id', id);

      if (tps?.length) {
        const inocTime = new Date(updates.inoculation_time);
        for (const tp of tps) {
          await supabaseAdmin
            .from('growth_study_time_points')
            .update({ scheduled_at: new Date(inocTime.getTime() + tp.planned_hour * 3600000).toISOString() })
            .eq('id', tp.id);
        }
      }
    }

    // Mark all pending time points as missed when completing
    if (status === 'completed') {
      await supabaseAdmin
        .from('growth_study_time_points')
        .update({ status: 'missed' })
        .eq('study_id', id)
        .eq('status', 'pending');
    }

    const { data, error } = await supabaseAdmin
      .from('growth_studies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
