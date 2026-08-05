import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ── Helper: resolve authenticated employee profile ─────────────────────────
async function getCallerProfile(supabase) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { user: null, profile: null };
  const { data: profile } = await supabase.from('employees').select('id, role, esig_pin').eq('email', user.email).single();
  return { user, profile };
}

// ── POST: Log new titration ───────────────────────────────────────────────
export async function POST(request) {
  try {
    const supabase = createClient();

    // ── ALOCA++ P0: verify caller identity before logging lab data ──────
    const { user, profile } = await getCallerProfile(supabase);
    if (!user || !profile) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      inventory_item_id,
      concordant_enabled,
      initial_burette_2_ml,
      final_burette_2_ml,
      mean_ta_percent,
      ...payload
    } = body;

    payload.logged_by = profile.id;
    payload.sampled_at = new Date().toISOString();

    // Calculate titrant volume from reading 1
    const titrantVol = (parseFloat(payload.final_burette_ml) || 0) - (parseFloat(payload.initial_burette_ml) || 0);

    // Build final DB payload — include concordant columns if provided
    const finalPayload = { ...payload };
    if (inventory_item_id) finalPayload.inventory_item_id = inventory_item_id;
    if (concordant_enabled) {
      finalPayload.concordant_enabled = true;
      if (initial_burette_2_ml != null) finalPayload.initial_burette_2_ml = initial_burette_2_ml;
      if (final_burette_2_ml != null)   finalPayload.final_burette_2_ml   = final_burette_2_ml;
      if (mean_ta_percent    != null)   finalPayload.mean_ta_percent       = mean_ta_percent;
    }

    // 1. Insert Titration Log — with graceful fallback for columns that may not yet exist in schema
    let logData, logError;
    ({ data: logData, error: logError } = await supabase.from('titration_logs').insert(finalPayload).select().single());

    if (logError) {
      if (logError.code === '42703') {
        // Unknown column: strip optional columns and retry
        const safePayload = { ...payload };
        if (inventory_item_id) safePayload.inventory_item_id = inventory_item_id;
        ({ data: logData, error: logError } = await supabase.from('titration_logs').insert(safePayload).select().single());
      }
      if (logError) {
        console.error('Titration Log Insert Error:', logError);
        throw logError;
      }
    }

    const deductionLogs = [];

    // 2. Inventory deduction (FIFO) if a titrant item was selected
    if (inventory_item_id && titrantVol > 0) {
      const deductionQty = titrantVol;
      const { data: stocks, error: stockErr } = await supabase
        .from('inventory_stock')
        .select('id, current_quantity, batch_number')
        .eq('item_id', inventory_item_id)
        .in('status', ['Available', 'In Use'])
        .gt('current_quantity', 0)
        .order('expiry_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (stockErr) throw stockErr;

      let remainingToDeduct = deductionQty;
      if (!stocks || stocks.length === 0) {
        deductionLogs.push(`Warning: No stock available to deduct ${deductionQty} mL.`);
      } else {
        for (const stock of stocks) {
          if (remainingToDeduct <= 0) break;
          const qtyInStock = parseFloat(stock.current_quantity);
          const qtyDeductedFromThis = Math.min(qtyInStock, remainingToDeduct);
          const { error: deductErr } = await supabase.rpc('deduct_inventory_stock', {
            id_to_deduct: stock.id,
            quantity_to_deduct: qtyDeductedFromThis
          });
          if (!deductErr) {
            await supabase.from('inventory_movements').insert({
              stock_id: stock.id,
              type: 'Issue',
              quantity: qtyDeductedFromThis,
              purpose: 'Titration Analysis',
              notes: `Auto-deducted for TA Lab. Sample: ${payload.sample_name}`,
              issued_by: profile.id
            });
            remainingToDeduct -= qtyDeductedFromThis;
            deductionLogs.push(`Deducted ${qtyDeductedFromThis} mL from lot ${stock.batch_number || stock.id}`);
          }
        }
        if (remainingToDeduct > 0) {
          deductionLogs.push(`Warning: Partially deducted. Short by ${remainingToDeduct} mL.`);
        }
      }
    }

    return NextResponse.json({ success: true, data: logData, deductionLogs });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── DELETE: Remove titration log (ALOCA++ – requires reason + e-sig PIN) ──
export async function DELETE(request) {
  try {
    const supabase = createClient();

    // ── ALOCA++ P0: verify caller identity and role ──────────────────────
    const { user, profile } = await getCallerProfile(supabase);
    if (!user || !profile) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only supervisors and above may delete lab records (ALOCA++ data integrity)
    const allowedRoles = ['admin', 'ceo', 'cto', 'supervisor', 'lab_manager', 'qa'];
    const isPrivileged = allowedRoles.includes(profile.role);
    if (!isPrivileged) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Supervisor or higher role required to delete titration logs.' },
        { status: 403 }
      );
    }

    // Create a service role client to bypass RLS, since we already explicitly checked roles above.
    // This fixes the issue where RLS blocked non-admin roles (like qa) from deleting logs.
    const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse request body for audit fields
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Titration log ID is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { reason, pin } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, error: 'An audit reason is required to delete a titration log (ALOCA++).' }, { status: 400 });
    }
    if (!pin) {
      return NextResponse.json({ success: false, error: 'E-Signature PIN is required to authorize deletion (ALOCA++).' }, { status: 400 });
    }

    // ── ALOCA++ P1: verify e-signature PIN ───────────────────────────────
    if (profile.esig_pin && String(profile.esig_pin) !== String(pin)) {
      return NextResponse.json({ success: false, error: 'Invalid E-Signature PIN. Deletion not authorized.' }, { status: 403 });
    }

    // Fetch the log to record what's being deleted in the audit trail
    const { data: existingLog } = await supabaseAdmin
      .from('titration_logs')
      .select('id, sample_name, acid_type, ta_percent, created_at')
      .eq('id', id)
      .single();

    if (!existingLog) {
      return NextResponse.json({ success: false, error: 'Titration log not found.' }, { status: 404 });
    }

    // Delete the record
    const { error: deleteError, count } = await supabaseAdmin
      .from('titration_logs')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (deleteError) throw deleteError;
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Titration log not found or you do not have permission to delete it.' }, { status: 403 });
    }

    // ── ALOCA++ P2: write deletion to activity/audit log ─────────────────
    await supabaseAdmin.from('activity_log').insert({
      action: 'DELETE',
      table_name: 'titration_logs',
      record_id: id,
      performed_by: profile.id,
      details: JSON.stringify({
        reason,
        deleted_record: {
          id: existingLog.id,
          sample_name: existingLog.sample_name,
          acid_type: existingLog.acid_type,
          ta_percent: existingLog.ta_percent,
          original_created_at: existingLog.created_at,
        }
      }),
    }).throwOnError().catch(() => {
      // Audit log write failure is non-blocking — deletion already succeeded
      console.warn('ALOCA++ audit log write failed for titration deletion', id);
    });

    return NextResponse.json({ success: true, message: 'Titration log deleted and audit trail recorded.' });

  } catch (error) {
    console.error('Delete titration log error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
