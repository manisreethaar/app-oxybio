import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/batches/[batchId]/details
// Fetches all batch detail page data in one server-side call.
// Uses admin client (bypasses RLS) — only accessible to logged-in users.
export async function GET(request, { params }) {
  try {
    const { batchId } = params;
    if (!batchId) {
      return NextResponse.json({ success: false, error: 'batchId required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Run all queries in parallel on the server (much faster than client-side parallel)
    const [batchRes, flasksRes, transRes, empRes, stockRes, lnbRes, epRes] = await Promise.all([
      supabase
        .from('batches')
        .select('*, formulations(id, name, code, version, ingredients, base_volume_ml)')
        .eq('id', batchId)
        .single(),
      supabase
        .from('batch_flasks')
        .select('*')
        .eq('batch_id', batchId)
        .order('flask_label'),
      supabase
        .from('stage_transitions')
        .select('*, employees!stage_transitions_changed_by_fkey(full_name)')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false }),
      supabase
        .from('employees')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('inventory_stock')
        .select('*, inventory_items(name, unit, category)')
        .gt('current_quantity', 0)
        .eq('status', 'Available'),
      supabase
        .from('lab_notebook_entries')
        .select('id, flask_id')
        .eq('batch_id', batchId),
      supabase
        .from('batch_flask_endpoints')
        .select('total_hours, flask_id')
        .eq('batch_id', batchId),
    ]);

    if (batchRes.error) {
      return NextResponse.json({ success: false, error: batchRes.error.message }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      batch:           batchRes.data,
      flasks:          flasksRes.data  || [],
      transitions:     transRes.data   || [],
      employees:       empRes.data     || [],
      availableStock:  stockRes.data   || [],
      lnbEntries:      lnbRes.data     || [],
      flaskEndpoints:  epRes.data      || [],
    });
  } catch (err) {
    console.error('Batch details API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
