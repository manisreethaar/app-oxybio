import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const batch_id = searchParams.get('batch_id');

    if (!batch_id) {
      return NextResponse.json({ ok: false, error: 'batch_id required' }, { status: 400 });
    }

    const supabase = createClient();

    // 1. Fetch Batch Details (incorporating formulation parsing)
    const { data: batch, error: batchErr } = await supabase
      .from('batches')
      .select('*, formulations(ingredients)')
      .eq('id', batch_id)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 });
    }

    if (!batch.formulations || !batch.formulations.ingredients) {
      // If no valid formulation mapping exists, assume no inventory requirements
      return NextResponse.json({ ok: true, message: 'No specified formulation requirements' });
    }

    // 2. Parse Ingredients Requirement
    let requiredIngredients = [];
    try {
      requiredIngredients = typeof batch.formulations.ingredients === 'string' 
        ? JSON.parse(batch.formulations.ingredients) 
        : batch.formulations.ingredients;
    } catch(e) { /* ignore parse error */ }
    
    if (!Array.isArray(requiredIngredients) || requiredIngredients.length === 0) {
      return NextResponse.json({ ok: true, message: 'No ingredient constraints' });
    }

    // Determine scale (if the UI sets absolute volume. Assuming quantity is standard, and we multiply by batch.volume_litres if relevant, but typically exact quantity is stored so scale is 1)
    // For now, assume physical requirement = exactly what is in formulating
    // To handle various use cases, we check what is literally listed in the JSON.
    
    // 3. Check Current Inventory Sums grouped by item_id
    const requiredItemIds = requiredIngredients.map(ing => ing.item_id);
    
    const { data: stockRecords, error: stockErr } = await supabase
      .from('inventory_stock')
      .select('item_id, current_quantity')
      .in('item_id', requiredItemIds)
      .eq('status', 'Available');

    if (stockErr) throw stockErr;

    // Aggregate physical stock into a map { "item_id": total_quantity }
    const physicalStockSums = {};
    for (const record of (stockRecords || [])) {
      physicalStockSums[record.item_id] = (physicalStockSums[record.item_id] || 0) + (record.current_quantity || 0);
    }

    // 4. Compare requirement against active stock
    const missingMaterials = [];

    for (const ing of requiredIngredients) {
      const requiredQty = parseFloat(ing.quantity || 0);
      const availableQty = physicalStockSums[ing.item_id] || 0;

      if (availableQty < requiredQty) {
        missingMaterials.push({
          item_id: ing.item_id,
          name: ing.name || 'Unknown Item',
          required: requiredQty,
          available: availableQty,
          unit: ing.unit || 'units',
          shortfall: (requiredQty - availableQty)
        });
      }
    }

    if (missingMaterials.length > 0) {
       return NextResponse.json({ 
          ok: false, 
          error: 'Insufficient inventory', 
          missing: missingMaterials 
       }, { status: 409 });
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('Inventory Check Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
