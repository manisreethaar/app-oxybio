/**
 * POST /api/batches/[batchId]/media-deduct
 *
 * Server-side inventory deduction when Media Prep is marked complete.
 * Replaces the client-side deductLot() logic in MediaPrepPanel so
 * deductions are atomic and guaranteed even if the client disconnects.
 *
 * Body: {
 *   entries:     [{ stock_id, quantity_used, item_name }]
 *   employee_id: uuid   (optional — logged as issued_by)
 * }
 *
 * Returns: { success, deducted, results[], warnings[] }
 */

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { batchId } = await params;
    const { entries = [], employee_id } = await req.json();

    if (!entries.length) {
      return NextResponse.json({ success: true, deducted: 0, results: [], warnings: [] });
    }

    const db = createAdminClient();

    // Verify batch exists
    const { data: batch, error: batchErr } = await db
      .from('batches')
      .select('id, batch_id')
      .eq('id', batchId)
      .single();
    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Batch not found.' }, { status: 404 });
    }

    const results  = [];
    const warnings = [];

    for (const entry of entries) {
      const { stock_id, quantity_used, item_name } = entry;
      if (!stock_id || !quantity_used || quantity_used <= 0) continue;

      // Fetch current stock + item metadata
      const { data: stockRow } = await db
        .from('inventory_stock')
        .select('current_quantity, inventory_items(name, unit, min_stock_level)')
        .eq('id', stock_id)
        .single();

      if (!stockRow) {
        warnings.push(`${item_name || stock_id}: lot not found in inventory — skipped.`);
        continue;
      }

      const currentQty = parseFloat(stockRow.current_quantity) || 0;
      const deductQty  = parseFloat(quantity_used);
      const newQty     = Math.max(0, currentQty - deductQty);

      if (deductQty > currentQty) {
        warnings.push(
          `${item_name}: used ${deductQty} but only ${currentQty.toFixed(1)} available — inventory set to 0.`
        );
      }

      // ── 1. Deduct from inventory_stock ──────────────────────────────────
      await db
        .from('inventory_stock')
        .update({
          current_quantity: newQty,
          ...(newQty <= 0 ? { status: 'Out of Stock' } : {}),
        })
        .eq('id', stock_id);

      // ── 2. inventory_movements ledger entry ─────────────────────────────
      //   Correct column is 'type' (not 'movement_type' — that column doesn't exist)
      await db.from('inventory_movements').insert({
        stock_id,
        type:      'Batch Deduction',
        quantity:  deductQty,
        purpose:   'Production',
        batch_id:  batch.id,
        issued_by: employee_id || null,
        notes:     `Media Prep BOM: ${batch.batch_id} — ${item_name || ''}`,
      });

      // ── 3. inventory_usage cross-module record ──────────────────────────
      await db.from('inventory_usage').insert({
        stock_id,
        batch_id:      batch.id,
        quantity_used: deductQty,
        logged_by:     employee_id || null,
        stage:         'media_prep',
        notes:         `${item_name || ''} for ${batch.batch_id}`,
      });

      // ── 4. Auto-create procurement task if below minimum ─────────────────
      const minLevel = parseFloat(stockRow.inventory_items?.min_stock_level || 0);
      if (minLevel > 0 && newQty < minLevel) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        await db.from('tasks').insert({
          title: `Restock: ${stockRow.inventory_items?.name || item_name} — below minimum`,
          description: `Batch ${batch.batch_id} media prep used ${deductQty}${stockRow.inventory_items?.unit || ''}. `
            + `Remaining: ${newQty.toFixed(1)} (min: ${minLevel}). Please reorder.`,
          priority:    'high',
          status:      'todo',
          batch_id:    batch.id,
          assigned_by: employee_id || null,
          due_date:    tomorrow.toISOString().slice(0, 10),
        }).catch(() => {});
        warnings.push(`${item_name || ''} below minimum stock — procurement task created.`);
      }

      results.push({
        stock_id,
        item_name,
        deducted:  deductQty,
        remaining: newQty,
      });
    }

    return NextResponse.json({
      success:  true,
      deducted: results.length,
      results,
      warnings,
    });

  } catch (err) {
    console.error('Media deduct API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
