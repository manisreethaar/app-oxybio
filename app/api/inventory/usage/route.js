import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '@/lib/inventory/access';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'edit');
    if (permission.error) return permission.error;

    const { stock_id, batch_id, quantity_used } = await request.json();
    const qtyValue = parseFloat(quantity_used);

    if (!stock_id || !batch_id || isNaN(qtyValue) || qtyValue <= 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: stock, error: fetchErr } = await supabase
      .from('inventory_stock')
      .select('current_quantity')
      .eq('id', stock_id)
      .single();

    if (fetchErr || !stock) return NextResponse.json({ error: 'Stock item not found' }, { status: 404 });

    // 2. Perform ATOMIC TRANSACTION via Database RPC
    const { error: updateErr } = await supabase.rpc('deduct_inventory_stock', {
      id_to_deduct: stock_id,
      quantity_to_deduct: qtyValue
    });

    if (updateErr) {
      return NextResponse.json({ 
        error: 'Concurrency Error or Insufficient Stock: The inventory level changed or was too low.' 
      }, { status: 409 });
    }

    const { error: usageErr } = await supabase
      .from('inventory_usage')
      .insert({
        stock_id,
        batch_id,
        quantity_used: qtyValue,
        logged_by: permission.user.id
      });

    if (usageErr) {
       throw usageErr;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inventory Usage API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
