export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// PATCH: upsert factors + responses in bulk
export async function PATCH(req, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { factors, responses, kineticData } = await req.json();

  // Upsert factors
  if (factors?.length) {
    await supabase.from('bioprocess_factors').delete().eq('experiment_id', id);
    const rows = factors.map(f => ({ ...f, experiment_id: id }));
    const { error } = await supabase.from('bioprocess_factors').insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Upsert responses (run_number is unique per experiment)
  if (responses?.length) {
    for (const r of responses) {
      await supabase.from('bioprocess_responses')
        .upsert({ experiment_id: id, run_number: r.run_number, response: r.response, notes: r.notes, updated_at: new Date().toISOString() },
          { onConflict: 'experiment_id,run_number' });
    }
  }

  // Replace kinetics data
  if (kineticData !== undefined) {
    await supabase.from('bioprocess_kinetics_data').delete().eq('experiment_id', id);
    if (kineticData.length) {
      const rows = kineticData.map((d, i) => ({ ...d, experiment_id: id, sort_order: i }));
      const { error } = await supabase.from('bioprocess_kinetics_data').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Update experiment status to 'collecting' if not yet
  await supabase.from('bioprocess_experiments')
    .update({ status: 'collecting', updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'setup');

  return NextResponse.json({ success: true });
}
