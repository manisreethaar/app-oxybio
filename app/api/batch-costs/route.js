import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batch_id');

    let query = supabase.from('batch_costs').select('*, batches(batch_id, variant, experiment_type)').order('calculated_at', { ascending: false });
    if (batchId) query = query.eq('batch_id', batchId);

    const { data, error } = await query.limit(50);
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { batch_id, material_costs, labor_costs, overhead_costs } = body;

    if (!batch_id) return NextResponse.json({ error: 'batch_id required' }, { status: 400 });

    const total = (parseFloat(material_costs) || 0) + (parseFloat(labor_costs) || 0) + (parseFloat(overhead_costs) || 0);

    const { data, error } = await supabase.from('batch_costs').upsert({
      batch_id,
      material_costs: material_costs ? parseFloat(material_costs) : null,
      labor_costs: labor_costs ? parseFloat(labor_costs) : null,
      overhead_costs: overhead_costs ? parseFloat(overhead_costs) : null,
      total_cost: total,
      calculated_at: new Date().toISOString(),
    }, { onConflict: 'batch_id' }).select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
