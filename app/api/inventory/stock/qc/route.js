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
//     decisions (release / reject) — the app-wide update_record_with_reason
//     RPC has no role check of its own (only e-signature identity), so this
//     server-side check is the only real authorization boundary
//   - records every action in the Movement Ledger (previously these were
//     silent from the ledger's point of view)
//   - uses the shared update_record_with_reason RPC (the same one
//     RejectionPanel.js / batch release use) so the correction reason +
//     e-signature PIN land in the same transaction as the update, and every
//     table's audit trail goes through one canonical mechanism
//
// Request body: { stock_id, action, notes, reason, pin, location?, rack?, coa_url? }
//   - notes:  the domain-specific record (QC observations / rejection cause /
//             what changed) — stored on the row itself (qc_notes,
//             rejection_reason, etc.)
//   - reason: the GDP correction-reason category from <AuditReasonModal>
//   - pin:    the e-signature PIN, verified inside update_record_with_reason

const DISPOSITION_ACTIONS = new Set(['release', 'reject']);

export async function POST(request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { stock_id, action, notes, reason, pin, location: quarantineLocation, rack, coa_url } = body;

    if (!stock_id || !action) {
      return NextResponse.json({ success: false, error: 'stock_id and action are required' }, { status: 400 });
    }

    const permission = await requireInventoryPermission(
      supabase,
      DISPOSITION_ACTIONS.has(action) ? 'qc_release' : 'edit'
    );
    if (permission.error) return permission.error;

    if (!reason || !reason.trim() || !pin) {
      return NextResponse.json({ success: false, error: 'A GDP reason and e-signature PIN are required.' }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();
    const empId = emp?.id || null;
    const nowIso = new Date().toISOString();

    let updates;
    let movementType;
    let movementNotes;

    if (action === 'release') {
      if (!notes || !notes.trim()) {
        return NextResponse.json({ success: false, error: 'QC release notes are required' }, { status: 400 });
      }
      updates = {
        status: 'Available',
        qc_status: 'Released',
        qc_released_by: empId,
        qc_released_at: nowIso,
        qc_notes: notes.trim(),
        updated_by: empId,
      };
      movementType = 'QC Release';
      movementNotes = notes.trim();
    } else if (action === 'reject') {
      if (!notes || !notes.trim()) {
        return NextResponse.json({ success: false, error: 'Rejection reason is required' }, { status: 400 });
      }
      updates = {
        status: 'Discarded',
        qc_status: 'Rejected',
        rejection_reason: notes.trim(),
        rejected_by: empId,
        rejected_at: nowIso,
        updated_by: empId,
      };
      movementType = 'Rejection';
      movementNotes = notes.trim();
    } else if (action === 'quarantine_location') {
      // Each field is edited independently (separate onBlur handlers), so
      // only touch the ones actually present in the request — otherwise a
      // blur on "location" would blank out "rack" and vice versa.
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

    const { error } = await supabase.rpc('update_record_with_reason', {
      target_table: 'inventory_stock',
      record_id: stock_id,
      payload: updates,
      reason_text: reason.trim(),
      esignature_pin: pin,
    });
    if (error) throw error;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
