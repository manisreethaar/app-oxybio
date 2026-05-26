import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { batchId } = params;
    const { flask_id, yield_volume_ml, bottles_produced, bottle_volume_ml, release_notes } = await request.json();

    if (!flask_id) return NextResponse.json({ error: 'flask_id is required' }, { status: 400 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });
    if (!['ceo', 'admin', 'cto'].includes(emp.role)) {
      return NextResponse.json({ error: 'Release requires CEO/Admin role' }, { status: 403 });
    }

    // Save release record
    const { error: relErr } = await supabase.from('batch_flask_release_record').upsert({
      flask_id,
      batch_id: batchId,
      released_by: emp.id,
      yield_volume_ml: yield_volume_ml || null,
      bottles_produced: bottles_produced || null,
      bottle_volume_ml: bottle_volume_ml || null,
      release_notes: release_notes || null,
    }, { onConflict: 'flask_id' });
    if (relErr) throw relErr;

    // Mark flask as released
    await supabase.from('batch_flasks')
      .update({ status: 'released', current_stage: 'released' })
      .eq('id', flask_id);

    // If all non-rejected flasks released → close out the batch
    const { data: allFlasks } = await supabase
      .from('batch_flasks')
      .select('id, status, current_stage')
      .eq('batch_id', batchId);

    const nonRejected = (allFlasks || []).filter(f => f.status !== 'rejected');
    const allReleased = nonRejected.every(f => f.current_stage === 'released');

    if (allReleased) {
      await supabase.from('batches')
        .update({ status: 'released', current_stage: 'released' })
        .eq('id', batchId);

      // Audit trail
      await supabase.from('stage_transitions').insert({
        batch_id: batchId, from_stage: 'qc_hold', to_stage: 'released', changed_by: emp.id,
        notes: 'All trials released',
      }).then(() => {}).catch(() => {});
    }

    // Auto shelf-life study (non-blocking)
    const start = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    supabase.from('shelf_life_studies').insert({
      batch_id: batchId, storage_condition: '2-8°C',
      test_parameters: ['pH', 'CFU count', 'Sensory', 'Appearance'],
      start_date: start, expiry_date: expiry, status: 'In Progress', created_by: emp.id,
    }).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, all_released: allReleased });
  } catch (err) {
    console.error('Release error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
