import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  getLinkedInventory, getLinkedEquipment, getLinkedDeviations,
  getLinkedLabNotebook, getLinkedShelfLife, getLinkedTasks,
  getLinkedIncubation,
} from '@/lib/batchLinks';

export const dynamic = 'force-dynamic';

// GET /api/batches/[batchId]/linked-records
// LinkedRecordsPanel used to fire all 7 (up to 10, counting getLinkedTasks'
// internal chain) linked-record queries directly from the browser on every
// batch page load, regardless of which tab was visible. Consolidating them
// into one server-side call — same pattern as /details — cuts that down to
// a single client->server round trip; the sub-queries still run in parallel,
// just server-side against Postgres directly instead of over 7-10 separate
// browser->PostgREST connections.
export async function GET(request, { params }) {
  try {
    const { batchId } = params;
    if (!batchId) {
      return NextResponse.json({ success: false, error: 'batchId required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const [inventory, equipment, notebook, deviations, shelflife, tasks, incubation] = await Promise.all([
      getLinkedInventory(supabase, batchId),
      getLinkedEquipment(supabase, batchId),
      getLinkedLabNotebook(supabase, batchId),
      getLinkedDeviations(supabase, batchId),
      getLinkedShelfLife(supabase, batchId),
      getLinkedTasks(supabase, batchId),
      getLinkedIncubation(supabase, batchId),
    ]);

    return NextResponse.json(
      { success: true, inventory, equipment, notebook, deviations, shelflife, tasks, incubation },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('API /linked-records Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
