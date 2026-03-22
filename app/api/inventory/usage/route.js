import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { stock_id, batch_id, quantity_used } = await request.json();

    if (!stock_id || !batch_id || !quantity_used) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch current stock to have a local baseline (or use RPC for true relative update)
    const { data: stock, error: fetchErr } = await supabase
      .from('inventory_stock')
      .select('current_quantity')
      .eq('id', stock_id)
      .single();

    if (fetchErr || !stock) return NextResponse.json({ error: 'Stock item not found' }, { status: 404 });

    // 2. Perform ATOMIC TRANSACTION: Only deduct if stock is sufficient
    const { data: updatedStock, error: updateErr } = await supabase
      .from('inventory_stock')
      .update({ current_quantity: stock.current_quantity - parseFloat(quantity_used) })
      .eq('id', stock_id)
      .gte('current_quantity', parseFloat(quantity_used))
      .select()
      .single();

    if (updateErr || !updatedStock) {
      return NextResponse.json({ 
        error: 'Concurrency Error or Insufficient Stock: The inventory level changed or was too low.' 
      }, { status: 409 });
    }

    const { error: usageErr } = await supabase
      .from('inventory_usage')
      .insert({
        stock_id,
        batch_id,
        quantity_used: parseFloat(quantity_used),
        logged_by: user.id
      });

    if (usageErr) {
       // Rollback equivalent: restore the stock if the link fails
       await supabase.from('inventory_stock').update({ current_quantity: stock.current_quantity }).eq('id', stock_id);
       throw usageErr;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inventory Usage API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
