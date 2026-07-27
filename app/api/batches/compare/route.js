/**
 * GET /api/batches/compare?formulation_id=X&current_batch_id=Y&limit=3
 * Returns pH readings from the last N released batches with the same formulation
 * Used by FermentationPanel to overlay historical pH trajectories
 */
import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const formulationId   = searchParams.get('formulation_id');
    const currentBatchId  = searchParams.get('current_batch_id');
    const limit           = parseInt(searchParams.get('limit') || '3', 10);

    if (!formulationId) return NextResponse.json({ error: 'formulation_id required' }, { status: 400 });

    // Find last N released batches using this formulation (exclude current)
    let batchQuery = supabase
      .from('batches')
      .select('id, batch_id, status')
      .eq('formulation_id', formulationId)
      .eq('status', 'released')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (currentBatchId) batchQuery = batchQuery.neq('id', currentBatchId);

    const { data: batches, error: bErr } = await batchQuery;
    if (bErr) throw bErr;
    if (!batches?.length) return NextResponse.json({ success: true, data: [] });

    // Fetch pH readings for those batches
    const batchIds = batches.map(b => b.id);
    const { data: readings, error: rErr } = await supabase
      .from('batch_fermentation_readings')
      .select('batch_id, flask_label, elapsed_hours, ph')
      .in('batch_id', batchIds)
      .not('ph', 'is', null)
      .not('elapsed_hours', 'is', null)
      .order('elapsed_hours', { ascending: true });

    if (rErr) throw rErr;

    // Group readings by batch_id with batch_id label
    const batchMap = Object.fromEntries(batches.map(b => [b.id, b.batch_id]));
    const grouped = {};
    (readings || []).forEach(r => {
      const label = batchMap[r.batch_id] || r.batch_id;
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push({ elapsed_hours: parseFloat(r.elapsed_hours), ph: parseFloat(r.ph), flask_label: r.flask_label });
    });

    return NextResponse.json({ success: true, data: grouped });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
