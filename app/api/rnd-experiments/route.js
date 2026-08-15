export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { can, isMasterAdmin } from '@/lib/permissions';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Sequential experiment ID: OB-RND-YY-NNN. Sequence resets per year.
async function generateExperimentId(db) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const prefix = `OB-RND-${yy}-`;

  const { data } = await db
    .from('rnd_experiments')
    .select('experiment_id')
    .like('experiment_id', `${prefix}%`)
    .order('experiment_id', { ascending: true });

  let seq = 1;
  if (data && data.length > 0) {
    const usedSeqs = data
      .map((r) => parseInt(r.experiment_id.split('-').pop(), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    for (const num of usedSeqs) {
      if (num === seq) seq++;
      else if (num > seq) break;
    }
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export async function GET() {
  try {
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminClient();
    const { data, error } = await db
      .from('rnd_experiments')
      .select('id, experiment_id, title, status, target_volume_ml, target_ph, target_brix, created_at, employees:created_by(full_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('RND Experiments List Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, target_volume, target_ph, target_brix, notes, ingredients } = body;
    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const db = adminClient();
    const { data: emp } = await db.from('employees').select('id, role, custom_permissions').eq('email', user.email).single();
    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });
    }
    if (!can(emp.role, 'rnd_experiments', 'create', emp.custom_permissions) && !isMasterAdmin(user.email)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to log an experiment.' }, { status: 403 });
    }

    const experimentId = await generateExperimentId(db);
    const cleanIngredients = (ingredients || [])
      .filter((ing) => ing.stock_id && ing.amount)
      .map((ing) => ({ stock_id: ing.stock_id, amount: ing.amount }));

    const { data: rpcResult, error: rpcErr } = await db.rpc('record_rnd_experiment', {
      p_experiment_id: experimentId,
      p_title: title.trim(),
      p_employee_id: emp.id,
      p_target_volume_ml: target_volume || null,
      p_target_ph: target_ph || null,
      p_target_brix: target_brix || null,
      p_notes: notes || null,
      p_ingredients: cleanIngredients,
    });

    if (rpcErr) {
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 });
    }
    if (!rpcResult.success) {
      return NextResponse.json({ success: false, error: rpcResult.error }, { status: 409 });
    }

    return NextResponse.json({ success: true, id: rpcResult.id, experiment_id: rpcResult.experiment_id });
  } catch (err) {
    console.error('RND Experiment Create Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
