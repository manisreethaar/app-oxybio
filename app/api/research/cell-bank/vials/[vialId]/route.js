import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MASTER_EMAIL = 'manisreethaar@gmail.com';

async function requireAccess(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
  if (!emp && user.email !== MASTER_EMAIL) return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  return { user, emp };
}

// PATCH /api/research/cell-bank/vials/[vialId]
// body: { action: 'use'|'thaw'|'return'|'discard', batch_id?, flask_id?, notes? }
export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const body = await request.json();
    const { action, batch_id, flask_id, notes } = body;

    if (!action) return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 });

    const vialUpdates = {};
    let logAction;

    switch (action) {
      case 'use':
        vialUpdates.status = 'Used';
        vialUpdates.used_in_batch_id = batch_id || null;
        vialUpdates.used_at = new Date().toISOString();
        logAction = 'used_in_batch';
        break;
      case 'thaw':
        // Thawing doesn't change status — vial may be re-frozen or used
        logAction = 'thawed';
        break;
      case 'return':
        vialUpdates.status = 'Available';
        vialUpdates.used_in_batch_id = null;
        vialUpdates.used_at = null;
        logAction = 'returned';
        break;
      case 'discard':
        vialUpdates.status = 'Depleted';
        logAction = 'discarded';
        break;
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Update vial if there are status changes
    if (Object.keys(vialUpdates).length > 0) {
      const { error: updateErr } = await supabase.from('cell_bank_vials').update(vialUpdates).eq('id', params.vialId);
      if (updateErr) throw updateErr;
    }

    // Always insert a log entry
    await supabase.from('cell_bank_vial_logs').insert({
      vial_id: params.vialId,
      action: logAction,
      batch_id: batch_id || null,
      flask_id: flask_id || null,
      operator_id: access.emp?.id || null,
      notes: notes || null,
    }).catch(() => {});

    // Return updated vial
    const { data, error } = await supabase.from('cell_bank_vials').select('*').eq('id', params.vialId).single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET /api/research/cell-bank/vials/[vialId] — fetch single vial with log
export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const [{ data: vial, error }, { data: logs }] = await Promise.all([
      supabase.from('cell_bank_vials').select('*').eq('id', params.vialId).single(),
      supabase.from('cell_bank_vial_logs')
        .select('id, action, batch_id, flask_id, notes, created_at, employees(full_name), batches(batch_id)')
        .eq('vial_id', params.vialId)
        .order('created_at', { ascending: true }),
    ]);

    if (error) throw error;
    return NextResponse.json({ success: true, data: { ...vial, logs: logs || [] } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
