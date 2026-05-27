import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';
import { canOperateBatch, validateBatchStart } from '@/lib/batches/stagePolicy';

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

    const { data: emp } = await db
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();
    if (!emp) return NextResponse.json({ error: 'Employee profile not found.' }, { status: 404 });

    // Ensure batch exists and is planned
    const { data: batch, error: getErr } = await db
      .from('batches')
      .select('status, current_stage, assigned_team, created_by')
      .eq('id', batchId)
      .single();

    if (getErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    const access = canOperateBatch({ batch, employee: emp, isMaster: isMasterAdmin(user.email) });
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const startCheck = validateBatchStart(batch);
    if (!startCheck.ok) {
      return NextResponse.json({ error: startCheck.error }, { status: 400 });
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
      changed_by: emp.id,
      notes:      'Initial Batch Activation'
    });

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Batch Start Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
