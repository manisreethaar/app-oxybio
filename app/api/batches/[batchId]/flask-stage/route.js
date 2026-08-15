export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';
import { canOperateBatch } from '@/lib/batches/stagePolicy';
import { ALL_STAGE_IDS, isLegalTransition } from '@/lib/batches/workflowStages';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function constraintMessage(stage) {
  if (stage === 'harvest') {
    return `Database stage constraint is missing "${stage}". Apply supabase/migrations/20260807000001_fix_batch_flasks_stage_constraint.sql on the live database.`;
  }
  return 'Database rejected this stage transition.';
}

export async function POST(request, { params }) {
  try {
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { batchId } = params;
    const { flask_id, to_stage, from_stage, override_reason } = await request.json();
    if (!flask_id || !to_stage) {
      return NextResponse.json({ success: false, error: 'Flask and target stage are required.' }, { status: 400 });
    }
    if (!ALL_STAGE_IDS.includes(to_stage)) {
      return NextResponse.json({ success: false, error: 'Unknown target flask stage.' }, { status: 422 });
    }

    const db = adminClient();
    const { data: emp } = await db.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });
    }

    const { data: batch, error: batchErr } = await db
      .from('batches')
      .select('id, status, current_stage, assigned_team, created_by')
      .eq('id', batchId)
      .single();
    if (batchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found.' }, { status: 404 });
    }

    const access = canOperateBatch({ batch, employee: emp, isMaster: isMasterAdmin(user.email) });
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 403 });
    }

    const { data: flask, error: flaskErr } = await db
      .from('batch_flasks')
      .select('id, flask_label, current_stage, status')
      .eq('id', flask_id)
      .eq('batch_id', batchId)
      .single();
    if (flaskErr || !flask) {
      return NextResponse.json({ success: false, error: 'Flask not found for this batch.' }, { status: 404 });
    }

    if (!isLegalTransition(flask.current_stage, to_stage)) {
      return NextResponse.json({
        success: false,
        error: `Cannot advance ${flask.flask_label} from ${flask.current_stage} to ${to_stage} — not a legal next stage.`,
      }, { status: 422 });
    }

    // Server-side mirror of the client's "Lab Notebook must not be empty"
    // release gate — the client-only check is trivially bypassed by a direct API call.
    if (to_stage === 'released') {
      const { count: lnbCount } = await db
        .from('lab_notebook_entries')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchId);
      if (!lnbCount) {
        return NextResponse.json({ success: false, error: 'Cannot release — Lab Notebook is empty.' }, { status: 422 });
      }
    }

    const { data: rpcResult, error: rpcErr } = await db.rpc('advance_flask_stage', {
      p_flask_id: flask_id,
      p_batch_id: batchId,
      p_to_stage: to_stage,
      p_employee_id: emp.id,
      p_flask_label: flask.flask_label,
      p_override_reason: override_reason || null,
    });

    if (rpcErr) {
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 });
    }

    if (!rpcResult.success) {
      const isConstraint = rpcResult.code === '23514' || rpcResult.error?.toLowerCase().includes('constraint');
      return NextResponse.json({
        success: false,
        error: isConstraint ? constraintMessage(to_stage) : rpcResult.error,
      }, { status: isConstraint ? 409 : 500 });
    }

    return NextResponse.json({ success: true, new_stage: rpcResult.new_stage });
  } catch (error) {
    console.error('Flask Stage Transition Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
