export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';
import { canOperateBatch } from '@/lib/batches/stagePolicy';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(request, { params }) {
  try {
    const { batchId } = params;
    const { sop_id } = await request.json();
    const authClient = createAnonClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = adminClient();
    const { data: emp } = await db.from('employees').select('id, role, custom_permissions').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee profile not found.' }, { status: 404 });
    const { data: batch, error: batchErr } = await db.from('batches').select('id, status, current_stage, assigned_team, created_by').eq('id', batchId).single();
    if (batchErr || !batch) return NextResponse.json({ error: 'Batch not found.' }, { status: 404 });
    if (batch.status !== 'in-progress') return NextResponse.json({ error: 'Batch must be in-progress (current: ' + batch.status + ').' }, { status: 400 });
    const access = canOperateBatch({ batch, employee: emp, isMaster: isMasterAdmin(user.email) });
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: 403 });
    const { data: existing } = await db.from('batch_seed_trains').select('id').eq('batch_id', batchId).eq('stage_type', 'seed_1').maybeSingle();
    if (!existing) {
      const { error: seedErr } = await db.from('batch_seed_trains').insert({ batch_id: batchId, stage_type: 'seed_1', status: 'active' });
      if (seedErr) throw new Error('Failed to initiate Seed 1: ' + seedErr.message);
    }
    const { error: updateErr } = await db.from('batches').update({ protocol_sop_id: sop_id || null, current_stage: 'seed_1' }).eq('id', batchId);
    if (updateErr) throw new Error('Failed to advance batch stage: ' + updateErr.message);
    await db.from('stage_transitions').insert({ batch_id: batchId, from_stage: 'protocol', to_stage: 'seed_1', changed_by: emp.id, notes: sop_id ? 'Protocol SOP linked' : 'Protocol confirmed (no SOP)' });
    return NextResponse.json({ success: true, new_stage: 'seed_1' });
  } catch (error) {
    console.error('[Protocol API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}