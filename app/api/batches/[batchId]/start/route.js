import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { batchId } = params;
    const supabase = createClient();

    // Verify authentication
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Ensure batch exists and is planned
    const { data: batch, error: getErr } = await supabase
      .from('batches')
      .select('status, current_stage')
      .eq('id', batchId)
      .single();

    if (getErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    // Guard: status check alone is insufficient — intermediate stages reset status to 'planned',
    // so also check current_stage to prevent re-starting a batch that is already in progress.
    if (batch.status !== 'planned' || batch.current_stage !== null) {
      return NextResponse.json({ error: 'Batch is already started or completed' }, { status: 400 });
    }

    // Transition the batch from planned to active in the media prep layer
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('batches')
      .update({
        status: 'in_progress', // or 'active' based on UI convention. Page uses .status === 'planned' and upper-cased display.
        current_stage: 'media_prep',
        start_time: now
      })
      .eq('id', batchId)
      .select()
      .single();

    if (error) throw error;

    // Log the initial stage transition so metric logging shows 'media_prep' started today
    await supabase.from('stage_transitions').insert({
      batch_id: batchId,
      from_stage: 'planned',
      to_stage: 'media_prep',
      changed_by: user.id,
      notes: 'Initial Batch Activation'
    });

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Batch Start Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
