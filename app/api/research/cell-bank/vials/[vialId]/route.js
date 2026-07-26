import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';
import { requireResearchAccess } from '@/lib/research/access';

export const dynamic = 'force-dynamic';


// PATCH /api/research/cell-bank/vials/[vialId]
// body: {
//   action: 'use'|'thaw'|'return'|'discard'|'ship',
//   batch_id?,         -- batch this vial is being used in
//   flask_id?,         -- specific flask
//   study_id?,         -- growth study this vial is being used in
//   cell_bank_prep_id? -- cell bank preparation this vial seeds
//   volume_used_ml?,   -- how much volume was taken from this vial
//   recovery_pct?,     -- post-thaw viability/recovery percentage (for use/thaw)
//   destination?,      -- for ship: destination lab or organization
//   notes?
// }
export async function PATCH(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireResearchAccess(supabase);
    if (access.error) return access.error;

    const adminSupabase = createAdminClient();
    const body = await request.json();
    const {
      action,
      batch_id,
      flask_id,
      study_id,
      cell_bank_prep_id,
      volume_used_ml,
      recovery_pct,
      destination,
      notes,
    } = body;

    if (!action) return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 });

    // -- Ship action -------------------------------------------------------
    if (action === 'ship') {
      await adminSupabase.from('cell_bank_vials').update({ status: 'Shipped' }).eq('id', params.vialId);
      await adminSupabase.from('cell_bank_vial_logs').insert({
        vial_id: params.vialId,
        action: 'shipped',
        destination: destination || null,
        operator_id: access.emp?.id || null,
        notes: notes || null,
        created_at: new Date().toISOString(),
      }).catch(() => {});

      const { data, error } = await adminSupabase
        .from('cell_bank_vials')
        .select('*')
        .eq('id', params.vialId)
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    const vialUpdates = {};
    let logAction;

    switch (action) {
      case 'use':
        vialUpdates.status           = 'Used';
        vialUpdates.used_in_batch_id = batch_id || null;
        vialUpdates.used_at          = new Date().toISOString();
        logAction = 'used_in_batch';
        break;
      case 'thaw':
        vialUpdates.status = 'Used';
        vialUpdates.used_at = new Date().toISOString();
        logAction = 'thawed';
        break;
      case 'return':
        vialUpdates.status           = 'Available';
        vialUpdates.used_in_batch_id = null;
        vialUpdates.used_at          = null;
        logAction = 'returned';
        break;
      case 'discard':
        vialUpdates.status = 'Discarded';
        logAction = 'discarded';
        break;
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Update vial status
    if (Object.keys(vialUpdates).length > 0) {
      const { error: updateErr } = await adminSupabase
        .from('cell_bank_vials')
        .update(vialUpdates)
        .eq('id', params.vialId);
      if (updateErr) throw updateErr;
    }

    // Enriched log entry -- includes study_id, cell_bank_prep_id, volume_used_ml, recovery_pct
    await adminSupabase.from('cell_bank_vial_logs').insert({
      vial_id:          params.vialId,
      action:           logAction,
      batch_id:         batch_id          || null,
      flask_id:         flask_id          || null,
      study_id:         study_id          || null,
      cell_bank_prep_id: cell_bank_prep_id || null,
      volume_used_ml:   volume_used_ml    || null,
      recovery_pct:     (recovery_pct !== undefined && recovery_pct !== '' && recovery_pct !== null)
                          ? parseFloat(recovery_pct)
                          : null,
      operator_id:      access.emp?.id    || null,
      notes:            notes             || null,
    }).catch(() => {});

    // -- Inventory usage record for vial consumption ----------------------
    // Created whenever a vial is actually consumed (use / discard).
    // stock_id is null here -- vials are cell bank assets, not raw material lots.
    if (['use', 'discard'].includes(action)) {
      await adminSupabase.from('inventory_usage').insert({
        vial_id:          params.vialId,
        batch_id:         batch_id          || null,
        growth_study_id:  study_id          || null,
        cell_bank_prep_id: cell_bank_prep_id || null,
        quantity_used:    volume_used_ml    || 1,   // 1 = one vial unit if volume not specified
        logged_by:        access.emp?.id    || null,
        stage:            'cell_bank',
        notes:            notes             || `Vial ${action}`,
      }).catch(() => {});
    }

    // Return updated vial
    const { data, error } = await adminSupabase
      .from('cell_bank_vials')
      .select('*')
      .eq('id', params.vialId)
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET /api/research/cell-bank/vials/[vialId] -- fetch single vial with log
export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const access = await requireResearchAccess(supabase);
    if (access.error) return access.error;

    const adminSupabase = createAdminClient();
    const [{ data: vial, error }, { data: logs }] = await Promise.all([
      adminSupabase.from('cell_bank_vials').select('*').eq('id', params.vialId).single(),
      adminSupabase.from('cell_bank_vial_logs')
        .select('id, action, batch_id, flask_id, notes, recovery_pct, destination, created_at, employees(full_name), batches(batch_id)')
        .eq('vial_id', params.vialId)
        .order('created_at', { ascending: true }),
    ]);

    if (error) throw error;
    return NextResponse.json({ success: true, data: { ...vial, logs: logs || [] } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
