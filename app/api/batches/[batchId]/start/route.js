import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Service-role client — bypasses RLS
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request, { params }) {
  try {
    const { batchId } = params;

    // Auth via anon client (session cookie), writes via admin (bypasses RLS)
    const authClient = createAnonClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = adminClient();

    // Ensure batch exists and is planned
    const { data: batch, error: getErr } = await db
      .from('batches')
      .select('status, current_stage')
      .eq('id', batchId)
      .single();

    if (getErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    // Guard: if current_stage is already set, the batch was started (even if status column lagged).
    if (!['planned', 'scheduled'].includes(batch.status) || batch.current_stage !== null) {
      return NextResponse.json({ error: 'Batch is already started or completed' }, { status: 400 });
    }

    // Transition the batch from planned/scheduled → media_prep
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('batches')
      .update({
        status:        'in-progress',
        current_stage: 'media_prep',
        start_time:    now
      })
      .eq('id', batchId)
      .select()
      .single();

    if (error) throw error;

    // Log the initial stage transition
    await db.from('stage_transitions').insert({
      batch_id:   batchId,
      from_stage: 'planned',
      to_stage:   'media_prep',
      changed_by: user.id,
      notes:      'Initial Batch Activation'
    });

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Batch Start Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
