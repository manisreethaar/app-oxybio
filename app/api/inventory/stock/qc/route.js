import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '@/lib/inventory/access';

export const dynamic = 'force-dynamic';

// Replaces the previous direct-from-client supabase.from('inventory_stock')
// update() calls for QC Release, Reject Lot, quarantine location, and CoA
// verification. Those had no permission check at all beyond the loose
// "authenticated" RLS policy — any logged-in user (intern included) could
// release or reject quarantined GMP raw materials. This route:
//   - enforces `inventory.qc_release` (Scientist+) for the two disposition
//     decisions (release / reject), matching how the rest of the module
//     already gates item/vendor edits to that same role group
//   - records every action in the Movement Ledger (previously these were
//     silent from the ledger's point of view)
//   - stamps `updated_by` and threads the reason through set_audit_reason
//     so the row-level audit log captures who did it and why
//
// e-signature: for 'release' and 'reject' the caller is expected to have
// already verified the user's PIN via <ESignatureModal> (POST
// /api/auth/pin/verify) before calling this route — same pattern already
// used for batch release/rejection in QCHoldPanel.js. This route does not
// re-verify the PIN itself; it trusts the permission check + the reason
// text captured alongside the e-signature prompt.

const DISPOSITION_ACTIONS = new Set(['release', 'reject']);

export async function POST(request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { stock_id, action, reason, location: quarantineLocation, rack, coa_url } = body;

    if (!stock_id || !action) {
      return NextResponse.json({ success: false, error: 'stock_id and action are required' }, { status: 400 });
    }

    const permission = await requireInventoryPermission(
      supabase,
      DISPOSITION_ACTIONS.has(action) ? 'qc_release' : 'edit'
    );
    if (permission.error) return permission.error;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();
    const empId = emp?.id || null;
    const nowIso = new Date().toISOString();

    let updates;
    let movementType;
    let movementNotes;

    if (action === 'release') {
      if (!reason || !reason.trim()) {
        return NextResponse.json({ success: false, error: 'QC release notes are required' }, { status: 400 });
      }
      updates = {
        status: 'Available',
        qc_status: 'Released',
        qc_released_by: empId,
        qc_released_at: nowIso,
        qc_notes: reason.trim(),
        updated_by: empId,
      };
      movementType = 'QC Release';
      movementNotes = reason.trim();
    } else if (action === 'reject') {
      if (!reason || !reason.trim()) {
        return NextResponse.json({ success: false, error: 'Rejection reason is required' }, { status: 400 });
      }
      updates = {
        status: 'Discarded',
        qc_status: 'Rejected',
        rejection_reason: reason.trim(),
        rejected_by: empId,
        rejected_at: nowIso,
        updated_by: empId,
      };
      movementType = 'Rejection';
      movementNotes = reason.trim();
    } else if (action === 'quarantine_location') {
      // Each field is edited independently (separate onBlur handlers), so
      // only touch the ones actually present in the request — otherwise a
      // blur on "location" would blank out "rack" and vice versa (the RPC's
      // COALESCE only preserves a field when its key is entirely absent
      // from the jsonb payload, not when it's present-but-undefined).
      updates = { updated_by: empId };
      if (Object.prototype.hasOwnProperty.call(body, 'location')) updates.quarantine_location = quarantineLocation || null;
      if (Object.prototype.hasOwnProperty.call(body, 'rack')) updates.quarantine_rack = rack || null;
      movementType = 'Quarantine Update';
      movementNotes = [quarantineLocation ? `Location: ${quarantineLocation}` : null, rack ? `Rack: ${rack}` : null].filter(Boolean).join('. ') || 'Quarantine location updated';
    } else if (action === 'coa_verify') {
      if (!coa_url || !coa_url.trim()) {
        return NextResponse.json({ success: false, error: 'CoA document URL is required' }, { status: 400 });
      }
      updates = { coa_url: coa_url.trim(), updated_by: empId };
      movementType = 'CoA Verification';
      movementNotes = `CoA verified: ${coa_url.trim()}`;
    } else {
      return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    const { data: rows, error } = await supabase.rpc('update_inventory_stock_with_reason', {
      p_id: stock_id,
      p_updates: updates,
      p_reason: (reason && reason.trim()) || `${movementType} action`
    });
    if (error) throw error;
    const data = rows?.[0];
    if (!data) return NextResponse.json({ success: false, error: 'Stock record not found' }, { status: 404 });

    // Every QC disposition/verification action now shows up in the Movement
    // Ledger, not just as a raw audit-log JSON diff.
    const { error: movementError } = await supabase
      .from('inventory_movements')
      .insert({
        stock_id,
        type: movementType,
        quantity: 0,
        purpose: movementType,
        notes: movementNotes,
        issued_by: user.id,
      });
    if (movementError) throw movementError;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
