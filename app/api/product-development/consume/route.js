export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';
import { canOperateBatch } from '@/lib/batches/stagePolicy';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request) {
  try {
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { batchId, formData } = await request.json();
    if (!batchId || !formData) {
      return NextResponse.json({ success: false, error: 'Missing data' }, { status: 400 });
    }

    const db = adminClient();
    const { data: emp } = await db.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });
    }

    const { data: batch, error: batchErr } = await db
      .from('batches')
      .select('id, assigned_team, created_by')
      .eq('id', batchId)
      .single();
    if (batchErr || !batch) {
      return NextResponse.json({ success: false, error: 'Batch not found.' }, { status: 404 });
    }

    const access = canOperateBatch({ batch, employee: emp, isMaster: isMasterAdmin(user.email) });
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 403 });
    }

    const ingredients = (formData.ingredients || [])
      .filter((ing) => ing.stock_id && ing.amount)
      .map((ing) => ({ stock_id: ing.stock_id, amount: ing.amount }));

    const { data: rpcResult, error: rpcErr } = await db.rpc('record_product_development_formulation', {
      p_batch_id: batchId,
      p_employee_id: emp.id,
      p_target_volume_ml: formData.target_volume || null,
      p_target_ph: formData.target_ph || null,
      p_target_brix: formData.target_brix || null,
      p_notes: formData.notes || null,
      p_ingredients: ingredients,
    });

    if (rpcErr) {
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 });
    }
    if (!rpcResult.success) {
      return NextResponse.json({ success: false, error: rpcResult.error }, { status: 409 });
    }

    return NextResponse.json({ success: true, formulation_id: rpcResult.formulation_id });
  } catch (err) {
    console.error('Product Development Consume Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
