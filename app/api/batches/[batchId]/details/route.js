import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

// Allow Next.js to cache this route at the edge
export const dynamic = 'force-dynamic';

// GET /api/batches/[batchId]/details
// Single server-side call that loads EVERYTHING the batch detail page needs.
// Uses admin client (bypasses RLS). Cache is set so the browser serves
// instantly on revisit and revalidates in background — no more infinite loading.
export async function GET(request, { params }) {
  try {
    const { batchId } = params;
    if (!batchId) {
      return NextResponse.json({ success: false, error: 'batchId required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // ── PHASE 1: Core batch data (parallel) ──────────────────────────────────
    const [batchRes, flasksRes, transRes, empRes, stockRes, lnbRes, epRes, seedTrainsRes, formsRes, vialsRes, stdCurveRes] = await Promise.all([
      supabase
        .from('batches')
        .select('*, formulations(id, name, code, version, ingredients, base_volume_ml)')
        .eq('id', batchId)
        .single(),
      supabase
        .from('batch_flasks')
        .select('*')
        .eq('batch_id', batchId)
        .order('flask_label')
        .limit(100),
      supabase
        .from('stage_transitions')
        .select('*, employees!stage_transitions_changed_by_fkey(full_name)')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('employees')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name')
        .limit(500),
      supabase
        .from('inventory_stock')
        .select('*, inventory_items(name, unit, category)')
        .gt('current_quantity', 0)
        .eq('status', 'Available')
        .limit(2000),
      supabase
        .from('lab_notebook_entries')
        .select('id, flask_id')
        .eq('batch_id', batchId)
        .limit(500),
      supabase
        .from('batch_flask_endpoints')
        .select('total_hours, flask_id')
        .eq('batch_id', batchId)
        .limit(100),
      // Seed train records for ALL stages — panels get their slice by filtering locally
      supabase
        .from('batch_seed_trains')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true }),
      // Dropdown: formulations
      supabase
        .from('formulations')
        .select('id, name, version')
        .is('archived_at', null)
        .order('name')
        .limit(200),
      // Dropdown: cell bank vials
      supabase
        .from('cell_bank_vials')
        .select('id, vial_label')
        .order('vial_label')
        .limit(500),
      // Standard curve for anthrone
      supabase
        .from('standard_curves')
        .select('*')
        .eq('is_active', true)
        .eq('test_type', 'anthrone')
        .maybeSingle(),
    ]);

    if (batchRes.error) {
      return NextResponse.json({ success: false, error: batchRes.error.message }, { status: 404 });
    }

    // ── PHASE 2: Fermentation readings for all flasks (if any exist) ─────────
    const flasks = flasksRes.data || [];
    let fermentationReadings = [];
    if (flasks.length > 0) {
      const flaskIds = flasks.map(x => x.id);
      const { data: frData } = await supabase
        .from('batch_fermentation_readings')
        .select('*')
        .or(`flask_id.in.(${flaskIds.join(',')}),seed_train_id.in.(${(seedTrainsRes.data || []).map(s => s.id).join(',')})`)
        .order('logged_at', { ascending: true })
        .limit(2000);
      fermentationReadings = frData || [];
    } else {
      // Still fetch readings linked to seed trains
      const seedIds = (seedTrainsRes.data || []).map(s => s.id);
      if (seedIds.length > 0) {
        const { data: frData } = await supabase
          .from('batch_fermentation_readings')
          .select('*')
          .in('seed_train_id', seedIds)
          .order('logged_at', { ascending: true })
          .limit(2000);
        fermentationReadings = frData || [];
      }
    }

    return NextResponse.json(
      {
        success: true,
        batch: batchRes.data,
        flasks,
        transitions: transRes.data || [],
        employees: empRes.data || [],
        availableStock: stockRes.data || [],
        lnbEntries: lnbRes.data || [],
        flaskEndpoints: epRes.data || [],
        // NEW — panels consume these directly, no self-fetching
        seedTrains: seedTrainsRes.data || [],
        fermentationReadings,
        formulations: formsRes.data || [],
        vials: vialsRes.data || [],
        standardCurve: stdCurveRes.data || null,
      },
      {
        headers: {
          // FIXED: was 'no-store' — now serves from cache instantly on revisit
          // browser serves stale immediately, revalidates in background (60s window)
          'Cache-Control': 'private, max-age=0, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('API /details Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
